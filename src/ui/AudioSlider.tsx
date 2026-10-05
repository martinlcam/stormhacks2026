import type { CSSProperties } from 'react'

export function AudioSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[0.65rem] tracking-[-0.01em] text-caption/70">
      <span className="w-10 shrink-0 lowercase">{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        aria-label={`${label} volume`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="audio-volume min-w-0 flex-1"
        style={{ '--audio-volume': `${value * 100}%` } as CSSProperties}
      />
    </label>
  )
}
