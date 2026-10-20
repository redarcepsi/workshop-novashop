import Icon from './Icon.jsx'

export default function Logo({ light = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
        }`}
      >
        <Icon name="bag" className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        Nova<span className={light ? 'text-brand-200' : 'text-brand-600'}>Shop</span>
      </span>
    </span>
  )
}
