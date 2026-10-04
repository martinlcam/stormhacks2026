import { create } from 'zustand'

export interface LightingSettings {
  lampEnabled: boolean
  referenceEnabled: boolean
}

interface LightingState extends LightingSettings {
  setLampEnabled(enabled: boolean): void
  setReferenceEnabled(enabled: boolean): void
}

/* Start with the local light isolated; keep a small ambient fill for navigation. */
export const useLightingSettings = create<LightingState>((set) => ({
  lampEnabled: true,
  referenceEnabled: false,

  setLampEnabled: (lampEnabled) => set({ lampEnabled }),
  setReferenceEnabled: (referenceEnabled) => set({ referenceEnabled }),
}))
