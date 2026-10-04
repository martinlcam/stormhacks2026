/* Stable URLs keep comparisons repeatable, including after a page reload. */
export const lightingScenes = [
  {
    id: 'lighting-flat',
    title: '1. Flat baseline',
    description: 'Move the amber lamp toward the wall or sphere. Nearby surfaces should brighten.',
    curved: false,
    portals: false,
  },
  {
    id: 'lighting-curved',
    title: '2. Curvature only',
    description:
      'Carry the lamp around the planet. Its light follows it; curved-surface shading is still being corrected.',
    curved: true,
    portals: false,
  },
  {
    id: 'lighting-portals',
    title: '3. Portals only',
    description: 'Hold the lamp in front of the doorway. Its light should reach the floor inside.',
    curved: false,
    portals: true,
  },
  {
    id: 'lighting-combined',
    title: '4. Curvature + portals',
    description:
      'Shine the lamp through the doorway from either side. Its light follows the opening between spaces.',
    curved: true,
    portals: true,
  },
] as const

export type LightingScene = (typeof lightingScenes)[number]
export type LightingView = 'default' | 'doorway' | 'threshold'

export function readLightingScene(search: string): LightingScene | undefined {
  const id = new URLSearchParams(search).get('scene')
  return lightingScenes.find((scene) => scene.id === id)
}

export function readLightingView(search: string): LightingView {
  const view = new URLSearchParams(search).get('view')
  return view === 'doorway' || view === 'threshold' ? view : 'default'
}
