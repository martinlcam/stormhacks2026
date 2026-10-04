import { create } from 'zustand'
import { type Discovery, type DiscoveryId, discoveries } from './discoveries'

/* The controls a new player is shown until they have used each of them. */
export type Lesson = 'move' | 'look' | 'jump' | 'pickUp'

interface GameState {
  /* True while the mouse is captured and the player is in control. */
  playing: boolean
  /* True once the mouse has been captured at least once. */
  everPlayed: boolean
  /* Which of the controls the player has used so far. */
  learned: Record<Lesson, boolean>
  fps: number
  passes: number
  /* The player's size relative to normal. */
  scale: number
  /* Ids of everything found so far, in order. */
  found: DiscoveryId[]
  /* The card currently on screen, if any. */
  card: Discovery | null
  /* Hint for whatever the crosshair is on, e.g. "E  pick up". */
  prompt: string | null
  /* How full the throw charge is, 0 to 1, or null when not charging. */
  charge: number | null
  /* The goals of the puzzles the player is standing at, one to a line, if any. */
  goal: string | null

  setPlaying(playing: boolean): void
  learn(lesson: Lesson): void
  setStats(fps: number, passes: number, scale: number): void
  setPrompt(prompt: string | null): void
  setCharge(charge: number | null): void
  setGoal(goal: string | null): void
  discover(id: DiscoveryId): void
  dismissCard(): void
}

/*
  The only thing the engine side and the React side share. The game layer
  writes to it; the HUD reads from it.
*/
export const useGame = create<GameState>((set, get) => ({
  playing: false,
  everPlayed: false,
  learned: { move: false, look: false, jump: false, pickUp: false },
  fps: 0,
  passes: 0,
  scale: 1,
  found: [],
  card: null,
  prompt: null,
  charge: null,
  goal: null,

  setPlaying: (playing) => set({ playing, everPlayed: get().everPlayed || playing }),
  learn: (lesson) => {
    if (get().learned[lesson]) return
    set({ learned: { ...get().learned, [lesson]: true } })
  },
  setStats: (fps, passes, scale) => set({ fps, passes, scale }),
  setPrompt: (prompt) => set({ prompt }),
  setCharge: (charge) => set({ charge }),
  setGoal: (goal) => set({ goal }),
  discover: (id) => {
    if (get().found.includes(id)) return
    set({ found: [...get().found, id], card: discoveries[id] })
  },
  dismissCard: () => set({ card: null }),
}))
