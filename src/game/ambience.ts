import { create } from 'zustand'

/* Keep ambience below the effects, even when a listener turns it all the way up. */
export const MAX_DRONE_LEVEL = 0.1
export const MAX_RAIN_LEVEL = 0.2

interface AmbienceState {
  drone: number
  rain: number
  setDrone: (volume: number) => void
  setRain: (volume: number) => void
}

const clampVolume = (volume: number) => Math.max(0, Math.min(1, volume))

/* Softer starting levels leave footsteps, doors and discoveries clearly audible. */
export const useAmbience = create<AmbienceState>((set) => ({
  drone: 0.65,
  rain: 0.7,
  setDrone: (drone) => set({ drone: clampVolume(drone) }),
  setRain: (rain) => set({ rain: clampVolume(rain) }),
}))
