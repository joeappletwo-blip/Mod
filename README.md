# Black Steve AI — Minecraft Bedrock 1.26.50

A scripted hostile humanoid add-on prototype targeting Bedrock 1.26.50.

## Implemented

- Entity identifier: `blacksteve:stalker`
- 120 health points (60 hearts)
- Resistance V and Regeneration II continuously refreshed
- Netherite sword equipment slot configured in the entity definition
- Native Bedrock target acquisition and melee navigation
- +1 HP (half a heart) after confirmed damage; +8 HP (four hearts) after a confirmed kill
- A simulated pearl-like teleport for recovery from a stuck state, with safe-landing checks
- A bounded A* local route planner that scores candidate tunnel blocks and shares its route result with the mining controller

## Install and spawn

1. Import and activate both packs in a test world.
2. Enable script support if required by your Bedrock installation.
3. Run `/scriptevent blacksteve:spawn` as a player.

**400-block spawn limitation:** Bedrock scripts can only spawn entities in loaded chunks. The command checks for a safe landing point and reports failure when the destination area is not loaded. It does not force-load distant chunks.

You can also run `/summon blacksteve:stalker` to summon at your current command location.

## AI design

Movement and melee combat are delegated to Bedrock's native target and navigation goals. The script deliberately does not apply a competing impulse-based movement controller or a second damage loop. This avoids two independent controllers fighting over movement and avoids double damage.

The simulated pearl action is a checked teleport, not a real thrown Ender Pearl projectile. It only starts its cooldown if `tryTeleport` confirms success.

## Route planning and mining

`scripts/path_mining.js` contains a bounded A* planner. It evaluates supported walking positions, checks both feet and head clearance, rejects unloaded areas and hazards, and scores a fixed allowlist of blocks by estimated mining effort. The controller in `scripts/main.js` replans a short segment toward the nearest player every 20 ticks and asks the mining module to clear the first approved obstruction. The planner is local (18-block search radius, 5-block vertical window, 900-node cap), not a global world solver.

Mining is **opt-in per mob**. To enable it for one spawned hunter in a test world, target that entity and run `/tag @e[type=blacksteve:stalker,c=1] add blacksteve:allow_mining`. Without this tag, it computes and reports a route but does not alter blocks. Remove the tag to disable mining: `/tag @e[type=blacksteve:stalker,c=1] remove blacksteve:allow_mining`.

The allowlist includes common stone, dirt, gravel, sand, netherrack, and common plank blocks. Ores, containers, redstone/utility blocks, fluids, hazards, and unknown block types are not mined. The script cannot universally distinguish player-placed blocks from natural blocks, so even this allowlist can damage builds. Enable the tag only in a disposable world or a cleared mining test area. Clearing is instant block removal (no mining animation or drops), not tool-based mining.

## Known unfinished assets and validation

- Add a 64x64 skin PNG at `resource_packs/BlackSteveResources/textures/entity/black_steve.png`.
- The entity JSON, scripts, and resource pack still require an in-game test on the exact Bedrock 1.26.50 build.
- A real Ender Pearl projectile/throwing mechanic is not implemented.
- The navigation is Bedrock's built-in mob pathfinding, not a custom global route optimizer.
- No machine-learning model is included; tactical behavior is deterministic game logic.

Use a disposable test world first.