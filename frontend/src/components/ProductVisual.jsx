const SIZES = {
  xs: 'text-2xl',
  sm: 'text-4xl',
  md: 'text-7xl',
  lg: 'text-[8rem] sm:text-[10rem] leading-none',
}

/**
 * Visuel d'un produit : l'illustration servie par l'API si `image_url` est renseignée
 * (`view` : "pair", "front" ou "back"), sinon l'emoji du produit sur un dégradé de sa couleur.
 * Accepte un produit ou une ligne de commande.
 */
export default function ProductVisual({ item, size = 'md', view, className = '' }) {
  const name = item.name ?? item.product_name
  if (item.image_url) {
    return (
      <div className={`overflow-hidden bg-slate-100 ${className}`}>
        <img
          src={view ? `${item.image_url}?view=${view}` : item.image_url}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    )
  }
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 20%, #ffffff 0%, ${item.color}22 45%, ${item.color}55 100%)`,
      }}
    >
      <span
        role="img"
        aria-label={name}
        className={`${SIZES[size]} select-none drop-shadow-[0_10px_18px_rgba(15,23,42,0.18)] transition-transform duration-300 group-hover:scale-110`}
      >
        {item.emoji}
      </span>
    </div>
  )
}
