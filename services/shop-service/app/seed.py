"""Catalogue de PokéBling, synchronisé à chaque démarrage.

- Les cartes viennent de data/cards.json, généré depuis l'API TCGdex par tools/fetch_pokemon_cards.py : noms et
  caractéristiques seulement, les images restent chez TCGdex et sont chargées par le navigateur.
- Chaque carte est vendue à l'unité, en euros : prix et stock dépendent de sa rareté (cher, comparé à un booster).
- Les lots de PokéDollars se paient aussi en euros ; les boosters, eux, se paient en PokéDollars.

Les sets, cartes et lots absents de la base sont ajoutés ; ceux qui existent déjà ne sont pas modifiés (prix, stock
et commandes restent intacts). Les boosters, eux, sont mis à jour : prix, contenu et probabilités suivent ce fichier.
"""

import json
import logging
import math
import random
import re
import unicodedata
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Booster, Card, CardSet, Product, ProductKind, Rarity

logger = logging.getLogger("shop-service")

DATA_FILE = Path(__file__).parent / "data" / "cards.json"

# Libellés de rareté de TCGdex → paliers de la boutique. « Rare » dépend de l'époque, voir _rarity()
RARITIES = {
    "Commune": Rarity.COMMON,
    "Peu Commune": Rarity.UNCOMMON,
    "Rare": Rarity.RARE,
    "Double rare": Rarity.HOLO,
    "Illustration rare": Rarity.ULTRA,
    "Ultra Rare": Rarity.ULTRA,
    "HIGH-TECH rare": Rarity.ULTRA,
    "Illustration spéciale rare": Rarity.SECRET,
    "Hyper rare": Rarity.SECRET,
    "Magnifique rare": Rarity.SECRET,
}
# Pour la série Noir & Blanc, TCGdex ne distingue pas les holos des rares : les cartes EX forment le palier holo
EX_NAME = re.compile(r"[- ]EX$")
# Coffre des Dragons : toutes les cartes sont holographiques, et Kyurem (21/20) est la carte secrète du set
RARITY_FIX = {"dv1-21": (Rarity.SECRET, "Magnifique rare")}

# ---------------------------------------------------------------- prix des cartes à l'unité (euros)

PRICES = {
    Rarity.COMMON: Decimal("1.49"),
    Rarity.UNCOMMON: Decimal("2.99"),
    Rarity.RARE: Decimal("6.99"),
    Rarity.HOLO: Decimal("17.99"),
    Rarity.ULTRA: Decimal("34.99"),
    Rarity.SECRET: Decimal("79.99"),
}
STOCKS = {
    Rarity.COMMON: (30, 60),
    Rarity.UNCOMMON: (15, 30),
    Rarity.RARE: (5, 12),
    Rarity.HOLO: (2, 6),
    Rarity.ULTRA: (1, 3),
    Rarity.SECRET: (1, 1),
}
# Pokémon les plus recherchés (numéros du Pokédex) : leurs cartes rares coûtent plus cher
STAR_POKEMON = {3, 6, 9, 25, 94, 130, 133, 134, 135, 136, 143, 144, 145, 146, 149, 150, 151, 196, 197, 470, 471, 700}
# Légendaires vedettes de la série Noir & Blanc (limités à cette série : les prix déjà en vente ne bougent pas)
STAR_POKEMON_BW = {249, 250, 382, 383, 384, 483, 484, 487, 491, 494, 571, 643, 644, 646, 647, 649}
STAR_MULTIPLIER = Decimal("1.6")
# Les cartes « graal » : prix et stock fixés à la main
SPECIAL = {
    "base1-4": ("249.99", 1),     # Dracaufeu, Set de Base
    "base1-2": ("89.99", 2),      # Tortank, Set de Base
    "base1-15": ("79.99", 2),     # Florizarre, Set de Base
    "base1-10": ("59.99", 3),     # Mewtwo, Set de Base
    "sv03.5-199": ("199.99", 1),  # Dracaufeu-ex, illustration spéciale
    "sv03.5-205": ("99.99", 1),   # Mew-ex doré
    "sv08.5-161": ("349.99", 1),  # Noctali-ex, illustration spéciale
    "sv08.5-167": ("149.99", 1),  # Évoli-ex, illustration spéciale
    "sv08.5-179": ("179.99", 1),  # Pikachu-ex doré
    "bw8-136": ("149.99", 1),     # Dracaufeu chromatique, Tempête Plasma
    "bw6-128": ("119.99", 1),     # Rayquaza chromatique, Dragons Exaltés
    "bw1-115": ("89.99", 1),      # Pikachu doré, Noir & Blanc
}
FEATURED = [
    "base1-4", "sv08.5-161", "sv03.5-199", "sv08.5-179", "sv08.5-167", "sv03.5-205", "base1-2", "base1-15",
    "base1-10", "sv03.5-173", "base3-4", "base2-11", "sv08.5-156", "base3-5", "bw8-136", "bw6-128", "bw1-115",
    "bw7-145", "bw4-98",
]

