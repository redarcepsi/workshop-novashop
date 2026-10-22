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
  // Holos des anciens sets, EX de Noir & Blanc, doubles rares (ex) d'Écarlate et Violet
  HOLO: { label: 'Holo / EX', symbol: '★', badge: 'bg-violet-400/15 text-violet-200 ring-violet-400/40', glow: '#a78bfa' },
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
  bw1: 'noir-et-blanc',
  bw2: 'pouvoirs-emergents',
  bw3: 'nobles-victoires',
  bw4: 'destinees-futures',
  bw5: 'explorateurs-obscurs',
  bw6: 'dragons-exaltes',
  dv1: 'coffre-des-dragons',
  bw7: 'frontieres-franchies',
  bw8: 'tempete-plasma',
  bw9: 'glaciation-plasma',
  bw10: 'explosion-plasma',
  'sv03.5': '151',
  'sv08.5': 'evolutions-prismatiques',
}

// Séries de cartes (champ `serie` des sets TCGdex) ; les boosters multi-sets forment la série « premium »
export const PREMIUM = 'premium'
export const SERIES = {
  Base: { label: 'Les classiques', period: '1999' },
  'Noir & Blanc': { label: 'Noir & Blanc', period: '2011 – 2013' },
  'Écarlate et Violet': { label: 'Écarlate et Violet', period: '2023 – 2025' },
  [PREMIUM]: { label: 'Édition premium', period: 'tous les sets' },
}
export const serieInfo = (serie) => SERIES[serie] ?? { label: serie, period: '' }

export const boosterSerie = (booster) => (booster.sets.length === 1 ? booster.sets[0].serie : PREMIUM)

/** Regroupe une liste déjà triée par série : [[série, éléments], …], dans l'ordre d'apparition. */
export function groupBySerie(items, serieOf = (item) => item.serie) {
  const groups = new Map()
  for (const item of items) {
    const serie = serieOf(item)
    if (!groups.has(serie)) groups.set(serie, [])
    groups.get(serie).push(item)
  }
  return [...groups]
}

/** Du moins rare au plus rare, puis dans l'ordre du set. */
export const byRarity = (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || a.number - b.number

/** Bonus d'un lot de PokéDollars par rapport au taux de base (100 PokéDollars par euro). */
export const pokedollarBonus = (product) => Math.round((product.pokedollars / (Number(product.price) * 100) - 1) * 100)
