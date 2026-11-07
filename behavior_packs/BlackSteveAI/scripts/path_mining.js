// Bounded A* route planner and conservative block-clearing policy for Black Steve.
// This is an advisory tunnel planner: Bedrock's native mob navigation still owns movement.
// A cleared corridor can make the native navigator's next route shorter/more direct.

const MAX_NODES = 900;
const MAX_RADIUS = 18;
const MAX_VERTICAL = 5;
const MAX_MINING_COST = 34;

// Explicit allowlist. Unknown blocks are NEVER considered mineable.
const MINE_COST = new Map([
  ["minecraft:stone", 2], ["minecraft:granite", 2], ["minecraft:diorite", 2],
  ["minecraft:andesite", 2], ["minecraft:deepslate", 4],
  ["minecraft:cobblestone", 2], ["minecraft:cobbled_deepslate", 4],
  ["minecraft:dirt", 1], ["minecraft:coarse_dirt", 1], ["minecraft:rooted_dirt", 2],
  ["minecraft:grass_block", 2], ["minecraft:podzol", 2], ["minecraft:mycelium", 2],
  ["minecraft:gravel", 1], ["minecraft:sand", 1], ["minecraft:red_sand", 1],
  ["minecraft:sandstone", 2], ["minecraft:red_sandstone", 2],
  ["minecraft:netherrack", 1], ["minecraft:blackstone", 3],
  ["minecraft:basalt", 3], ["minecraft:smooth_basalt", 3],
  ["minecraft:end_stone", 3], ["minecraft:prismarine", 4],
  ["minecraft:oak_planks", 2], ["minecraft:spruce_planks", 2],
  ["minecraft:birch_planks", 2], ["minecraft:jungle_planks", 2],
  ["minecraft:acacia_planks", 2], ["minecraft:dark_oak_planks", 2],
  ["minecraft:mangrove_planks", 2], ["minecraft:cherry_planks", 2],
  ["minecraft:bamboo_planks", 2], ["minecraft:crimson_planks", 2],
  ["minecraft:warped_planks", 2]
]);

const AIR = new Set([
  "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:fern",
  "minecraft:large_fern", "minecraft:deadbush", "minecraft:snow_layer"
]);
const LIQUID = id => id.includes("water") || id.includes("lava");
const posKey = p => `${p.x},${p.y},${p.z}`;
const heuristic = (a, b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y)*1.4 + Math.abs(a.z-b.z);

function getBlock(dimension, p) {
  try { return dimension.getBlock(p); } catch { return undefined; }
}
function blockCost(block) {
  if (!block) return Infinity; // unloaded/unknown: don't route through it
  if (AIR.has(block.typeId)) return 0;
  if (LIQUID(block.typeId)) return Infinity;
  // Never mine containers, block entities, ores, redstone, utility blocks or unknown blocks.
  if (block.getComponent?.("minecraft:inventory")) return Infinity;
  const cost = MINE_COST.get(block.typeId);
  return cost === undefined ? Infinity : cost;
}
function isSafeSupport(block) {
  if (!block || AIR.has(block.typeId) || LIQUID(block.typeId)) return false;
  return true;
}
function nodeInfo(dimension, feetPos) {
  const feet = getBlock(dimension, feetPos);
  const head = getBlock(dimension, {x:feetPos.x,y:feetPos.y+1,z:feetPos.z});
  const floor = getBlock(dimension, {x:feetPos.x,y:feetPos.y-1,z:feetPos.z});
  if (!feet || !head || !floor || !isSafeSupport(floor)) return null;
  const a = blockCost(feet), b = blockCost(head);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const blockers = [];
  if (a > 0) blockers.push({x:feetPos.x,y:feetPos.y,z:feetPos.z,typeId:feet.typeId,cost:a});
  if (b > 0) blockers.push({x:feetPos.x,y:feetPos.y+1,z:feetPos.z,typeId:head.typeId,cost:b});
  return { blockers, cost: 1 + a + b };
}

// A* over supported walking positions. Vertical transitions are limited to one block.
export function planMiningRoute(dimension, startLocation, targetLocation) {
  const start = {x:Math.floor(startLocation.x),y:Math.floor(startLocation.y),z:Math.floor(startLocation.z)};
  const goal = {x:Math.floor(targetLocation.x),y:Math.floor(targetLocation.y),z:Math.floor(targetLocation.z)};
  const open = [{p:start,g:0,f:heuristic(start,goal)}];
  const cameFrom = new Map(), gScore = new Map([[posKey(start),0]]);
  const infoByKey = new Map();
  let visited = 0, reached = null;

  while (open.length && visited < MAX_NODES) {
    open.sort((a,b)=>a.f-b.f);
    const current = open.shift(), ck = posKey(current.p);
    if (current.g !== gScore.get(ck)) continue;
    visited++;
    if (Math.abs(current.p.x-goal.x)<=1 && Math.abs(current.p.z-goal.z)<=1 &&
        Math.abs(current.p.y-goal.y)<=1) { reached = current.p; break; }

    for (let dx=-1;dx<=1;dx++) for (let dz=-1;dz<=1;dz++) {
      if (dx===0 && dz===0) continue;
      for (let dy=-1;dy<=1;dy++) {
        if (Math.abs(dy)===1 && dx!==0 && dz!==0) continue;
        const next = {x:current.p.x+dx,y:current.p.y+dy,z:current.p.z+dz};
        if (Math.abs(next.x-start.x)>MAX_RADIUS || Math.abs(next.z-start.z)>MAX_RADIUS ||
            Math.abs(next.y-start.y)>MAX_VERTICAL) continue;
        const info = nodeInfo(dimension,next);
        if (!info) continue;
        const nk = posKey(next), tentative = current.g + info.cost + (dy===1?0.7:0);
        if (tentative > MAX_MINING_COST || tentative >= (gScore.get(nk) ?? Infinity)) continue;
        cameFrom.set(nk,ck); gScore.set(nk,tentative); infoByKey.set(nk,info);
        open.push({p:next,g:tentative,f:tentative+heuristic(next,goal)});
      }
    }
  }

  if (!reached) return {status:"no-route",visited,steps:[]};
  const steps = [];
  let key = posKey(reached);
  while (key !== posKey(start)) {
    const [x,y,z] = key.split(",").map(Number);
    steps.push({position:{x,y,z}, ...(infoByKey.get(key) ?? {blockers:[]})});
    key = cameFrom.get(key);
    if (!key) return {status:"broken-parent-chain",visited,steps:[]};
  }
  steps.reverse();
  const firstBlocker = steps.flatMap(s=>s.blockers).find(b=>b);
  return {status:"route",visited,steps,firstBlocker,cost:gScore.get(posKey(reached))};
}

// Actual clearing is opt-in per mob via /tag <entity> add blacksteve:allow_mining.
// Even with opt-in, only the allowlisted blocks above can be removed.
// Bedrock does not expose a universal player-placed-block provenance flag.
export function clearPlannedBlock(dimension, mob, blocker) {
  if (!mob.hasTag("blacksteve:allow_mining")) return {status:"disabled"};
  if (!blocker || !MINE_COST.has(blocker.typeId)) return {status:"rejected"};
  const block = getBlock(dimension, blocker);
  if (!block || block.typeId !== blocker.typeId) return {status:"changed-or-unloaded"};
  if (block.getComponent?.("minecraft:inventory")) return {status:"protected-container"};
  try {
    block.setType("minecraft:air");
    return {status:"cleared",typeId:blocker.typeId};
  } catch {
    return {status:"failed"};
  }
}