# ---------------------------------------------------------------- PokéDollars (euros → monnaie virtuelle)

POKEDOLLAR_PACKS = [
    {"slug": "pokedollars-500", "name": "Bourse de 500 PokéDollars", "pokedollars": 500, "price": "4.99",
     "description": "De quoi ouvrir un premier booster et commencer votre collection."},
    {"slug": "pokedollars-1200", "name": "Sacoche de 1 200 PokéDollars", "pokedollars": 1200, "price": "9.99",
     "description": "Le format préféré des dresseurs : 20 % de PokéDollars offerts.", "featured": True},
    {"slug": "pokedollars-2600", "name": "Coffre de 2 600 PokéDollars", "pokedollars": 2600, "price": "19.99",
     "description": "Pour enchaîner les ouvertures : 30 % de PokéDollars offerts."},
    {"slug": "pokedollars-7000", "name": "Trésor de 7 000 PokéDollars", "pokedollars": 7000, "price": "49.99",
     "description": "Le trésor des maîtres collectionneurs : 40 % de PokéDollars offerts."},
]

# ---------------------------------------------------------------- boosters (prix en PokéDollars)

# Une entrée par carte, dans l'ordre de révélation : {palier: poids}. Les poids d'un emplacement sont relatifs ;
# un palier absent des sets du booster est ignoré (voir booster_service._slot_weights).

# 1999 : une holo pour trois boosters, comme les vrais paquets du Set de Base
CLASSIC_SLOTS = [{"COMMON": 1}] * 3 + [{"UNCOMMON": 1}] * 2 + [{"RARE": 2, "HOLO": 1}]
# Écarlate et Violet, proche des taux constatés sur les vrais paquets : double rare 1 sur 7, illustration rare ou
# ultra rare 1 sur 7, illustration spéciale ou hyper rare 1 sur 22
MODERN_SLOTS = (
    [{"COMMON": 1}] * 3
    + [{"UNCOMMON": 1}]
    + [{"COMMON": 590, "UNCOMMON": 300, "ULTRA": 80, "SECRET": 30}]  # carte variante
    + [{"RARE": 770, "HOLO": 150, "ULTRA": 65, "SECRET": 15}]
)
# Noir & Blanc : une EX pour 8 boosters, et des ultra rares (full art) et magnifiques rares volontairement rares :
# environ 1 booster sur 45 et 1 sur 130
BW_SLOTS = (
    [{"COMMON": 1}] * 3
    + [{"UNCOMMON": 1}]
    + [{"COMMON": 55, "UNCOMMON": 30, "RARE": 15}]  # carte variante
    + [{"RARE": 853, "HOLO": 120, "ULTRA": 20, "SECRET": 7}]
)
# Coffre des Dragons : 5 cartes holographiques, Kyurem caché une fois sur 140
DRAGON_VAULT_SLOTS = [{"HOLO": 1}] * 4 + [{"HOLO": 993, "SECRET": 7}]
# Le booster premium : 4 cartes, toutes holographiques ou mieux, dont deux ultra rares ou secrètes garanties
LEGENDARY_SLOTS = [{"HOLO": 1}, {"HOLO": 70, "ULTRA": 30}] + [{"ULTRA": 75, "SECRET": 25}] * 2

