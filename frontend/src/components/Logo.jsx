/** Emblème PokéBling : la pièce dorée « PB » (public/brand/emblem.webp). */
export function Emblem({ className = 'h-9 w-9' }) {
  return <img src="/brand/emblem.webp" alt="" draggable="false" className={`object-contain ${className}`} />
}

/** Logo complet, avec Pikachu et la machine à sous (public/brand/logo.webp). */
export function BrandLogo({ className = '' }) {
  return <img src="/brand/logo.webp" alt="PokéBling — Cards, Casino, Chance" draggable="false" className={`object-contain ${className}`} />
}

/** Emblème et logotype, aux couleurs du logo : « Poké » en or, « Bling » en bleu. */
export default function Logo({ className = '' }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Emblem className="h-10 w-10 drop-shadow-[0_0_12px_rgba(255,194,28,0.35)]" />
      <span className="font-display text-xl font-bold tracking-tight">
        <span className="text-bling">Poké</span>
        <span className="text-bling-blue">Bling</span>
      </span>
    </span>
  )
}
