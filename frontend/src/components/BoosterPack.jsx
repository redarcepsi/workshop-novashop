import { useState } from 'react'
import { cardImage, setLogo } from '../utils/cards.js'
import { Emblem } from './Logo.jsx'

/**
 * Paquet de booster dessiné en CSS : dégradé aux couleurs du set, logo, illustration de la carte de couverture
 * (recadrée sur son dessin) et reflet métallisé. `tearing` : le haut du paquet s'arrache.
 */
export default function BoosterPack({ booster, className = '', tearing = false }) {
  const [artFailed, setArtFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const single = booster.sets.length === 1
  const logo = single ? setLogo(booster.sets[0].logo_url) : null
  const style = { '--c1': booster.colors[0], '--c2': booster.colors[1] }

  return (
    <div className={`booster-pack select-none ${className}`} style={style}>
      {/* En-tête : logo du set, ou le nom pour un booster multi-sets */}
      <div className="absolute inset-x-[8%] top-[7%] z-[1] flex h-[15%] items-center justify-center">
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
      <div className="absolute inset-x-[10%] bottom-[22%] top-[25%] z-[1] overflow-hidden rounded-[8px] bg-night-950/40 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35),0_10px_25px_rgba(0,0,0,0.45)]">
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

      {tearing && (
        <div
          className="pack-tear absolute inset-x-0 top-0 z-[4] h-[13%] origin-bottom-left"
          style={{ background: `linear-gradient(160deg, ${booster.colors[0]}, ${booster.colors[1]})` }}
        />
      )}
    </div>
  )
}
