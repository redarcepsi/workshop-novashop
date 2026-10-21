"""Catalogue de PokéBling, inséré au premier démarrage si la table des cartes est vide.

- Les cartes viennent de data/cards.json, généré depuis l'API TCGdex par tools/fetch_pokemon_cards.py : noms et
  caractéristiques seulement, les images restent chez TCGdex et sont chargées par le navigateur.
- Chaque carte est vendue à l'unité, en euros : prix et stock dépendent de sa rareté (cher, comparé à un booster).
- Les lots de PokéDollars se paient aussi en euros ; les boosters, eux, se paient en PokéDollars.
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

from sqlalchemy import func, select
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
}

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
}
FEATURED = [
    "base1-4", "sv08.5-161", "sv03.5-199", "sv08.5-179", "sv08.5-167", "sv03.5-205", "base1-2", "base1-15",
    "base1-10", "sv03.5-173", "base3-4", "base2-11", "sv08.5-156", "base3-5",
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

# Une entrée par carte, dans l'ordre de révélation : {palier: poids}
CLASSIC_SLOTS = [{"COMMON": 1}] * 3 + [{"UNCOMMON": 1}] * 2 + [{"RARE": 2, "HOLO": 1}]
MODERN_SLOTS = (
    [{"COMMON": 1}] * 3
    + [{"UNCOMMON": 1}]
    + [{"COMMON": 50, "UNCOMMON": 30, "ULTRA": 15, "SECRET": 5}]  # carte variante
    + [{"RARE": 72, "HOLO": 22, "ULTRA": 5, "SECRET": 1}]
)
LEGENDARY_SLOTS = [{"HOLO": 1}] * 2 + [{"HOLO": 70, "ULTRA": 30}] * 2 + [{"ULTRA": 75, "SECRET": 25}]

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
    {"slug": "151", "name": "Booster 151", "price": 400, "sets": ["sv03.5"], "slots": MODERN_SLOTS,
     "cover": "sv03.5-151", "colors": ["#f472b6", "#7c3aed"],
     "description": "Les 151 premiers Pokémon, version Écarlate et Violet. 6 cartes dont une rare garantie, "
                    "et une carte variante qui peut cacher une illustration rare."},
    {"slug": "evolutions-prismatiques", "name": "Booster Évolutions Prismatiques", "price": 450, "sets": ["sv08.5"],
     "slots": MODERN_SLOTS, "cover": "sv08.5-075", "colors": ["#67e8f9", "#c026d3"],
     "description": "Évoli et ses évolutions sous leur plus beau jour. 6 cartes dont une rare garantie."},
    {"slug": "legendaire", "name": "Booster Légendaire", "price": 1500,
     "sets": ["base1", "base2", "base3", "sv03.5", "sv08.5"], "slots": LEGENDARY_SLOTS,
     "cover": "sv08.5-161", "colors": ["#fde047", "#1c1917"],
     "description": "Le booster des grands collectionneurs : 5 cartes de tous les sets, toutes holographiques ou "
                    "mieux, dont une ultra rare garantie."},
]


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _rarity(card: dict, classic: bool) -> tuple[Rarity, str]:
    if card["rarity"] == "Rare" and classic and card["holo"]:
        return Rarity.HOLO, "Rare Holo"
    return RARITIES[card["rarity"]], card["rarity"]


def _round_price(value: Decimal) -> Decimal:
    """Arrondit au prix « psychologique » supérieur : 27,98 → 27,99."""
    return Decimal(math.ceil(value)) - Decimal("0.01")


def _offer(card: dict, rarity: Rarity) -> tuple[Decimal, Decimal | None, int]:
    """Prix, prix barré éventuel et stock d'une carte. Déterministe : le même catalogue à chaque installation."""
    if card["id"] in SPECIAL:
        price, stock = SPECIAL[card["id"]]
        return Decimal(price), None, stock

    rng = random.Random(card["id"])
    price = PRICES[rarity]
    if rarity.rank >= Rarity.RARE.rank and card["dex"] in STAR_POKEMON:
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
    if db.scalar(select(func.count()).select_from(Card)):
        return

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    sets, official_counts = {}, {}
    for position, s in enumerate(data["sets"]):
        sets[s["id"]] = CardSet(
            id=s["id"],
            name=s["name"],
            serie=s["serie"],
            release_date=date.fromisoformat(s["release_date"]) if s.get("release_date") else None,
            logo_url=s.get("logo"),
            position=position,
        )
        official_counts[s["id"]] = s["official_count"]
    db.add_all(sets.values())

    cards = {}
    for c in data["cards"]:
        # Les énergies de base n'ont aucun intérêt à collectionner
        if c["category"] == "Énergie" and c["rarity"] == "Commune":
            continue
        set_id = c["id"].rsplit("-", 1)[0]
        card_set = sets[set_id]
        rarity, rarity_label = _rarity(c, classic=card_set.serie == "Base")
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
        price, compare_at, stock = _offer(c, rarity)
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

    for pack in POKEDOLLAR_PACKS:
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

    for position, b in enumerate(BOOSTERS):
        db.add(
            Booster(
                slug=b["slug"],
                name=b["name"],
                description=b["description"],
                price=b["price"],
                set_ids=b["sets"],
                slots=b["slots"],
                cover_card=cards[b["cover"]],
                colors=b["colors"],
                position=position,
            )
        )

    try:
        db.commit()
        logger.info(
            "Catalogue PokéBling inséré : %s cartes, %s lots de PokéDollars, %s boosters",
            len(cards), len(POKEDOLLAR_PACKS), len(BOOSTERS),
        )
    except IntegrityError:
        # Une autre instance du service a inséré le catalogue en même temps
        db.rollback()
