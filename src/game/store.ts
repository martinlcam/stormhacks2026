import { create } from 'zustand'
import { type Discovery, type DiscoveryId, discoveries } from './discoveries'

interface GameState {
  /** True while the mouse is captured and the player is in control. */
  playing: boolean
  fps: number
  passes: number
  /** Ids of everything found so far, in order. */
  found: DiscoveryId[]
  /** The card currently on screen, if any. */
  card: Discovery | null
  /** Hint for whatever the crosshair is on, e.g. "E  pick up". */
  prompt: string | null

  setPlaying(playing: boolean): void
  setStats(fps: number, passes: number): void
  setPrompt(prompt: string | null): void
  discover(id: DiscoveryId): void
  dismissCard(): void
}

/**
 * The only thing the engine side and the React side share. The game layer
 * writes to it; the HUD reads from it.
 */
export const useGame = create<GameState>((set, get) => ({
  playing: false,
  fps: 0,
  passes: 0,
  found: [],
  card: null,
  prompt: null,

  setPlaying: (playing) => set({ playing }),
  setStats: (fps, passes) => set({ fps, passes }),
  setPrompt: (prompt) => set({ prompt }),
  discover: (id) => {
    if (get().found.includes(id)) return
    set({ found: [...get().found, id], card: discoveries[id] })
  },
  dismissCard: () => set({ card: null }),
}))
