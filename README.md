# stormhacks2026

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
- Draw an item on both sides of a portal while it is part of the way through.
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
