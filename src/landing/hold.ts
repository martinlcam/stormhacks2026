/* Keys that scroll a page. */
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'])

/*
  Stop the reader scrolling `track` until the returned function is called.
  The scroll bar can still be dragged, so whatever holds the page should
  also put it back each frame. Space still presses a focused button.
*/
export function holdScroll(track: HTMLElement): () => void {
  const stop = (event: Event) => event.preventDefault()
  const keys = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key) && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
    }
  }

  track.addEventListener('wheel', stop, { passive: false })
  track.addEventListener('touchmove', stop, { passive: false })
  window.addEventListener('keydown', keys)
  return () => {
    track.removeEventListener('wheel', stop)
    track.removeEventListener('touchmove', stop)
    window.removeEventListener('keydown', keys)
  }
}