BW_DESCRIPTION = " 6 cartes dont une rare garantie ; une EX environ une fois sur huit."


def _bw(slug, set_id, name, cover, colors, text):
    return {"slug": slug, "name": f"Booster {name}", "price": 300, "sets": [set_id], "slots": BW_SLOTS,
            "cover": cover, "colors": colors, "description": text + BW_DESCRIPTION}


BOOSTERS = [
    {"slug": "set-de-base", "name": "Booster Set de Base", "price": 300, "sets": ["base1"], "slots": CLASSIC_SLOTS,
     "cover": "base1-4", "colors": ["#facc15", "#dc2626"],
     "description": "Le tout premier set, sorti en 1999. 6 cartes dont une rare garantie, holographique une fois sur trois."},
    {"slug": "jungle", "name": "Booster Jungle", "price": 250, "sets": ["base2"], "slots": CLASSIC_SLOTS,
     "cover": "base2-11", "colors": ["#4ade80", "#166534"],
     "description": "Les Pokémon de la jungle et les évolutions d'Évoli. 6 cartes dont une rare garantie."},
    {"slug": "fossile", "name": "Booster Fossile", "price": 250, "sets": ["base3"], "slots": CLASSIC_SLOTS,
     "cover": "base3-4", "colors": ["#fbbf24", "#78350f"],
     "description": "Pokémon fossiles, spectres et oiseaux légendaires. 6 cartes dont une rare garantie."},
    _bw("noir-et-blanc", "bw1", "Noir & Blanc", "bw1-114", ["#cbd5e1", "#111827"],
        "Reshiram, Zekrom et les premiers Pokémon d'Unys (2011)."),
    _bw("pouvoirs-emergents", "bw2", "Pouvoirs Émergents", "bw2-98", ["#86efac", "#14532d"],
        "Boréas et Fulguris déchaînent les éléments."),
    _bw("nobles-victoires", "bw3", "Nobles Victoires", "bw3-98", ["#fdba74", "#9a3412"],
        "Victini et les Pokémon légendaires de la justice."),
    _bw("destinees-futures", "bw4", "Destinées Futures", "bw4-98", ["#d8b4fe", "#4c1d95"],
        "L'arrivée des Pokémon-EX, avec Mewtwo-EX en tête d'affiche."),
    _bw("explorateurs-obscurs", "bw5", "Explorateurs Obscurs", "bw5-107", ["#94a3b8", "#0f172a"],
        "Darkrai-EX et les Pokémon des ténèbres."),
    _bw("dragons-exaltes", "bw6", "Dragons Exaltés", "bw6-123", ["#6ee7b7", "#064e3b"],
        "Rayquaza-EX et les Pokémon de type Dragon."),
    {"slug": "coffre-des-dragons", "name": "Booster Coffre des Dragons", "price": 500, "sets": ["dv1"],
     "slots": DRAGON_VAULT_SLOTS, "cover": "dv1-11", "colors": ["#fcd34d", "#7c2d12"],
     "description": "Le set spécial de 2012, entièrement holographique : 5 cartes holo, et peut-être Kyurem, la carte "
                    "secrète du coffre."},
    _bw("frontieres-franchies", "bw7", "Frontières Franchies", "bw7-145", ["#7dd3fc", "#1e1b4b"],
        "Kyurem Noir-EX et Kyurem Blanc-EX, les légendaires de Noir 2 et Blanc 2."),
    _bw("tempete-plasma", "bw8", "Tempête Plasma", "bw8-134", ["#93c5fd", "#1e3a8a"],
        "La Team Plasma attaque, menée par Lugia-EX."),
    _bw("glaciation-plasma", "bw9", "Glaciation Plasma", "bw9-110", ["#a5f3fc", "#164e63"],
        "Fulguris-EX, Deoxys-EX et le froid de la Team Plasma."),
    _bw("explosion-plasma", "bw10", "Explosion Plasma", "bw10-97", ["#fca5a5", "#4c0519"],
        "Genesect-EX et le dernier set de la série Noir & Blanc (2013)."),
    {"slug": "151", "name": "Booster 151", "price": 400, "sets": ["sv03.5"], "slots": MODERN_SLOTS,
     "cover": "sv03.5-151", "colors": ["#f472b6", "#7c3aed"],
     "description": "Les 151 premiers Pokémon, version Écarlate et Violet. 6 cartes dont une rare garantie, "
                    "et une carte variante qui peut cacher une illustration rare."},
    {"slug": "evolutions-prismatiques", "name": "Booster Évolutions Prismatiques", "price": 450, "sets": ["sv08.5"],
     "slots": MODERN_SLOTS, "cover": "sv08.5-075", "colors": ["#67e8f9", "#c026d3"],
     "description": "Évoli et ses évolutions sous leur plus beau jour. 6 cartes dont une rare garantie."},
    {"slug": "legendaire", "name": "Booster Légendaire", "price": 3500,
     "sets": ["base1", "base2", "base3", "sv03.5", "sv08.5"], "slots": LEGENDARY_SLOTS,
     "cover": "sv08.5-161", "colors": ["#fde047", "#1c1917"],
     "description": "Le booster des grands collectionneurs : 4 cartes du Set de Base, de Jungle, de Fossile, de 151 "
                    "et d'Évolutions Prismatiques, toutes holographiques ou mieux, dont deux ultra rares ou secrètes "
                    "garanties."},
]


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _rarity(card: dict, serie: str) -> tuple[Rarity, str]:
    if card["id"] in RARITY_FIX:
        return RARITY_FIX[card["id"]]
    if card["rarity"] == "Rare":
        if serie == "Base" and card["holo"]:
            return Rarity.HOLO, "Rare Holo"
        if card["id"].startswith("dv1-"):
            return Rarity.HOLO, "Rare Holo"
        if serie == "Noir & Blanc" and EX_NAME.search(card["name"]):
            return Rarity.HOLO, "Rare EX"
    return RARITIES[card["rarity"]], card["rarity"]


