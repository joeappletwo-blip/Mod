import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";
import { planMiningRoute, clearPlannedBlock } from "./path_mining.js";

const ID = "blacksteve:stalker";
const MAX_HP = 120;
const HEAL_ON_HIT = 1;       // half a heart = 1 health point
const HEAL_ON_KILL = 8;      // four hearts = 8 health points
const TICK_RATE = 5;
const DEBUG = new Set();
const state = new Map();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2 = (a, b) => {
  const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z;
  return x * x + y * y + z * z;
};
const safeCall = (fn) => { try { return fn(); } catch { return undefined; } };

function heal(entity, amount) {
  const hp = safeCall(() => entity.getComponent("minecraft:health"));
  if (!hp) return;
  safeCall(() => hp.setCurrentValue(clamp(hp.currentValue + amount, 0, MAX_HP)));
}
function maintainEffects(entity) {
  // Effect amplifier is zero-based: 4 = Resistance V; 1 = Regeneration II.
  safeCall(() => entity.addEffect("resistance", 240, { amplifier: 4, showParticles: false }));
  safeCall(() => entity.addEffect("regeneration", 240, { amplifier: 1, showParticles: false }));
}
function equip(entity) {
  const eq = safeCall(() => entity.getComponent("minecraft:equippable"));
  if (!eq) return false;
  const current = safeCall(() => eq.getEquipment(EquipmentSlot.Mainhand));
  if (current?.typeId === "minecraft:netherite_sword") return true;
  const result = safeCall(() => eq.setEquipment(
    EquipmentSlot.Mainhand, new ItemStack("minecraft:netherite_sword", 1)
  ));
  return result === true;
}
function isPlayer(entity) {
  return !!entity && entity.typeId === "minecraft:player" && entity.isValid;
}
function nearestPlayer(entity, maxRange = 512) {
  const players = safeCall(() => entity.dimension.getPlayers({
    location: entity.location, maxDistance: maxRange
  })) ?? [];
  let best = null, bestD = maxRange * maxRange;
  for (const p of players) {
    const d = dist2(entity.location, p.location);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
function blockAt(dimension, p) {
  return safeCall(() => dimension.getBlock({
    x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z)
  }));
}
function isAirLike(block) {
  if (!block) return false;
  return ["minecraft:air", "minecraft:cave_air", "minecraft:void_air",
    "minecraft:short_grass", "minecraft:tallgrass", "minecraft:snow_layer"].includes(block.typeId);
}
function safeLanding(dimension, x, z, aroundY) {
  // Refuse liquids and unknown/unloaded blocks. This prevents false-positive landing plans.
  for (let dy = 5; dy >= -8; dy--) {
    const y = Math.floor(aroundY + dy);
    const floor = blockAt(dimension, { x, y: y - 1, z });
    const feet = blockAt(dimension, { x, y, z });
    const head = blockAt(dimension, { x, y: y + 1, z });
    if (!floor || !feet || !head) continue;
    const liquid = [floor.typeId, feet.typeId, head.typeId].some(id =>
      id.includes("lava") || id.includes("water"));
    if (!liquid && !isAirLike(floor) && isAirLike(feet) && isAirLike(head)) {
      return { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 };
    }
  }
  return null;
}
function pearlLanding(entity, target) {
  const a = entity.location, t = target.location;
  const velocity = safeCall(() => target.getVelocity()) ?? { x: 0, y: 0, z: 0 };
  const predicted = {
    x: t.x + clamp(velocity.x * 8, -8, 8),
    z: t.z + clamp(velocity.z * 8, -8, 8)
  };
  const dx = predicted.x - a.x, dz = predicted.z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 18 || d > 52) return null;
  const ux = dx / d, uz = dz / d;
  const landing = safeLanding(entity.dimension, predicted.x - ux * 5, predicted.z - uz * 5, t.y);
  if (!landing) return null;
  const horizontal = Math.sqrt((landing.x - a.x) ** 2 + (landing.z - a.z) ** 2);
  const apex = Math.max(a.y, landing.y) + 7;
  if (apex - Math.min(a.y, landing.y) > 18) return null;
  return { landing, horizontal, aimAngle: Math.atan2(apex - a.y, Math.max(1, horizontal / 2)) };
}
function tryPearlReposition(entity, target, brain) {
  const plan = pearlLanding(entity, target);
  if (!plan || brain.pearlCooldown > 0) return false;

  // This is an explicitly simulated pearl-like teleport, not a thrown projectile.
  // tryTeleport returns false for blocked or unloaded destinations.
  const success = safeCall(() => entity.tryTeleport(plan.landing, {
    dimension: entity.dimension,
    checkForBlocks: true
  }));
  if (success !== true) {
    brain.lastAction = "reposition-failed";
    return false;
  }
  brain.pearlCooldown = 240;
  brain.lastAction = "simulated-pearl-teleport";
  return true;
}
function registerHunterArea(dimension, x, y, z) {
  // One named area is reused so repeated joins do not consume the world's ticking-area quota.
  safeCall(() => dimension.runCommand("tickingarea remove bs_hunt"));
  const command = `tickingarea add circle ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 2 bs_hunt`;
  const result = safeCall(() => dimension.runCommand(command));
  return result !== undefined;
}
function spawnAtDistance(player) {
  const angle = Math.random() * Math.PI * 2;
  const x = player.location.x + Math.cos(angle) * 400;
  const z = player.location.z + Math.sin(angle) * 400;
  const y = player.location.y;
  if (!registerHunterArea(player.dimension, x, y, z)) {
    player.sendMessage("§cBlack Steve: could not register a ticking area. Enable cheats and check the world's ticking-area limit.");
    return;
  }

  // Give Bedrock time to load the newly registered area before querying blocks or spawning.
  let attempts = 0;
  const trySpawn = () => {
    attempts++;
    const pos = safeLanding(player.dimension, x, z, y);
    if (!pos) {
      if (attempts < 12) {
        system.runTimeout(trySpawn, 20);
      } else {
        player.sendMessage("§cBlack Steve: the registered area did not produce a safe landing location.");
      }
      return;
    }
    const mob = safeCall(() => player.dimension.spawnEntity(ID, pos));
    if (!mob) {
      player.sendMessage("§cBlack Steve: spawn failed inside the registered ticking area.");
      return;
    }
    equip(mob);
    maintainEffects(mob);
    player.sendMessage("§8Black Steve spawned approximately 400 blocks away. Its 5×5-chunk ticking area is registered as bs_hunt.");
  };
  system.runTimeout(trySpawn, 40);
}
world.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "blacksteve:spawn") {
    const player = event.sourceEntity;
    if (isPlayer(player)) spawnAtDistance(player);
  }
  if (event.id === "blacksteve:debug") {
    const player = event.sourceEntity;
    if (isPlayer(player)) {
      if (DEBUG.has(player.id)) DEBUG.delete(player.id); else DEBUG.add(player.id);
      player.sendMessage("Black Steve AI debug: " + (DEBUG.has(player.id) ? "ON" : "OFF"));
    }
  }
});

