import * as THREE from 'three'
import { preloadFoliage } from './foliage'

/* The ground's images. The rest belong to the foliage, which loads its own. */
const GROUND = [
  'rocky_terrain_02/diffuse.jpg',
  'rocky_terrain_02/normal.jpg',
  'forrest_ground_01/diffuse.jpg',
  'forrest_ground_01/normal.jpg',
]

let started = false

/*
  Fetch every image and model the game needs, ahead of the game. The
  landing page calls this while the reader is in the story, so that the
  world is already there when they enter it.

  The loaders keep what they fetch (`THREE.Cache`), and the game asks for
  the same addresses, so nothing is fetched or decoded twice.
*/
export function preloadAssets() {
  if (started) return
  started = true
  THREE.Cache.enabled = true
  preloadFoliage()
  const images = new THREE.ImageLoader()
  for (const file of GROUND) images.load(`${import.meta.env.BASE_URL}textures/${file}`)
  // The rain is fetched by the sound when it starts; this puts it in the browser's cache.
  void fetch(`${import.meta.env.BASE_URL}sounds/rain.mp3`).catch(() => {})
}
