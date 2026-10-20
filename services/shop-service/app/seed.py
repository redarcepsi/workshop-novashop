"""Catalogue de démonstration, inséré au premier démarrage si la table des produits est vide.

Thème : body pillows (housses de coussin long) de personnages de jeu vidéo originaux,
tous adultes et entièrement habillés. Les visuels sont générés par app/art.py.
"""

import logging
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import API_PREFIX
from .models import Category, Product

logger = logging.getLogger("shop-service")

CATEGORIES = [
    {"slug": "creatures", "name": "Créatures & monstres", "emoji": "🐉"},
    {"slug": "fantasy", "name": "Héroïque fantasy", "emoji": "⚔️"},
    {"slug": "scifi", "name": "Sci-fi & cyberpunk", "emoji": "🚀"},
    {"slug": "retro", "name": "Rétro & pixel", "emoji": "👾"},
    {"slug": "accessoires", "name": "Accessoires de couette", "emoji": "🛏️"},
]

PILLOW = [
    "Housse de body pillow 160 × 50 cm",
    "Impression recto / verso haute définition",
    "Tissu peau de pêche 2 sens, ultra-doux",
    "Fermeture zip invisible",
    "Lavable en machine à 30 °C",
    "Garnissage vendu séparément",
]
PILLOW_XXL = ["Housse de body pillow 180 × 60 cm (format XXL)", *PILLOW[1:]]

