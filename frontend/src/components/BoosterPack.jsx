import { useState } from 'react'
import { cardImage, setLogo } from '../utils/cards.js'
import { Emblem } from './Logo.jsx'

// Bord déchiré du paquet (en % de sa hauteur), irrégulier mais identique d'une ouverture à l'autre
const TEAR_EDGE = [8.4, 7.3, 8.9, 7.6, 8.7, 7.1, 8.2, 9.0, 7.5, 8.6, 7.2, 8.8, 7.9, 7.4, 8.5]
const EDGE_POINTS = TEAR_EDGE.map((y, i) => `${(i / (TEAR_EDGE.length - 1)) * 100}% ${y}%`)
const BODY_CLIP = `polygon(${EDGE_POINTS.join(', ')}, 100% 100%, 0% 100%)`
const STRIP_CLIP = `polygon(0% 0%, 100% 0%, ${[...EDGE_POINTS].reverse().join(', ')})`

function PackFace({ booster, className = '', style }) {
  const [artFailed, setArtFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const single = booster.sets.length === 1
  const logo = single ? setLogo(booster.sets[0].logo_url) : null

  return (
    <div className={`booster-pack select-none ${className}`} style={style}>
      {/* En-tête : logo du set, ou le nom pour un booster multi-sets */}
      <div className="absolute inset-x-[8%] top-[10.5%] z-[1] flex h-[13%] items-center justify-center">
        {logo && !logoFailed ? (
          <img
            src={logo}
            alt={booster.sets[0].name}
            draggable="false"
            onError={() => setLogoFailed(true)}
            className="max-h-full max-w-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.55)]"
          />
        ) : (
          <span className="text-center font-display text-[clamp(.8rem,9cqw,2rem)] font-bold uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
            {single ? booster.sets[0].name : booster.name.replace('Booster ', '')}
          </span>
        )}
      </div>

      {/* Fenêtre sur l'illustration de la carte de couverture */}
      <div className="absolute inset-x-[10%] bottom-[22%] top-[26%] z-[1] overflow-hidden rounded-[8px] bg-night-950/40 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35),0_10px_25px_rgba(0,0,0,0.45)]">
        {!artFailed ? (
          <img
            src={cardImage(booster.cover.image_url, 'high')}
            alt=""
            draggable="false"
            onError={() => setArtFailed(true)}
            className="absolute left-1/2 top-[-30%] w-[200%] max-w-none -translate-x-1/2"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Emblem className="h-1/2 w-1/2 opacity-80" />
          </div>
        )}
      </div>

      {/* Pied : marque et nombre de cartes */}
      <div className="absolute inset-x-0 bottom-[7%] z-[1] flex flex-col items-center gap-0.5">
        <span className="font-display text-[clamp(.55rem,6cqw,1.1rem)] font-bold tracking-[0.2em] text-white drop-shadow">
          POKÉBLING
        </span>
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[clamp(.45rem,4.2cqw,.75rem)] font-semibold text-white/90">
          {booster.card_count} cartes
        </span>
      </div>

      <div className="foil" />
    </div>
  )
}

/**
 * Paquet de booster dessiné en CSS : dégradé aux couleurs du set, logo, illustration de la carte de couverture
 * (recadrée sur son dessin) et reflet métallisé.
 *
 * `stage` (ouverture) : "ready" affiche la ligne de découpe (`cut` : avancement du geste, de 0 à 1), "charging" la
 * fait briller, "torn" arrache le haut du paquet, qui s'envole pendant que la lumière sort de l'ouverture.
 */
export default function BoosterPack({ booster, className = '', stage = null, cut = 0 }) {
  const style = { '--c1': booster.colors[0], '--c2': booster.colors[1], '--cut': cut }
  const torn = stage === 'torn'

  return (
    <div className={`relative ${className}`} style={style}>
      {/* Le bord du paquet et celui de la bande arrachée se complètent exactement */}
      <PackFace booster={booster} style={torn ? { clipPath: BODY_CLIP } : undefined} />
      {torn && <div className="pack-light" aria-hidden="true" />}
      {torn && <PackFace booster={booster} className="pack-strip !absolute inset-0" style={{ clipPath: STRIP_CLIP }} />}
      {(stage === 'ready' || stage === 'charging') && (
        <div className={`tear-line ${stage === 'charging' ? 'is-charging' : ''}`} aria-hidden="true" />
      )}
    </div>
  )
}
