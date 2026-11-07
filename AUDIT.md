# Code audit — 2026-11-07

## Changes applied

1. Added `minecraft:equippable` with a Netherite sword main-hand slot. The earlier script could not equip the sword because the component was absent.
2. Removed the custom impulse-driven movement and duplicate scripted damage. Native Bedrock target selection and melee navigation now control pursuit and combat, avoiding two movement controllers and double attacks.
3. Kept healing tied to confirmed `entityHurt` and `entityDie` events with Black Steve as the damaging entity.
4. Replaced the unverified teleport success assumption with `Entity.tryTeleport`; the cooldown is set only when the API returns true.
5. Tightened safe-landing checks to reject water, lava, unknown blocks, and unloaded chunks.
6. Disabled automatic block destruction. A normal block query cannot reliably distinguish player-placed dirt/sand/wool/stone from naturally generated blocks, so the previous implementation could destroy builds.
7. Rewrote README limitations to distinguish implemented features from unimplemented or unverified ones.

## Confirmed API/documentation checks

- Bedrock 1.26.50 released `@minecraft/server` 2.10.0.
- `minecraft:equippable` is the entity component for equipment slots.
- `Entity.tryTeleport` reports success/failure and may fail for unloaded chunks or obstructed destinations.
- `Dimension.getBlock` returns undefined for unloaded chunks; `Dimension.spawnEntity` should only be used in loaded chunks.
- `EntityDieAfterEvent.damageSource` and `EntityHurtAfterEvent.damageSource` are documented event properties.

## New path-planning implementation

- Added `scripts/path_mining.js` with bounded A* search (900 expanded nodes maximum, 18-block horizontal radius, 5-block vertical window), supported walking nodes, feet/head clearance checks, hazard rejection, an explicit block allowlist, and weighted estimated mining costs.
- Updated `scripts/main.js` to replan a 12-block local segment toward the nearest player every 20 ticks, select the first obstruction on the route, and call the mining module. It clears at most one block per 20-tick cooldown and only when the mob has the `blacksteve:allow_mining` tag.
- The planner rejects unknown/unloaded blocks and never treats an unknown block as mineable. It does not mine ores, containers, hazards, fluids, redstone/utility blocks, or blocks outside the allowlist.

## Remaining limitations / risks

- **400-block spawn is conditional.** The target chunk must already be loaded. The pack currently reports failure instead of force-loading chunks. At a typical render/simulation distance, a point 400 blocks away will often be unloaded.
- **No actual Ender Pearl projectile.** Recovery uses a safe scripted teleport. It is not a thrown item, has no projectile arc/collision, and does not consume an inventory pearl.
- **No custom global path solver.** Native Bedrock mob navigation now handles pathfinding. It is safer than the conflicting impulse controller, but it is not a custom optimal route/mining planner.
- **Mining is opt-in, not inherently grief-proof.** The new A* planner and mining controller share a local route and only clear an explicit allowlist, but the API does not reliably identify player-placed blocks. The mob must be tagged `blacksteve:allow_mining`; only enable this in a disposable world or a cleared test area. Removal is instant and produces no drops.
- **Planner/native navigator are coordinated, not identical.** The A* module predicts a bounded, supported tunnel segment and clears its first approved obstruction; native Bedrock navigation still chooses the mob's actual movement route. This implementation does not guarantee that the mob follows every A* waypoint exactly.
- **Texture PNG is missing.** Add `resource_packs/BlackSteveResources/textures/entity/black_steve.png` (64x64) or the model may render with a missing texture.
- **No in-game runtime test has been performed.** JSON/schema and API review cannot prove behavior in the actual 1.26.50 client/server. Test in a disposable world and inspect Content Log output.

## Suggested in-game test sequence

1. Activate both packs in a new creative test world with scripts enabled.
2. Check Content Log for manifest, entity JSON, geometry, texture, and script errors.
3. Run `/summon blacksteve:stalker`; verify appearance, health, held sword, effects, and target acquisition.
4. Let it hit a passive mob; verify health increases by 1 HP after damage.
5. Let it deliver a killing blow; verify the additional 8 HP kill heal.
6. Test pursuit across flat ground, doors, water edges, stairs, caves, and cliffs.
7. Run `/scriptevent blacksteve:spawn` and confirm the destination-chunk limitation is reported correctly when the area is unloaded.
8. Test the simulated pearl recovery near a safe loaded landing location and near blocked/unloaded landing locations.
