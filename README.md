# Black Steve AI — Minecraft Bedrock 1.26.50

## Features
- Black Steve entity: `blacksteve:stalker`, 120 HP (60 hearts)
- Resistance V and Regeneration II, continuously refreshed
- Netherite sword, healing on confirmed hits and kills
- Faster movement (0.42 base movement; 1.6 melee speed multiplier)
- Targets players within 512 blocks
- Automatically attempts to spawn once when a player first joins, approximately 400 blocks away
- Registers a named radius-2 circular ticking area (`bs_hunt`) at the spawn destination before spawning
- Bounded A* route planner with continuous mining: every block except bedrock is eligible

## Install
1. Import and activate both the behavior pack and resource pack.
2. Enable cheats; the automatic distant spawn uses the Bedrock `tickingarea` command.
3. Join the world. On initial player spawn, Black Steve registers its ticking area and attempts to spawn after the chunks load.
4. Manual spawn remains available with `/scriptevent blacksteve:spawn`. Direct summon: `/summon blacksteve:stalker`.

## Important Bedrock limits and destructive behavior
- Ticking areas are bounded by Bedrock's world limits and the world's ticking-area quota. This add-on reuses the single named area `bs_hunt`; it does not create an unlimited chunk loader.
- The spawn routine retries safe-landing checks while the destination loads. If the command is denied or the ticking-area quota is exhausted, spawning fails with a chat message.
- Mining is always enabled. Black Steve can remove any block except bedrock, including containers, ores, redstone, fluids, and player-built blocks. Clearing is instant block replacement with air; it does not produce drops or use a mining animation. Container contents/builds can be destroyed. Test in a disposable world and keep backups.
- The A* planner is local and bounded (18-block horizontal radius, 5-block vertical window, 900-node cap). Bedrock's native navigation still controls movement; the planner clears a nearby obstruction rather than directly steering the mob.
- No in-game testing has been performed. Validate on the exact Bedrock 1.26.50 build.

## Commands
- `/scriptevent blacksteve:spawn` — register area and spawn about 400 blocks away
- `/scriptevent blacksteve:debug` — toggle nearby debug output
- `/summon blacksteve:stalker` — summon at command location
