import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";

const ID = "blacksteve:stalker";
const MAX_HP = 120;
const HEAL_ON_HIT = 1;
const HEAL_ON_KILL = 8;
const TICK_RATE = 5;
const DEBUG = new Set();
const state = new Map();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2 = (a, b) => {
  const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z;
  return x * x + y * y + z * z;
};
const norm = (v) => {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const safeCall = (fn) => { try { return fn(); } catch { return undefined; } };

function heal(entity, amount) {
  const hp = safeCall(() => entity.getComponent("minecraft:health"));
  if (!hp) return;
  safeCall(() => hp.setCurrentValue(clamp(hp.currentValue + amount, 0, MAX_HP)));
}
function maintainEffects(entity) {
  safeCall(() => entity.addEffect("resistance", 240, { amplifier: 4, showParticles: false }));
  safeCall(() => entity.addEffect("regeneration", 240, { amplifier: 1, showParticles: false }));
}
function equip(entity) {
  const eq = safeCall(() => entity.getComponent("minecraft:equippable"));
  if (!eq) return;
  safeCall(() => {
    if (!eq.getEquipment(EquipmentSlot.Mainhand)) {
      eq.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:netherite_sword", 1));
    }
  });
}
function isPlayer(entity) {
  return entity && entity.typeId === "minecraft:player" && entity.isValid;
}
function nearestPlayer(entity, maxRange = 512) {
  const players = safeCall(() => entity.dimension.getPlayers({ location: entity.location, maxDistance: maxRange })) ?? [];
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
function isPassable(block) {
  if (!block) return false;
  const id = block.typeId;
  return id === "minecraft:air" || id === "minecraft:cave_air" ||
    id === "minecraft:water" || id === "minecraft:short_grass" ||
    id === "minecraft:tallgrass" || id === "minecraft:snow_layer";
}
function isSoftMineable(block) {
  if (!block) return false;
  const id = block.typeId;
  const deny = ["bedrock", "obsidian", "crying_obsidian", "ancient_debris", "chest",
    "trapped_chest", "barrel", "spawner", "command_block", "end_portal", "end_gateway",
    "lava", "water", "diamond_ore", "emerald_ore", "gold_ore", "iron_ore",
    "redstone_ore", "lapis_ore", "copper_ore"];
  if (deny.some(x => id.includes(x))) return false;
  return id.includes("dirt") || id.includes("sand") || id.includes("gravel") ||
    id.includes("netherrack") || id.includes("leaves") || id.includes("wool") ||
    id.includes("snow") || id.includes("mud") || id.includes("clay");
}

// Scores a small set of forward/diagonal candidates. Lower is better.
function chooseSteering(entity, target) {
  const from = entity.location;
  const to = target.location;
  const direct = norm({ x: to.x - from.x, y: 0, z: to.z - from.z });
  const candidates = [
    direct,
    norm({ x: direct.x + direct.z * 0.75, y: 0, z: direct.z - direct.x * 0.75 }),
    norm({ x: direct.x - direct.z * 0.75, y: 0, z: direct.z + direct.x * 0.75 }),
    norm({ x: -direct.x, y: 0, z: -direct.z })
  ];
  let best = candidates[0], bestScore = Infinity;
  for (const v of candidates) {
    const probe = { x: from.x + v.x * 2.2, y: from.y, z: from.z + v.z * 2.2 };
    const feet = blockAt(entity.dimension, probe);
    const head = blockAt(entity.dimension, { x: probe.x, y: probe.y + 1, z: probe.z });
    const floor = blockAt(entity.dimension, { x: probe.x, y: probe.y - 1, z: probe.z });
    let score = (1 - (v.x * direct.x + v.z * direct.z)) * 5;
    if (!feet || !head || !floor) score += 100;
    else {
      if (!isPassable(feet)) score += 18;
      if (!isPassable(head)) score += 14;
      if (isPassable(floor)) score += 10;
      if (floor.typeId.includes("lava")) score += 1000;
      if (floor.typeId.includes("water")) score += 3;
    }
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return { direction: best, blocked: bestScore > 20 };
}

function tryClearSoftObstacle(entity, direction) {
  const p = entity.location;
  const candidates = [
    { x: p.x + direction.x * 1.2, y: p.y, z: p.z + direction.z * 1.2 },
    { x: p.x + direction.x * 1.2, y: p.y + 1, z: p.z + direction.z * 1.2 }
  ];
  for (const pos of candidates) {
    const b = blockAt(entity.dimension, pos);
    if (isSoftMineable(b)) {
      safeCall(() => b.setType("minecraft:air"));
      return true;
    }
  }
  return false;
}
function safeLanding(dimension, x, z, aroundY) {
  for (let dy = 5; dy >= -8; dy--) {
    const y = Math.floor(aroundY + dy);
    const floor = blockAt(dimension, { x, y: y - 1, z });
    const feet = blockAt(dimension, { x, y, z });
    const head = blockAt(dimension, { x, y: y + 1, z });
    if (floor && feet && head && !isPassable(floor) && isPassable(feet) && isPassable(head) &&
        !floor.typeId.includes("lava")) return { x: x + 0.5, y, z: z + 0.5 };
  }
  return null;
}
// Ballistic estimate used to reject unsafe pearl-like repositioning.
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
  // Aim for a point 4–7 blocks short of the predicted player position.
  const landing = safeLanding(entity.dimension, predicted.x - ux * 5, predicted.z - uz * 5, t.y);
  if (!landing) return null;
  const horizontal = Math.sqrt((landing.x - a.x) ** 2 + (landing.z - a.z) ** 2);
  const flightTicks = clamp(horizontal / 1.8, 12, 30);
  const apex = Math.max(a.y, landing.y) + 7;
  if (apex - Math.min(a.y, landing.y) > 18) return null;
  return { landing, flightTicks, aimAngle: Math.atan2(apex - a.y, horizontal / 2) };
}
function tryPearlReposition(entity, target, brain) {
  const plan = pearlLanding(entity, target);
  if (!plan || brain.pearlCooldown > 0) return false;
  // Safe teleport is deliberate: Bedrock script APIs do not expose a universal vanilla pearl AI throw primitive.
  safeCall(() => entity.teleport(plan.landing, { dimension: entity.dimension, checkForBlocks: true }));
  brain.pearlCooldown = 240;
  brain.lastAction = "safe-teleport";
  return true;
}
function jumpIfNeeded(entity, blocked, targetDistance) {
  if (blocked && targetDistance > 3) {
    safeCall(() => entity.applyImpulse({ x: 0, y: 0.42, z: 0 }));
  }
}
function attack(entity, target, brain) {
  if (brain.attackCooldown > 0 || dist2(entity.location, target.location) > 3.1 * 3.1) return;
  brain.attackCooldown = 12;
  safeCall(() => target.applyDamage(9, { damagingEntity: entity }));
  // A hit event also awards healing, so this only maintains the attack cadence.
  brain.lastAction = "melee";
}
function spawnAtDistance(player) {
  const angle = Math.random() * Math.PI * 2;
  const x = player.location.x + Math.cos(angle) * 400;
  const z = player.location.z + Math.sin(angle) * 400;
  const pos = safeLanding(player.dimension, x, z, player.location.y);
  if (!pos) {
    player.sendMessage("§cBlack Steve AI: no safe surface found 400 blocks away. Try another area.");
    return;
  }
  const mob = safeCall(() => player.dimension.spawnEntity(ID, pos));
  if (mob) {
    equip(mob);
    maintainEffects(mob);
    player.sendMessage("§8Black Steve has spawned approximately 400 blocks away.");
  }
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

world.afterEvents.entityHurt.subscribe((event) => {
  const attacker = event.damageSource?.damagingEntity;
  if (attacker?.typeId === ID) heal(attacker, HEAL_ON_HIT);
});
world.afterEvents.entityDie.subscribe((event) => {
  const killer = event.damageSource?.damagingEntity;
  if (killer?.typeId === ID) heal(killer, HEAL_ON_KILL);
});

system.runInterval(() => {
  for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
    const mobs = safeCall(() => dimension.getEntities({ type: ID })) ?? [];
    for (const mob of mobs) {
      if (!state.has(mob.id)) state.set(mob.id, {
        attackCooldown: 0, pearlCooldown: 0, stuckTicks: 0,
        previous: { ...mob.location }, lastAction: "acquire"
      });
      const brain = state.get(mob.id);
      brain.attackCooldown = Math.max(0, brain.attackCooldown - TICK_RATE);
      brain.pearlCooldown = Math.max(0, brain.pearlCooldown - TICK_RATE);
      maintainEffects(mob);
      equip(mob);

      const target = nearestPlayer(mob, 512);
      if (!target) continue;
      const d2 = dist2(mob.location, target.location);
      const distance = Math.sqrt(d2);
      if (distance <= 3.1) { attack(mob, target, brain); continue; }

      const { direction, blocked } = chooseSteering(mob, target);
      const velocity = safeCall(() => mob.getVelocity()) ?? { x: 0, y: 0, z: 0 };
      const speed = distance > 24 ? 0.34 : 0.26;
      safeCall(() => mob.applyImpulse({
        x: direction.x * speed - velocity.x * 0.12,
        y: 0,
        z: direction.z * speed - velocity.z * 0.12
      }));
      jumpIfNeeded(mob, blocked, distance);
      if (blocked) tryClearSoftObstacle(mob, direction);

      const moved = dist2(mob.location, brain.previous);
      brain.stuckTicks = moved < 0.08 ? brain.stuckTicks + TICK_RATE : 0;
      brain.previous = { ...mob.location };
      if (brain.stuckTicks > 80) {
        if (!tryPearlReposition(mob, target, brain)) {
          safeCall(() => mob.teleport({
            x: mob.location.x + direction.x * 2,
            y: mob.location.y + 1,
            z: mob.location.z + direction.z * 2
          }, { dimension: mob.dimension, checkForBlocks: true }));
        }
        brain.stuckTicks = 0;
      } else if (distance > 28 && distance < 52 && Math.random() < 0.015) {
        tryPearlReposition(mob, target, brain);
      }
      if (DEBUG.size) {
        for (const p of dimension.getPlayers()) if (DEBUG.has(p.id) && dist2(p.location, mob.location) < 64 * 64) {
          p.sendMessage(`§7[Black Steve] d=${distance.toFixed(1)} action=${brain.lastAction} stuck=${brain.stuckTicks}`);
        }
      }
    }
  }
}, TICK_RATE);
