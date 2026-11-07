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

## Install and spawn

1. Import and activate both packs in a test world.
2. Enable script support if required by your Bedrock installation.
3. Run `/scriptevent blacksteve:spawn` as a player.

**400-block spawn limitation:** Bedrock scripts can only spawn entities in loaded chunks. The command checks for a safe landing point and reports failure when the destination area is not loaded. It does not force-load distant chunks.

You can also run `/summon blacksteve:stalker` to summon at your current command location.

## AI design

Movement and melee combat are delegated to Bedrock's native target and navigation goals. The script deliberately does not apply a competing impulse-based movement controller or a second damage loop. This avoids two independent controllers fighting over movement and avoids double damage.

The simulated pearl action is a checked teleport, not a real thrown Ender Pearl projectile. It only starts its cooldown if `tryTeleport` confirms success.

## Deliberate safety restrictions

Automatic block destruction is disabled in this audited revision. Bedrock's ordinary block query does not tell this script whether a dirt, sand, gravel, wool, or stone block was player-placed. Destroying such blocks could grief builds. A future mining planner must use a protection strategy before it is enabled.

## Known unfinished assets and validation

- Add a 64x64 skin PNG at `resource_packs/BlackSteveResources/textures/entity/black_steve.png`.
- The entity JSON, scripts, and resource pack still require an in-game test on the exact Bedrock 1.26.50 build.
- A real Ender Pearl projectile/throwing mechanic is not implemented.
- The navigation is Bedrock's built-in mob pathfinding, not a custom global route optimizer.
- No machine-learning model is included; tactical behavior is deterministic game logic.

Use a disposable test world first.