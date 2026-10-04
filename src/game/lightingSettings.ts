import { create } from 'zustand'

export interface LightingSettings {
  lampEnabled: boolean
  lanternEnabled: boolean
  referenceEnabled: boolean
}

interface LightingState extends LightingSettings {
  setLampEnabled(enabled: boolean): void
  setLanternEnabled(enabled: boolean): void
  setReferenceEnabled(enabled: boolean): void
}

/* Start with the local light isolated; keep a small ambient fill for navigation. */
export const useLightingSettings = create<LightingState>((set) => ({
  lampEnabled: true,
  lanternEnabled: false,
  referenceEnabled: false,

  setLampEnabled: (lampEnabled) => set({ lampEnabled }),
  setLanternEnabled: (lanternEnabled) => set({ lanternEnabled }),
  setReferenceEnabled: (referenceEnabled) => set({ referenceEnabled }),
}))
