/*
  `?draw=speedpaint` (the default): the artist's own timelapse of watercolouring
  each drawing, played as the page is scrolled, frame by frame and backwards
  when the page goes up. The videos are cut to the drawing and written with a
  keyframe every few frames and no reordering, so that any frame can be
  reached quickly.
*/

/* The timelapses run at thirty frames a second. */
const FRAME = 1 / 30

export interface Speedpaint {
  /* Show the frame `t` of the way through the timelapse, from 0 to 1. */
  show(t: number): void
  dispose(): void
}

/*
  Drive `video` from the scroll. Only one seek is asked for at a time; when it
  is done, the video goes on to wherever the page has got to since.
*/
export function createSpeedpaint(video: HTMLVideoElement): Speedpaint {
  let wanted = 0
  let seeking = false

  const seek = () => {
    if (seeking || !video.duration) return
    // Never quite 0, because some browsers show nothing until the video has been seeked once.
    const time = Math.max(FRAME / 4, Math.min(video.duration - FRAME, wanted * video.duration))
    if (Math.abs(video.currentTime - time) < FRAME / 2) return
    seeking = true
    video.currentTime = time
  }

  const seeked = () => {
    seeking = false
    seek()
  }

  video.muted = true
  video.addEventListener('seeked', seeked)
  video.addEventListener('loadeddata', seek)
  return {
    show(t) {
      wanted = Math.min(1, Math.max(0, t))
      seek()
    },
    dispose() {
      video.removeEventListener('seeked', seeked)
      video.removeEventListener('loadeddata', seek)
    },
  }
}