def _round_price(value: Decimal) -> Decimal:
    """Arrondit au prix « psychologique » supérieur : 27,98 → 27,99."""
    return Decimal(math.ceil(value)) - Decimal("0.01")


def _offer(card: dict, rarity: Rarity, serie: str) -> tuple[Decimal, Decimal | None, int]:
    """Prix, prix barré éventuel et stock d'une carte. Déterministe : le même catalogue à chaque installation."""
    if card["id"] in SPECIAL:
        price, stock = SPECIAL[card["id"]]
        return Decimal(price), None, stock

    rng = random.Random(card["id"])
    price = PRICES[rarity]
    stars = STAR_POKEMON | STAR_POKEMON_BW if serie == "Noir & Blanc" else STAR_POKEMON
    if rarity.rank >= Rarity.RARE.rank and card["dex"] in stars:
        price = _round_price(price * STAR_MULTIPLIER)
    stock = rng.randint(*STOCKS[rarity])
    compare_at = None
    if rarity.rank >= Rarity.RARE.rank:
        if rng.random() < 0.04:
            stock = 0  # quelques ruptures, pour l'exemple
        elif rng.random() < 0.10:
            compare_at, price = price, _round_price(price * Decimal("0.8"))
    return price, compare_at, stock


def _card_description(card: dict, set_name: str, official_count: int, rarity_label: str) -> str:
    return (
        f"{card['name']}, carte n° {int(card['local_id'])}/{official_count} du set {set_name} ({rarity_label}). "
        "Carte numérique : elle rejoint votre collection dès le paiement."
    )


