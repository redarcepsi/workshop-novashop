"""Génère le catalogue de cartes de PokéBling à partir de l'API publique TCGdex (https://tcgdex.dev).

    python tools/fetch_pokemon_cards.py            # écrit services/shop-service/app/data/cards.json

Seuls les noms et caractéristiques des cartes (quelques dizaines de Ko de texte) sont enregistrés dans le dépôt :
les images restent chez TCGdex et sont chargées par le navigateur (assets.tcgdex.net). shop-service n'a donc pas
besoin d'accès à Internet au démarrage : son réseau Docker reste "internal".

À relancer uniquement pour changer de sets (liste SETS ci-dessous). Nécessite un accès à Internet.
"""

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://api.tcgdex.net/v2/fr"
# Dans l'ordre d'affichage : par série, puis par date de sortie
SETS = [
    "base1", "base2", "base3",
    "bw1", "bw2", "bw3", "bw4", "bw5", "bw6", "dv1", "bw7", "bw8", "bw9", "bw10",
    "sv03.5", "sv08.5",
]
OUTPUT = Path(__file__).resolve().parent.parent / "services" / "shop-service" / "app" / "data" / "cards.json"

# TCGdex n'a pas de logo français pour le Set de Base : on prend le logo anglais
LOGO_FALLBACK = {"base1": "https://assets.tcgdex.net/en/base/base1/logo"}
# Coquilles de TCGdex dans les noms français officiels
NAME_FIX = {"bw6": "Dragons Exaltés", "bw8": "Tempête Plasma"}


def get(path: str) -> dict:
    request = urllib.request.Request(f"{API}{path}", headers={"User-Agent": "pokebling-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def card_entry(card: dict) -> dict:
    variants = card.get("variants") or {}
    return {
        "id": card["id"],
        "local_id": card["localId"],
        "name": card["name"],
        "category": card.get("category"),
        "rarity": card.get("rarity"),
        # Cartes rares des anciens sets : seule la variante holographique existe
        "holo": bool(variants.get("holo")) and not variants.get("normal"),
        "hp": card.get("hp"),
        "types": card.get("types") or [],
        "dex": (card.get("dexId") or [None])[0],
        "stage": card.get("stage"),
        "illustrator": card.get("illustrator"),
        "description": card.get("description") or card.get("effect"),
        "image": card["image"],
    }


def main() -> int:
    sets, cards = [], []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for set_id in SETS:
            data = get(f"/sets/{set_id}")
            entries = [c for c in data["cards"] if c.get("image")]
            details = list(pool.map(lambda c: get(f"/cards/{c['id']}"), entries))
            sets.append(
                {
                    "id": data["id"],
                    "name": NAME_FIX.get(set_id, data["name"]),
                    "serie": data["serie"]["name"],
                    "release_date": data.get("releaseDate"),
                    "official_count": data["cardCount"]["official"],
                    "logo": data.get("logo") or LOGO_FALLBACK.get(set_id),
                }
            )
            cards.extend(card_entry(c) for c in details)
            print(f"{data['name']} : {len(details)} cartes", file=sys.stderr)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"source": "https://tcgdex.dev", "sets": sets, "cards": cards}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"{len(cards)} cartes écrites dans {OUTPUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
