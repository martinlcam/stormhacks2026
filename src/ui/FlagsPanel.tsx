import { FLAGS, type FlagName, readFlag } from '../flags'

const names = Object.keys(FLAGS) as FlagName[]

/*
  A panel for trying the flags, shown when the address has `?flags`.
  Choosing an option puts it in the address and reloads, so that every part
  of the page starts again with it.
*/
export function FlagsPanel() {
  if (!new URLSearchParams(location.search).has('flags')) return null

  const choose = (name: FlagName, value: string) => {
    const query = new URLSearchParams(location.search)
    if (value === FLAGS[name].options[0]) query.delete(name)
    else query.set(name, value)
    location.assign(`${location.pathname}?${query}${location.hash}`)
  }

  return (
    <div className="fixed top-3 left-3 z-50 w-80 rounded-xl bg-white/90 p-4 text-xs text-neutral-800 shadow-lg backdrop-blur">
      <p className="mb-3 font-semibold tracking-wide uppercase">Flags</p>
      {names.map((name) => (
        <div key={name} className="mb-3">
          <p className="font-semibold">{name}</p>
          <p className="mb-1 text-neutral-500">{FLAGS[name].about}</p>
          <div className="flex gap-1">
            {FLAGS[name].options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choose(name, option)}
                className={`cursor-pointer rounded-full px-3 py-1 ${
                  readFlag(name) === option ? 'bg-neutral-800 text-white' : 'bg-neutral-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
