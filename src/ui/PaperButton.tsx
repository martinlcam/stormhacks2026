import { Wash } from './Wash'

/* A button written on a scrap of watercolour paper. `focusable` is false while it is faded out. */
export function PaperButton({
  onClick,
  focusable = true,
  seed,
  bloom = false,
  children,
}: {
  onClick: () => void
  focusable?: boolean
  seed: number
  bloom?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={focusable ? 0 : -1}
      className="relative cursor-pointer border-0 bg-transparent px-8 py-4 text-sm font-light tracking-[-0.03em] text-ink transition-transform hover:scale-105"
    >
      <Wash rough={9} seed={seed} radius={16} blooms={bloom ? ['blue'] : []} />
      <span className="relative">{children}</span>
    </button>
  )
}
