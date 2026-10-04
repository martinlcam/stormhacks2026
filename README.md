# stormhacks2026

## Challenge brief

- [Original Beyond Euclid challenge PDF](docs/beyond-euclid-challenge.pdf)
- [Searchable text, including resource links](docs/beyond-euclid-challenge.txt)

## Lighting lab

Run `bun install` and `bun run dev`, then choose **Open lighting lab** on the
game's start screen. `/` opens the landing page; `/#play` opens the game directly.

| Scene URL | What it isolates |
| --- | --- |
| `/?scene=lighting-flat` | Flat ground, a wall, hard edges, a smooth sphere, two gems and a movable amber lamp |
| `/?scene=lighting-curved` | Identical fixtures and light on a small spherical world |
| `/?scene=lighting-portals` | Flat fixtures with one portal pair leading to a second flat bay |
| `/?scene=lighting-combined` | Curved ground connected to a flat bay through the same portal pair |

Click **Enter scene**. The amber lamp starts on the pedestal directly ahead.
Use the normal WASD/mouse controls, **E** to pick up or drop the lamp or a gem,
and hold **Q** to throw. Press **Esc** to change lighting, switch scenes, restart the whole
test, or return to the game. Switching reloads the page so physics, curvature,
held items and renderer state start fresh. FPS and scene-view counts stay visible.

The fixtures share the game's movement, item physics, planet shader and portal
renderer. The reference surfaces use non-emissive materials without fog, textures
or foliage. The amber lamp combines an emissive surface with a real point light;
its light moves with it when carried, thrown or held through a portal. The light's
position is mapped onto the sphere in curved scenes. Walk around the wall and
follow the ground markers to compare lighting farther from the planet's pole. The sphere has a box collider;
it is a shading reference, not a sphere-collision test.

Use **Amber lamp** to compare illumination with the lamp on and off. **Reference
light** restores the original fixed directional light and brighter hemisphere
fill; it starts off so the lamp's effect is clear. A dim ambient fill stays on for
navigation. Test distance falloff and surface shading by moving the lamp toward
the wall, floor and sphere, then throw it and watch the pool of light follow.

These scenes are a harness for lighting work; they do not yet add cast shadows,
volumetric effects or correct the existing curved-surface normals. Without
shadows the lamp can illuminate through nearby solid objects. Its light now travels
through one portal crossing in either direction, restricted to rays passing through
the rectangular opening. Hold it in front of a doorway and move it sideways to
watch the illuminated region move inside. The transport uses the same curved
portal frames as the camera, and does not require the lamp itself to cross.
Start with flat lighting and player/object shadows, check the curvature and portal scenes
independently, then use the combined scene. Add rotated-gravity and resizing
portal cases after those pass, before integrating into the full game.

In either portal scene, choose **Doorway light test** for a repeatable close view
with the lamp on a pedestal in front of the opening. The URL adds `&view=doorway`.
Toggle **Amber lamp** to compare the far floor with and without transported light.

Choose **Lamp halfway through portal** (`&view=threshold`) to start with a lamp
suspended across the opening; pick it up with **E** to move it. The lamp renders
as two clipped portions, with the far portion transformed after curvature so
the cut edges meet. During crossing, two weighted point lights approximate the
emission from the portions on each side; their weights sum to one. This avoids
the all-or-nothing light handoff at the plane, without implementing area lights.

Scene definitions live in `src/game/lightingScenes.ts`; reusable fixtures live
in `src/world/lightingLab.ts`. Check changes with `bun test`, `bun run lint` and
`bun run build`.

## To do

- Build the spherical district: square rooms, three rooms at each corner.
- Build the hyperbolic district: square rooms, five rooms at each corner.
- Add a generator that makes hyperbolic rooms when the player comes near.
- Add stairs and more surfaces to the gravity room.
- Build the tesseract house: eight cube rooms connected as the cells of a hypercube.
- Add a 4D sculpture that turns in the plaza.
- Build the endless stairwell.
- Build the pillar that the player must go around two times.
- Add the gyroscope arrow that shows the rotation after a loop.
- Add the chalk line that draws straight paths and shows the angle sum of a triangle.
- Add forced perspective: an object that is put down becomes as large as it looks.
- Add alignment puzzles: the parts make a shape from one position only.
- Extend the lighting lab lamp's split portal rendering to the other items.
- Make items collide with each other and with the player.
- Draw each portal view only in the screen rectangle of the portal.
- Remove the short stop when the player goes through a portal.
- Bend the surface normals so that the light agrees with the curved ground.
- Add a key that sends the player back to the start.
- Add the surveyor story, and a different colour and landmark for each district.
- Add sound.
- Write the documentation.

Rules for placing structures on the planet

- Give each structure a site, because one map of the whole planet squeezes whatever is far from its centre.
- Keep each structure within 12 m of the middle of its site, because further out the site's own map starts to squeeze it.
- Keep sites at least 40 m apart, because a wall is only solid to a player who is on the map of its site.
- Keep a structure inside the half of the gap that is nearest its own site, because past the halfway line the player is on the next site's map and can walk through it.
- Put sites at least 45 m from the start, because the pillar ring is 16 m out and must stay inside the start's half of the gap.
- Mark anything that travels round the planet as rigid, because only its centre should go through the map and it must keep its own shape.
