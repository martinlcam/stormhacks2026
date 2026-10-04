# Minecraft lantern

The lantern texture, animation metadata, and block model are imported from **Minecraft Java Edition 1.21.1** by Mojang Studios / Microsoft. These third-party assets retain their original ownership; they are not covered by this repository's source-code license.

- Runtime texture: `public/textures/minecraft-lantern/lantern.png` (16 × 48 pixels, three 16 × 16 frames).
- Model: `template_lantern.json`, referenced by `lantern.json`.
- Animation: `lantern.png.mcmeta`; the identical `.json` copy supports the TypeScript JSON import. Eight game ticks per frame (0.4 seconds).
- Provenance and client SHA-1: `source.json`. The client archive was verified against Mojang's manifest before extracting these four files.

Source: [Mojang's 1.21.1 metadata](https://piston-meta.mojang.com/v1/packages/22a1966494dfa4eeb5ee778c8e6ed5b774839582/1.21.1.json), resolved through the [official version manifest](https://launchermeta.mojang.com/mc/game/version_manifest_v2.json).

The game's `src/world/lantern.ts` builds the original face geometry and UV layout, including the crossed handle planes, at 5.5 cm per texture pixel. Nearest filtering preserves the pixel art. The lantern uses the existing carry/throw physics and two-part portal light transport. It starts beside the player in the full world and on a separate pedestal in every lighting lab; the lab exposes an independent light switch and a `view=lantern` preset.