def seed_catalog(db: Session) -> None:
    """Ajoute au catalogue ce qui manque et met les boosters à jour. Sans effet si tout est déjà en place."""
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    sets = {s.id: s for s in db.scalars(select(CardSet))}
    known_cards = set(db.scalars(select(Card.id)))
    known_products = set(db.scalars(select(Product.slug).where(Product.kind == ProductKind.POKEDOLLARS)))
    first_install = not known_cards

    official_counts, new_sets = {}, 0
    for position, s in enumerate(data["sets"]):
        official_counts[s["id"]] = s["official_count"]
        if s["id"] not in sets:
            sets[s["id"]] = CardSet(
                id=s["id"],
                name=s["name"],
                serie=s["serie"],
                release_date=date.fromisoformat(s["release_date"]) if s.get("release_date") else None,
                logo_url=s.get("logo"),
            )
            db.add(sets[s["id"]])
            new_sets += 1
        sets[s["id"]].position = position  # ordre d'affichage : celui du fichier

    cards = {}
    for c in data["cards"]:
        # Les énergies de base n'ont aucun intérêt à collectionner
        if c["category"] == "Énergie" and c["rarity"] == "Commune":
            continue
        if c["id"] in known_cards:
            continue
        set_id = c["id"].rsplit("-", 1)[0]
        card_set = sets[set_id]
        rarity, rarity_label = _rarity(c, card_set.serie)
        slug = slugify(f"{c['id']} {c['name']}")
        card = Card(
            id=c["id"],
            slug=slug,
            set=card_set,
            number=int(c["local_id"]),
            name=c["name"],
            category=c["category"],
            rarity=rarity,
            rarity_label=rarity_label,
            types=c["types"],
            hp=c["hp"],
            illustrator=c["illustrator"],
            description=c["description"],
            image_url=c["image"],
        )
        cards[c["id"]] = card
        price, compare_at, stock = _offer(c, rarity, card_set.serie)
        db.add(
            Product(
                kind=ProductKind.CARD,
                slug=slug,
                name=c["name"],
                description=_card_description(c, card_set.name, official_counts[set_id], rarity_label),
                price=price,
                compare_at_price=compare_at,
                stock=stock,
                card=card,
                is_featured=c["id"] in FEATURED,
            )
        )

    new_packs = [pack for pack in POKEDOLLAR_PACKS if pack["slug"] not in known_products]
    for pack in new_packs:
        db.add(
            Product(
                kind=ProductKind.POKEDOLLARS,
                slug=pack["slug"],
                name=pack["name"],
                description=pack["description"],
                price=Decimal(pack["price"]),
                stock=None,
                pokedollars=pack["pokedollars"],
                is_featured=pack.get("featured", False),
            )
        )
    db.flush()  # les nouvelles cartes existent avant de servir de couverture à un booster

    boosters = {b.slug: b for b in db.scalars(select(Booster))}
    new_boosters, updated_boosters = 0, 0
    for position, b in enumerate(BOOSTERS):
        values = {
            "name": b["name"],
            "description": b["description"],
            "price": b["price"],
            "set_ids": b["sets"],
            "slots": b["slots"],
            "cover_card_id": b["cover"],
            "colors": b["colors"],
            "position": position,
        }
        booster = boosters.get(b["slug"])
        if booster is None:
            db.add(Booster(slug=b["slug"], **values))
            new_boosters += 1
        elif any(getattr(booster, key) != value for key, value in values.items()):
            for key, value in values.items():
                setattr(booster, key, value)
            updated_boosters += 1

    try:
        db.commit()
    except IntegrityError:
        # Une autre instance du service a synchronisé le catalogue en même temps
        db.rollback()
        return
    if first_install:
        logger.info(
            "Catalogue PokéBling inséré : %s cartes, %s lots de PokéDollars, %s boosters",
            len(cards), len(new_packs), new_boosters,
        )
    elif cards or new_packs or new_boosters or updated_boosters:
        logger.info(
            "Catalogue PokéBling mis à jour : %s cartes ajoutées (%s sets), %s lots de PokéDollars ajoutés, "
            "%s boosters ajoutés, %s boosters modifiés",
            len(cards), new_sets, len(new_packs), new_boosters, updated_boosters,
        )