// Spawn one hunter automatically when a player first enters the world.
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  const existing = safeCall(() => player.dimension.getEntities({ type: ID }));
  if (existing?.length) return;
  spawnAtDistance(player);
});

// Heal only when the after-event confirms that Black Steve actually damaged a target.
world.afterEvents.entityHurt.subscribe((event) => {
  const attacker = event.damageSource?.damagingEntity;
  if (attacker?.typeId === ID && event.damage > 0) heal(attacker, HEAL_ON_HIT);
});
world.afterEvents.entityDie.subscribe((event) => {
  const killer = event.damageSource?.damagingEntity;
  if (killer?.typeId === ID) heal(killer, HEAL_ON_KILL);
});

system.runInterval(() => {
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = safeCall(() => world.getDimension(dimensionId));
    if (!dimension) continue;
    const mobs = safeCall(() => dimension.getEntities({ type: ID })) ?? [];
    for (const mob of mobs) {
      if (!state.has(mob.id)) state.set(mob.id, {
        pearlCooldown: 0, stuckTicks: 0, routeTicks: 0, miningCooldown: 0, routeStatus: "idle",
        previous: { ...mob.location }, lastAction: "native-nav"
      });
      const brain = state.get(mob.id);
      brain.pearlCooldown = Math.max(0, brain.pearlCooldown - TICK_RATE);
      brain.miningCooldown = Math.max(0, brain.miningCooldown - TICK_RATE);
      brain.routeTicks -= TICK_RATE;
      maintainEffects(mob);
      equip(mob);

      // Native Bedrock target + melee goals own movement and combat.
      // Do not apply a second impulse controller or duplicate scripted damage.
      const target = nearestPlayer(mob, 512);
      if (!target) {
        brain.stuckTicks = 0;
        continue;
      }

      const distance = Math.sqrt(dist2(mob.location, target.location));

      // Re-plan a short local segment so distant targets do not exceed the A* search bounds.
      // Native Bedrock navigation still moves the mob; this module selects safe tunnel blocks
      // that obstruct a low-cost supported route and clears at most one per cooldown.
      if (brain.routeTicks <= 0) {
        const dx = target.location.x - mob.location.x;
        const dz = target.location.z - mob.location.z;
        const horizontal = Math.max(1, Math.sqrt(dx*dx + dz*dz));
        const segment = Math.min(12, horizontal);
        const routeGoal = {
          x: mob.location.x + dx / horizontal * segment,
          y: mob.location.y + clamp(target.location.y - mob.location.y, -3, 3),
          z: mob.location.z + dz / horizontal * segment
        };
        const route = safeCall(() => planMiningRoute(mob.dimension, mob.location, routeGoal));
        brain.routeStatus = route?.status ?? "planner-error";
        brain.routeCost = route?.cost ?? null;
        brain.routeVisited = route?.visited ?? 0;
        if (route?.status === "route" && route.firstBlocker && brain.miningCooldown <= 0) {
          const cleared = safeCall(() => clearPlannedBlock(mob.dimension, mob, route.firstBlocker));
          brain.lastAction = cleared?.status === "cleared"
            ? "path-block-cleared:" + cleared.typeId
            : "path-block-" + (cleared?.status ?? "error");
          if (cleared?.status === "cleared") brain.miningCooldown = 20;
        } else if (route?.status === "route") {
          brain.lastAction = "route-clear";
        }
        brain.routeTicks = 20;
      }

      const moved = dist2(mob.location, brain.previous);
      brain.stuckTicks = moved < 0.08 && distance > 4 ? brain.stuckTicks + TICK_RATE : 0;
      brain.previous = { ...mob.location };

      if (brain.stuckTicks > 80) {
        if (!tryPearlReposition(mob, target, brain)) {
          brain.lastAction = "native-nav-stuck";
        }
        brain.stuckTicks = 0;
      }
      if (DEBUG.size) {
        for (const p of dimension.getPlayers()) {
          if (DEBUG.has(p.id) && dist2(p.location, mob.location) < 64 * 64) {
            p.sendMessage(`§7[Black Steve] distance=${distance.toFixed(1)} route=${brain.routeStatus} cost=${brain.routeCost ?? "-"} visited=${brain.routeVisited ?? 0} action=${brain.lastAction} stuck=${brain.stuckTicks}`);
          }
        }
      }
    }
  }
}, TICK_RATE);
