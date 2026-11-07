# Black Steve AI — Minecraft Bedrock 1.26.50

A behavior-pack prototype for a hostile Black Steve-style hunter. Target: **Minecraft Bedrock 1.26.50**.

## Features

- Custom entity identifier: `blacksteve:stalker`
- 120 health points (60 hearts)
- Resistance V and Regeneration II refreshed by the script
- +8 HP healing when it deals a killing blow; +1 HP after a successful hit
- Netherite sword equipped in its main hand
- Target acquisition, pursuit steering, line-of-sight checks, stuck recovery, jump decisions, and terrain-aware route scoring
- A conservative simulated ender-pearl reposition when a safe landing point can be found
- Limited block clearing for soft, non-valuable obstructions

This is a scripted game-AI system, not a trained machine-learning model. Its "reasoning" is an explicit utility/decision layer. Bedrock does not expose arbitrary access to every block or unrestricted player inventory, and this pack does not claim otherwise.

## Install

1. Enable cheats and **Beta APIs / Script APIs** if your Bedrock build requires them for script modules.
2. Import both packs from the `behavior_packs` and `resource_packs` folders into your world.
3. Activate both packs in world settings.
4. Run `/scriptevent blacksteve:spawn` to spawn the hunter 400 blocks from the nearest player.
5. Or use `/summon blacksteve:stalker` to spawn the entity at the command position (this bypasses the 400-block spawn routine).

## Controls

- `/scriptevent blacksteve:spawn` — spawn 400 blocks from the nearest player.
- `/scriptevent blacksteve:debug` — toggle decision diagnostics in chat.

## Compatibility notes

The pack uses the stable `@minecraft/server` 2.10.0 module documented for Bedrock 1.26.50. Entity JSON uses format version 1.26.50. API behavior can vary by platform/build; validate in a disposable world before using it in a primary world.

## Limitations

- The pursuit controller uses steering and local terrain scoring; it is not a full navmesh or global optimal path solver.
- Pearl movement is implemented as a scripted safe reposition, not a vanilla thrown ender-pearl projectile.
- Mining is intentionally constrained to soft blocks and will not tunnel through liquids, lava, bedrock, containers, ores, or arbitrary structures.
- A custom geometry is included; the texture path is a replaceable resource-pack asset and may need a skin PNG added for the exact desired Black Steve appearance.