PRODUCTS = [
    # ------------------------------------------------------------ créatures
    {
        "category": "creatures", "slug": "dragonnette-xxl", "name": "Dragonnette XXL", "emoji": "🐉",
        "price": "129.00", "compare": "149.00", "stock": 3, "rating": 4.9, "reviews": 512, "featured": True,
        "description": "Notre best-seller légendaire : 180 cm de dragonnette en armure d'écailles, cornes et ailes "
                       "comprises. Crache du feu uniquement dans vos rêves.",
        "details": PILLOW_XXL,
        "art": {"bg": ["#fed7aa", "#ef4444"], "pattern": "flames", "skin": "#fde3cf", "hair": "#b91c1c",
                "hair_style": "long", "eyes": "#d97706", "headwear": "horns", "horn": "#fef3c7",
                "wings": "#7f1d1d", "tail": "#991b1b", "weapon": "sword", "weapon_color": "#fbbf24",
                "outfit": {"style": "armor", "top": "#dc2626", "under": "#7f1d1d", "bottom": "#450a0a",
                           "boots": "#1c1917", "accent": "#fbbf24"}},
    },
    {
        "category": "creatures", "slug": "comte-vampire-couette", "name": "Comte Vampire de la Couette", "emoji": "🦇",
        "price": "69.90", "compare": None, "stock": 14, "rating": 4.6, "reviews": 188, "featured": False,
        "description": "Il ne sort que la nuit, ça tombe bien : vous aussi. Cape doublée de velours (imprimée), "
                       "regard ténébreux et canines de velours garantis.",
        "details": PILLOW,
        "art": {"bg": ["#7c3aed", "#312e81"], "pattern": "moon", "skin": "#f1f5f9", "hair": "#0f172a",
                "hair_style": "short", "eyes": "#dc2626", "fangs": True, "cape": "#991b1b",
                "outfit": {"style": "tunic", "top": "#1e1b4b", "bottom": "#0f172a", "boots": "#020617", "accent": "#dc2626"}},
    },
    {
        "category": "creatures", "slug": "loup-garou-pleine-lune", "name": "Loup-Garou Poilu Pleine Lune", "emoji": "🐺",
        "price": "64.90", "compare": "74.90", "stock": 20, "rating": 4.5, "reviews": 143, "featured": False,
        "description": "Câlin, poilu, un peu grognon les soirs de pleine lune. Chemise de bûcheron réglementaire, "
                       "griffes limées pour votre confort.",
        "details": PILLOW,
        "art": {"bg": ["#3b82f6", "#0f172a"], "pattern": "moon", "skin": "#a8a29e", "hair": "#57534e",
                "hair_style": "spiky", "eyes": "#facc15", "headwear": "wolf", "muzzle": True,
                "outfit": {"style": "tunic", "top": "#b91c1c", "bottom": "#1e3a8a", "boots": "#44403c", "accent": "#1f2937"}},
    },
    {
        "category": "creatures", "slug": "slime-royal", "name": "Slime Royal Tout Mou", "emoji": "🟢",
        "price": "44.90", "compare": None, "stock": 40, "rating": 4.8, "reviews": 276, "featured": True,
        "description": "100 % gélatine émotionnelle, 0 % gélatine réelle. S'écrase sur commande et reprend sa forme "
                       "au réveil. Couronne non contractuelle.",
        "details": PILLOW,
        "art": {"type": "slime", "slime": "#4ade80", "bg": ["#ecfccb", "#22c55e"], "pattern": "bubbles"},
    },
    {
        "category": "creatures", "slug": "orc-doudou-bestial", "name": "Orc Doudou Bestial", "emoji": "👹",
        "price": "59.90", "compare": None, "stock": 9, "rating": 4.4, "reviews": 97, "featured": False,
        "description": "Deux mètres de muscles sous une armure de cuir, défenses arrondies pour votre sécurité. "
                       "Grogne doucement, protège fort.",
        "details": PILLOW,
        "art": {"bg": ["#fef3c7", "#d97706"], "pattern": "runes", "skin": "#65a30d", "hair": "#1c1917",
                "hair_style": "mohawk", "eyes": "#dc2626", "tusks": True, "fur_collar": "#e7e5e4", "weapon": "axe",
                "outfit": {"style": "armor", "top": "#92400e", "under": "#57534e", "bottom": "#44403c",
                           "boots": "#292524", "accent": "#a16207"}},
    },
    # ------------------------------------------------------------ fantasy
    {
        "category": "fantasy", "slug": "paladin-de-chevet", "name": "Paladin de Chevet", "emoji": "🛡️",
        "price": "79.90", "compare": None, "stock": 25, "rating": 4.7, "reviews": 233, "featured": True,
        "description": "Il veille sur votre sommeil en armure complète. Bouclier anti-cauchemars inclus (imprimé). "
                       "Serment de fidélité garanti 2 ans.",
        "details": PILLOW,
        "art": {"bg": ["#dbeafe", "#3b82f6"], "pattern": "stars", "skin": "#f2c9a0", "headwear": "helmet",
                "plume": "#dc2626", "cape": "#1d4ed8", "shield": "#1d4ed8", "weapon": "sword", "weapon_color": "#fbbf24",
                "outfit": {"style": "armor", "top": "#cbd5e1", "under": "#475569", "bottom": "#334155",
                           "boots": "#64748b", "accent": "#fbbf24"}},
    },
    {
        "category": "fantasy", "slug": "elfe-de-compagnie", "name": "Elfe de Compagnie 160 cm", "emoji": "🏹",
        "price": "74.90", "compare": None, "stock": 18, "rating": 4.6, "reviews": 164, "featured": False,
        "description": "Oreilles pointues, arc tendu, jamais en retard pour un câlin. Tenue de rôdeuse en cuir "
                       "et cape forestière.",
        "details": PILLOW,
        "art": {"bg": ["#dcfce7", "#16a34a"], "pattern": "stars", "skin": "#fde7d6", "hair": "#facc15",
                "hair_style": "long", "eyes": "#15803d", "ears": "elf", "cape": "#14532d", "weapon": "bow",
                "outfit": {"style": "tunic", "top": "#15803d", "bottom": "#3f2a1d", "boots": "#57381f", "accent": "#a3e635"}},
    },
    {
        "category": "fantasy", "slug": "necromancienne-nocturne", "name": "Nécromancienne Nocturne — Édition Insomnie",
        "emoji": "💀", "price": "84.90", "compare": "99.90", "stock": 7, "rating": 4.8, "reviews": 201, "featured": True,
        "description": "Réveille les morts, mais jamais vos voisins. Longue robe brodée de runes et faux de "
                       "cérémonie (en tissu, rassurez-vous).",
        "details": PILLOW,
        "art": {"bg": ["#ede9fe", "#6d28d9"], "pattern": "runes", "skin": "#ede4f3", "hair": "#f1f5f9",
                "hair_style": "long", "eyes": "#a855f7", "headwear": "hood", "hood": "#2e1065",
                "weapon": "scythe", "weapon_color": "#a855f7",
                "outfit": {"style": "robe", "top": "#3b0764", "boots": "#1e1b4b", "accent": "#c084fc"}},
    },
    {
        "category": "fantasy", "slug": "barbare-calin-sauvage", "name": "Barbare Câlin Sauvage", "emoji": "🪓",
        "price": "69.90", "compare": None, "stock": 22, "rating": 4.3, "reviews": 118, "featured": False,
        "description": "Tunique de cuir bien fermée, cape en fourrure synthétique et hache à double tranchant… "
                       "de câlins.",
        "details": PILLOW,
        "art": {"bg": ["#ffedd5", "#ea580c"], "pattern": "flames", "skin": "#d6a77a", "hair": "#5b3416",
                "hair_style": "long", "eyes": "#1e3a8a", "headwear": "bandana", "bandana": "#b91c1c",
                "cape": "#7c2d12", "fur_collar": "#f5f5f4", "weapon": "axe",
                "outfit": {"style": "tunic", "top": "#92400e", "bottom": "#57381f", "boots": "#3f2a1d", "accent": "#e7e5e4"}},
    },
    {
        "category": "fantasy", "slug": "mage-noire-tentation", "name": "Mage Noire Tentation", "emoji": "🔮",
        "price": "72.90", "compare": None, "stock": 16, "rating": 4.5, "reviews": 156, "featured": True,
        "description": "Elle maîtrise 47 sorts, dont « Grasse matinée » et « Encore cinq minutes ». "
                       "Chapeau pointu et bâton de mage inclus.",
        "details": PILLOW,
        "art": {"bg": ["#fce7f3", "#db2777"], "pattern": "stars", "skin": "#fbe3d6", "hair": "#a855f7",
                "hair_style": "long", "eyes": "#db2777", "headwear": "witchhat", "hat": "#1e1b4b",
                "weapon": "staff", "weapon_color": "#f472b6",
                "outfit": {"style": "robe", "top": "#1e1b4b", "boots": "#0f172a", "accent": "#f472b6"}},
    },
    {
        "category": "fantasy", "slug": "pretresse-calin-sacre", "name": "Prêtresse du Câlin Sacré", "emoji": "✨",
        "price": "64.90", "compare": None, "stock": 30, "rating": 4.7, "reviews": 98, "featured": False,
        "description": "Bénit votre lit d'un +10 en Récupération. Robe immaculée et auréole lumineuse "
                       "(ne s'allume pas, désolé).",
        "details": PILLOW,
        "art": {"bg": ["#fefce8", "#eab308"], "pattern": "stars", "skin": "#f8dcc8", "hair": "#b45309",
                "hair_style": "long", "eyes": "#0284c7", "headwear": "halo", "weapon": "staff", "weapon_color": "#fde047",
                "outfit": {"style": "robe", "top": "#f8fafc", "boots": "#cbd5e1", "accent": "#eab308"}},
    },
    # ------------------------------------------------------------ sci-fi
    {
        "category": "scifi", "slug": "space-marine-gros-calibre", "name": "Space Marine Gros Calibre", "emoji": "🪐",
        "price": "89.90", "compare": None, "stock": 12, "rating": 4.6, "reviews": 187, "featured": True,
        "description": "Armure énergétique intégrale imprimée en haute définition et 2,5 kg de rembourrage tactique. "
                       "Le seul blaster autorisé dans votre lit.",
        "details": PILLOW,
        "art": {"bg": ["#cffafe", "#0e7490"], "pattern": "hex", "skin": "#e8c4a0", "headwear": "spacehelmet",
                "visor": "#22d3ee", "weapon": "blaster", "weapon_color": "#22d3ee",
                "outfit": {"style": "armor", "top": "#475569", "under": "#1e293b", "bottom": "#334155",
                           "boots": "#1e293b", "accent": "#22d3ee"}},
    },
    {
        "category": "scifi", "slug": "cyber-ninja-nuit-blanche", "name": "Cyber-Ninja Nuit Blanche", "emoji": "🥷",
        "price": "79.90", "compare": "94.90", "stock": 15, "rating": 4.7, "reviews": 241, "featured": True,
        "description": "Furtif, silencieux, rétroéclairé. Disparaît sous la couette en 0,3 seconde. "
                       "Visière néon garantie sans lumière bleue.",
        "details": PILLOW,
        "art": {"bg": ["#4c1d95", "#be185d"], "pattern": "hex", "skin": "#f3d3c0", "hair": "#0f172a",
                "hair_style": "spiky", "headwear": "visor", "visor": "#f0abfc", "weapon": "katana", "weapon_color": "#f0abfc",
                "outfit": {"style": "suit", "top": "#18181b", "boots": "#09090b", "accent": "#f0abfc"}},
    },
    {
        "category": "scifi", "slug": "pilote-mecha-haute-pression", "name": "Pilote de Mecha Haute Pression", "emoji": "🤖",
        "price": "74.90", "compare": None, "stock": 10, "rating": 4.4, "reviews": 76, "featured": False,
        "description": "Combinaison de pilote intégrale, prête au décollage vers le pays des rêves. "
                       "Synchronisation neuronale avec votre oreiller : 400 %.",
        "details": PILLOW,
        "art": {"bg": ["#fee2e2", "#dc2626"], "pattern": "hex", "skin": "#fde2d0", "hair": "#ea580c",
                "hair_style": "bob", "eyes": "#2563eb",
                "outfit": {"style": "suit", "top": "#f8fafc", "boots": "#dc2626", "accent": "#dc2626"}},
    },
    {
        "category": "scifi", "slug": "androide-veille-prolongee", "name": "Androïde Mode Veille Prolongée", "emoji": "🔋",
        "price": "69.90", "compare": None, "stock": 0, "rating": 4.5, "reviews": 132, "featured": False,
        "description": "Batterie infinie, câlins illimités, mises à jour nocturnes. Actuellement en rupture : "
                       "trop de demandes de redémarrage.",
        "details": PILLOW,
        "art": {"bg": ["#e0f2fe", "#0284c7"], "pattern": "hex", "skin": "#dbeafe", "hair": "#e2e8f0",
                "hair_style": "bob", "eyes": "#0ea5e9",
                "outfit": {"style": "suit", "top": "#475569", "boots": "#1e293b", "accent": "#38bdf8"}},
    },
    # ------------------------------------------------------------ rétro
    {
        "category": "retro", "slug": "heros-8bit-vie-bonus", "name": "Héros 8-bit Vie Bonus", "emoji": "🕹️",
        "price": "49.90", "compare": None, "stock": 35, "rating": 4.6, "reviews": 302, "featured": True,
        "description": "Pixel art en 16 couleurs, câlins en haute résolution. Collectionnez-le avant le GAME OVER.",
        "details": PILLOW,
        "art": {"type": "pixel", "sprite": "hero", "bg": ["#bae6fd", "#0369a1"], "pattern": "pixels"},
    },
    {
        "category": "retro", "slug": "reine-pixel-niveau-secret", "name": "Reine Pixel Niveau Secret", "emoji": "👑",
        "price": "49.90", "compare": "59.90", "stock": 21, "rating": 4.7, "reviews": 167, "featured": False,
        "description": "Votre reine n'est pas dans un autre château : elle est dans cette housse. "
                       "Débloque le niveau secret « Grasse mat' ».",
        "details": PILLOW,
        "art": {"type": "pixel", "sprite": "queen", "bg": ["#fce7f3", "#be185d"], "pattern": "pixels"},
    },
    # ------------------------------------------------------------ accessoires (visuel emoji)
    {
        "category": "accessoires", "slug": "garnissage-moelleux-xxl", "name": "Garnissage Moelleux 160 × 50 cm",
        "emoji": "☁️", "color": "#94a3b8", "price": "34.90", "compare": None, "stock": 60, "rating": 4.8,
        "reviews": 410, "featured": False,
        "description": "Le rembourrage qui donne du corps à votre housse. Ne s'affaisse jamais, "
                       "contrairement à vous le lundi matin.",
        "details": ["Dimensions : 160 × 50 cm", "Fibre creuse siliconée, 1,8 kg",
                    "Compatible avec toutes nos housses standard", "Lavable à 30 °C"],
    },
    {
        "category": "accessoires", "slug": "spray-odeur-de-taverne", "name": "Spray d'ambiance « Odeur de Taverne »",
        "emoji": "🍺", "color": "#d97706", "price": "12.90", "compare": None, "stock": 80, "rating": 4.2,
        "reviews": 88, "featured": False,
        "description": "Notes de bois ciré, de pain chaud et d'aventure. Pour des câlins en immersion totale.",
        "details": ["Flacon de 100 ml", "Notes : bois ciré, pain chaud, feu de cheminée", "Ne tache pas les housses"],
    },
    {
        "category": "accessoires", "slug": "sac-discretion-absolue", "name": "Sac de Transport Discrétion Absolue",
        "emoji": "🛍️", "color": "#475569", "price": "19.90", "compare": None, "stock": 45, "rating": 4.9,
        "reviews": 154, "featured": False,
        "description": "Opaque, sobre, sans aucun logo. Personne ne saura jamais qui vous accompagne en week-end.",
        "details": ["70 × 30 × 30 cm, contient un body pillow roulé", "Toile opaque, sans logo", "Bandoulière réglable"],
    },
    {
        "category": "accessoires", "slug": "taie-unie-peau-de-peche", "name": "Taie Unie Peau de Pêche",
        "emoji": "🛏️", "color": "#a78bfa", "price": "24.90", "compare": None, "stock": 50, "rating": 4.4,
        "reviews": 61, "featured": False,
        "description": "Pour les nuits où votre héros a besoin d'une pause. Douce comme un bonus d'XP.",
        "details": ["Housse unie 160 × 50 cm", "Tissu peau de pêche 2 sens", "Coloris : gris perle", "Lavable à 30 °C"],
    },
]


def seed_catalog(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Product)):
        return

    categories = {}
    for position, data in enumerate(CATEGORIES):
        category = Category(position=position, **data)
        db.add(category)
        categories[data["slug"]] = category

    for p in PRODUCTS:
        art = p.get("art")
        db.add(
            Product(
                category=categories[p["category"]],
                slug=p["slug"],
                name=p["name"],
                description=p["description"],
                details=p["details"],
                emoji=p["emoji"],
                color=p.get("color") or art["bg"][1],
                art=art,
                image_url=f"{API_PREFIX}/media/{p['slug']}.svg" if art else None,
                price=Decimal(p["price"]),
                compare_at_price=Decimal(p["compare"]) if p["compare"] else None,
                stock=p["stock"],
                rating=p["rating"],
                reviews_count=p["reviews"],
                is_featured=p["featured"],
            )
        )
    try:
        db.commit()
        logger.info("Catalogue de démonstration inséré : %s produits", len(PRODUCTS))
    except IntegrityError:
        # Une autre instance du service a inséré le catalogue en même temps
        db.rollback()
