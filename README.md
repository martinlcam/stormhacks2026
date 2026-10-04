# stormhacks2026

## Challenge brief

- [Original Beyond Euclid challenge PDF](docs/beyond-euclid-challenge.pdf)
- [Searchable text, including resource links](docs/beyond-euclid-challenge.txt)

## Landing page

`/` opens the landing page: the story from the Figma file (WU), told by scrolling.
The title's coloured lights spread like watercolour from small blots, join as
they meet and cover the page, then fade to white paper while the words gather
into a black ball. The ball rises and becomes a raindrop, which falls through
the two drawings as the artist's timelapses paint them, their captions wipe in
and their gems glow, and splashes into blue water. Then "click to enter" comes
up faintly in the water, and a click anywhere goes into the game. Everything follows the scroll, so scrolling up
plays it backwards. The code is in `src/landing/`, the images in `public/landing/`.

| Address | What it does |
| --- | --- |
| `/?p=0.5` | Opens the story part of the way through |
| `/?auto` or `/?auto=60` | Scrolls by itself, over 45 or 60 seconds |
| `/?flags` | Shows a panel for switching the flags below |
| `/#play` | Skips the story |

Flags choose between versions we are still deciding on. Each has a default and can
be set in the address. They are listed in `src/flags.ts`; once we choose, delete
the other version and its flag.

| Flag | Options | What it changes |
| --- | --- | --- |
| `draw` | `speedpaint`, `fade`, `speedraw` | How each drawing comes in: the artist's watercolour timelapse played with the scroll, a fade, or its pencil lines drawn first |
| `glow` | `on`, `off` | The gem glows on a layer of its own |
| `grain` | `on`, `off` | The grain texture from the Figma file, in the title's paint and over the drawings |
| `water` | `texture`, `plain` | The water painted from the blue texture in the Figma file, or plain |
| `sound` | `on`, `off` | The sound button: wind, rain, a chime for the gem and a drip for the splash |
| `sky` | `subtle`, `grainy` | The grain in the game's sky |

## Lighting in the full world

Open `/#play` or enter from the landing page. You start holding the amber lamp,
already lit. Press **E** to put it down or pick it up again, or hold **Q** to throw
it through the world. It illuminates the ground, objects, and spaces visible through
doorways. Its position follows the planet's regions; resizing doors scale its
range and strength along with the lamp, and a lamp halfway through a doorway
illuminates both sides. The lab and full world use the same lamp implementation.

The existing sky, daylight, and ambient fill remain active. The lamp's direct
light uses the textured ground's curved orientation. Cast shadows, volumetric
beams, and light paths through multiple successive portals are still pending.

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
volumetric effects or correct all curved-surface normals. Without
shadows the lamp can illuminate through nearby solid objects. Its light now travels
through one portal crossing in either direction, restricted to rays passing through
the rectangular opening. Hold it in front of a doorway and move it sideways to
watch the illuminated region move inside. The transport uses the same curved
portal frames as the camera, and does not require the lamp itself to cross.
Start with flat lighting and player/object shadows, check the curvature and portal scenes
independently, then use the combined scene. The shared lamp also runs in the full
game, with regression checks for different planet regions, rotated-gravity doors,
and resizing doors.

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
- Build the pillar that the player must go around two times.
- Add the gyroscope arrow that shows the rotation after a loop.
- Add the chalk line that draws straight paths and shows the angle sum of a triangle.
- Add forced perspective: an object that is put down becomes as large as it looks.
- Add alignment puzzles: the parts make a shape from one position only.
- Extend the lighting lab lamp's split portal rendering to the other items.
- Draw each portal view only in the screen rectangle of the portal.
- Remove the short stop when the player goes through a portal.
- Bend the surface normals so that the light agrees with the curved ground.
- Add the surveyor story, and a different colour and landmark for each district.
- Write the documentation.

Rules for placing structures on the planet

- Give each structure a site, because one map of the whole planet squeezes whatever is far from its centre.
- Keep each structure within 12 m of the middle of its site, because further out the site's own map starts to squeeze it.
- Keep sites at least 40 m apart, because a wall is only solid to a player who is on the map of its site.
- Keep a structure inside the half of the gap that is nearest its own site, because past the halfway line the player is on the next site's map and can walk through it.
- Put sites at least 45 m from the start, because the pillar ring is 16 m out and must stay inside the start's half of the gap.
- Every exhibit now stands at the start, within 14 m of it, so that none is a long walk away; sites are for what is built later.
- Mark anything that travels round the planet as rigid, because only its centre should go through the map and it must keep its own shape.
