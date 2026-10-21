// Métadonnées d'affichage des cartes. Les images viennent de TCGdex (assets.tcgdex.net), chargées par le navigateur.

/** URL de l'image d'une carte : "low" (≈ 20 Ko, vignettes) ou "high" (≈ 65 Ko, fiche et ouverture). */
export const cardImage = (imageUrl, quality = 'low') => `${imageUrl}/${quality}.webp`

/** Logo d'un set (PNG transparent). */
export const setLogo = (logoUrl) => (logoUrl ? `${logoUrl}.png` : null)

// Du plus courant au plus rare, comme l'enum du serveur
export const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'HOLO', 'ULTRA', 'SECRET']

export const RARITIES = {
  COMMON: { label: 'Commune', symbol: '●', badge: 'bg-white/5 text-night-200 ring-white/15', glow: null },
  UNCOMMON: { label: 'Peu commune', symbol: '◆', badge: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30', glow: null },
  RARE: { label: 'Rare', symbol: '★', badge: 'bg-sky-400/10 text-sky-300 ring-sky-400/30', glow: '#38bdf8' },
  HOLO: { label: 'Holo', symbol: '★', badge: 'bg-violet-400/15 text-violet-200 ring-violet-400/40', glow: '#a78bfa' },
  ULTRA: { label: 'Ultra rare', symbol: '★★', badge: 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-400/40', glow: '#e879f9' },
  SECRET: { label: 'Secrète', symbol: '★★★', badge: 'bg-gold-400/15 text-gold-200 ring-gold-400/50', glow: '#ffc21c' },
}

export const rarityRank = (rarity) => RARITY_ORDER.indexOf(rarity)

/** Cartes à effet holographique (reflets arc-en-ciel). */
export const isHolo = (rarity) => rarityRank(rarity) >= rarityRank('HOLO')

export const TYPES = {
  Plante: { color: '#4ade80', emoji: '🌿' },
  Feu: { color: '#fb923c', emoji: '🔥' },
  Eau: { color: '#38bdf8', emoji: '💧' },
  Électrique: { color: '#facc15', emoji: '⚡' },
  Psy: { color: '#c084fc', emoji: '🔮' },
  Combat: { color: '#d97706', emoji: '👊' },
  Obscurité: { color: '#64748b', emoji: '🌙' },
  Métal: { color: '#94a3b8', emoji: '⚙️' },
  Dragon: { color: '#eab308', emoji: '🐉' },
  Incolore: { color: '#e2e8f0', emoji: '⭐' },
}

export const typeColor = (card) => TYPES[card?.types?.[0]]?.color ?? '#a7a1e0'

// Booster correspondant à chaque set (voir services/shop-service/app/seed.py)
export const BOOSTER_BY_SET = {
  base1: 'set-de-base',
  base2: 'jungle',
  base3: 'fossile',
  'sv03.5': '151',
  'sv08.5': 'evolutions-prismatiques',
}

/** Bonus d'un lot de PokéDollars par rapport au taux de base (100 PokéDollars par euro). */
export const pokedollarBonus = (product) => Math.round((product.pokedollars / (Number(product.price) * 100) - 1) * 100)
