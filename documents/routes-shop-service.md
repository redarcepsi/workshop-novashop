# Routes de shop-service

`shop-service` est l'API du marchand PokéBling (anciennement NovaShop) : boutique de cartes Pokémon numériques.
On y achète des cartes à l'unité et des PokéDollars (monnaie virtuelle) en euros, par carte bancaire ; les
PokéDollars servent à ouvrir des boosters et à jouer à la machine à sous ; un booster est offert chaque jour ;
chaque client a une collection. API FastAPI, préfixe `/api/shop`,
port interne 8000, base `shop_db`. Depuis l'extérieur, elle n'est joignable que par la passerelle nginx :
`http://<hôte>:8080/api/shop/...`. Code : `services/shop-service/app/routers/`.

Le catalogue, la liste des boosters et les règles de la machine à sous sont publics. Le panier, les commandes, le
porte-monnaie, la collection, l'ouverture de boosters (booster du jour compris) et les parties de machine à sous
exigent un JWT délivré par `auth-service`, vérifié localement par `shop-service`. Sans jeton valide : 401
`Jeton invalide ou expiré`.

## Résumé des routes de shop-service

| Méthode | Route | Auth | Rôle |
|---------|-------|------|------|
| GET | `/api/shop/sets` | – | Sets de cartes et nombre de cartes de chacun |
| GET | `/api/shop/sets/{set_id}/cards` | – | Toutes les cartes d'un set |
| GET | `/api/shop/products` | – | Recherche, filtres, tri, pagination (cartes et lots de PokéDollars) |
| GET | `/api/shop/products/{slug}` | – | Détail d'un produit |
| GET | `/api/shop/boosters` | – | Boosters, prix en PokéDollars et probabilités |
| POST | `/api/shop/boosters/{slug}/open` | JWT | Payer un booster en PokéDollars et l'ouvrir |
| POST | `/api/shop/boosters/{slug}/open-batch` | JWT | Payer et ouvrir jusqu'à 5 boosters d'un coup |
| GET | `/api/shop/boosters/daily` | JWT | Mon booster du jour (offert) : lequel, déjà ouvert ou non, prochain à minuit |
| POST | `/api/shop/boosters/daily` | JWT | Ouvrir gratuitement mon booster du jour (un par jour) |
| GET | `/api/shop/slots` | – | Machine à sous : mise et chance de gain par rareté |
| POST | `/api/shop/slots/spin` | JWT | Machine à sous : miser des PokéDollars pour tenter de gagner une carte choisie |
| POST | `/api/shop/cart/quote` | – | Chiffrer un panier invité |
| GET | `/api/shop/cart` | JWT | Mon panier |
| POST | `/api/shop/cart/items` | JWT | Ajouter un article |
| PATCH | `/api/shop/cart/items/{product_id}` | JWT | Modifier la quantité |
| DELETE | `/api/shop/cart/items/{product_id}` | JWT | Retirer un article |
| DELETE | `/api/shop/cart` | JWT | Vider le panier |
| POST | `/api/shop/cart/merge` | JWT | Fusionner le panier invité |
| POST | `/api/shop/orders` | JWT | Payer le panier par carte (appelle payment-service) |
| GET | `/api/shop/orders` | JWT | Mes commandes |
| GET | `/api/shop/orders/{id}` | JWT | Détail d'une commande |
| POST | `/api/shop/orders/{id}/cancel` | JWT | Annuler et rembourser (appelle payment-service) |
| GET | `/api/shop/wallet` | JWT | Solde de PokéDollars et derniers mouvements |
| GET | `/api/shop/collection` | JWT | Cartes possédées, avancement par set, valeur, boosters ouverts |
| GET | `/api/shop/health` | – | Sonde de santé |
| GET | `/metrics` | – | Métriques Prometheus, hors préfixe : relayée par `metrics-gateway` seulement |

Les anciennes routes de NovaShop `/api/shop/categories` et `/api/shop/media/{slug}.svg` n'existent plus (404).

## Catalogue de shop-service

Les cartes viennent de l'API publique **TCGdex** (tcgdex.dev), en français : 16 sets (Set de Base, Jungle,
Fossile ; les 11 sets de la série Noir & Blanc ; 151, Évolutions Prismatiques), 1 797 cartes (les énergies de
base sont exclues). Noms et caractéristiques
sont enregistrés dans `services/shop-service/app/data/cards.json`, généré par `tools/fetch_pokemon_cards.py` :
`shop-service` n'a pas besoin d'Internet. Les **images** restent chez TCGdex : le navigateur les charge
directement depuis `assets.tcgdex.net`. Sans accès à Internet côté poste client, le site affiche une carte de
secours dessinée en CSS (nom, PV, set, numéro).

### GET /api/shop/sets

Les sets, par série puis par date de sortie : `[{"id": "base1", "name": "Set de Base", "serie": "Base",
"release_date": "1999-01-09", "logo_url": "https://assets.tcgdex.net/…/logo", "card_count": 96}, …]`.
Identifiants : `base1`, `base2`, `base3`, `bw1` à `bw6`, `dv1` (Coffre des Dragons), `bw7` à `bw10`, `sv03.5`,
`sv08.5`. Le champ `serie` (`Base`, `Noir & Blanc`, `Écarlate et Violet`) figure aussi dans le `set` de chaque
carte et de chaque booster.

Paliers de rareté (`rarity`) : pour la série Noir & Blanc, TCGdex ne distingue pas les holos des rares. Les cartes
EX y forment le palier `HOLO` (libellé `Rare EX`), les full art le palier `ULTRA`, les « Magnifique rare » le
palier `SECRET`. Toutes les cartes du Coffre des Dragons sont holo ; Kyurem (21/20) en est la carte secrète.

### GET /api/shop/sets/{set_id}/cards

Toutes les cartes d'un set, triées par numéro (format « Carte » ci-dessous). Sert à la page Collection pour
afficher les cartes manquantes. 404 : `Set introuvable`.

### GET /api/shop/products

Recherche dans le catalogue public. Paramètres de requête, tous facultatifs :

- `kind` : `CARD` (cartes à l'unité) ou `POKEDOLLARS` (lots de PokéDollars) ;
- `set` : identifiant de set ; `rarity` : `COMMON`, `UNCOMMON`, `RARE`, `HOLO`, `ULTRA`, `SECRET` ;
- `type` : type de Pokémon (`Feu`, `Eau`, `Plante`, `Électrique`, `Psy`, `Combat`, `Obscurité`, `Métal`,
  `Dragon`, `Incolore`) ; `category` : `Pokémon`, `Dresseur` ou `Énergie` ;
- `q` : texte cherché dans le nom de la carte et du set, sans tenir compte de la casse (100 caractères max) ;
- `featured` : `true` = cartes d'exception seulement ; `on_sale=true` : en promotion ; `in_stock=true` : masque
  les ruptures (les lots de PokéDollars, illimités, restent) ;
- `sort` : `featured` (défaut : mises en avant, puis rareté, puis prix), `price_asc`, `price_desc`, `rarity`,
  `number` (ordre du set), `name`, `newest` ;
- `limit` : 1 à 100, défaut 24 ; `offset` : défaut 0.

Réponse : `{"items": [produit, …], "total": 1797, "limit": 24, "offset": 0}`. Valeur hors bornes : 422.

### GET /api/shop/products/{slug}

Détail d'un produit, par exemple `/api/shop/products/base1-4-dracaufeu` (Dracaufeu du Set de Base) ou
`/api/shop/products/pokedollars-1200`. 404 : `Produit introuvable`.

### Prix des cartes à l'unité

Fixés à l'insertion de la carte, selon la rareté : commune 1,49 €, peu commune 2,99 €, rare 6,99 €, holo 17,99 €,
ultra rare 34,99 €, secrète 79,99 € ; × 1,6 pour les Pokémon les plus recherchés ; quelques « graals » à prix
fixe (Dracaufeu du Set de Base 249,99 €, Noctali-ex illustration spéciale 349,99 €, Dracaufeu chromatique de
Tempête Plasma 149,99 €). Stock limité (1 exemplaire
pour les secrètes), quelques ruptures et promotions. L'achat direct est donc cher comparé à un booster.

### Lots de PokéDollars

| Slug | PokéDollars | Prix | Bonus |
|------|-------------|------|-------|
| `pokedollars-500` | 500 | 4,99 € | – |
| `pokedollars-1200` | 1 200 | 9,99 € | +20 % |
| `pokedollars-2600` | 2 600 | 19,99 € | +30 % |
| `pokedollars-7000` | 7 000 | 49,99 € | +40 % |

Stock illimité (`stock: null`) : un lot de PokéDollars ne peut jamais être en rupture. C'est l'article à
utiliser pour une transaction de test répétable (preuve de reprise).

## Boosters de shop-service

Les boosters se paient en **PokéDollars**, jamais par carte bancaire : leur ouverture ne passe pas par
`payment-service`. Déroulé détaillé : `processus-boosters-et-pokedollars.md`.

### GET /api/shop/boosters

17 boosters, un par set, plus le Légendaire :

| Slug | Prix | Sets | Contenu |
|------|------|------|---------|
| `set-de-base` | 300 | `base1` | 6 cartes : 3 communes, 2 peu communes, 1 rare (holo 1 fois sur 3) |
| `jungle` | 250 | `base2` | idem |
| `fossile` | 250 | `base3` | idem |
| `noir-et-blanc` | 300 | `bw1` | 6 cartes : 3 communes, 1 peu commune, 1 variante, 1 rare ou mieux |
| `pouvoirs-emergents`, `nobles-victoires`, `destinees-futures`, `explorateurs-obscurs`, `dragons-exaltes` | 300 | `bw2` à `bw6` | idem |
| `coffre-des-dragons` | 500 | `dv1` | 5 cartes holo (Kyurem, la carte secrète, 1 fois sur 143) |
| `frontieres-franchies`, `tempete-plasma`, `glaciation-plasma`, `explosion-plasma` | 300 | `bw7` à `bw10` | 6 cartes : 3 communes, 1 peu commune, 1 variante, 1 rare ou mieux |
| `151` | 400 | `sv03.5` | 6 cartes : 3 communes, 1 peu commune, 1 variante, 1 rare ou mieux |
| `evolutions-prismatiques` | 450 | `sv08.5` | idem |
| `legendaire` | 3 500 | `base1` à `base3`, `sv03.5`, `sv08.5` | 4 cartes holo ou mieux, dont deux ultra rares ou secrètes |

Chaque booster renvoie `odds` : la probabilité d'obtenir au moins une carte de chaque rareté, calculée à partir
des poids de tirage (ex. Set de Base : holo 33,3 %). Les sets de chaque booster ont un champ `serie`, avec lequel
le front regroupe la page Boosters (un booster de plusieurs sets est classé « Édition premium »).

Prix, contenu et poids des boosters sont relus dans `seed.py` à chaque démarrage de `shop-service` : les modifier
ne demande qu'un redémarrage. Les ouvertures déjà faites gardent le prix payé (`booster_openings.price`).

### POST /api/shop/boosters/{slug}/open

Débite le prix sur le porte-monnaie, tire les cartes **côté serveur** et les ajoute à la collection, en une
seule transaction. En-tête facultatif `Idempotency-Key: <UUID>` : une requête rejouée avec la même clé renvoie
la même ouverture sans redébiter (le front en envoie une par ouverture).

Réponse 201 : `{"id", "booster": {"slug", "name"}, "price", "balance", "cards": [{"card": carte, "is_new": true}, …],
"opened_at"}`, cartes dans l'ordre de révélation (la plus rare en dernier).

- 404 : `Booster introuvable` ;
- 409 : `Solde insuffisant : il vous manque N PokéDollars`, ou `Clé d'idempotence déjà utilisée pour un autre
  booster` ;
- 422 : `Idempotency-Key` qui n'est pas un UUID.

### POST /api/shop/boosters/{slug}/open-batch

Ouvre plusieurs boosters identiques d'un coup : paramètre `count` (1 à 5, défaut 5). Une seule transaction :
tous les boosters sont payés et ouverts, ou aucun. Si le solde ne couvre pas tout le lot, 409 et rien n'est
débité, même si un booster seul passerait. Une ligne `wallet_entries` et une ligne `booster_openings` par booster.
Une carte n'est « nouvelle » (`is_new`) qu'une fois dans le lot.

`Idempotency-Key` facultatif, comme pour l'ouverture simple : le serveur en dérive une clé par booster (UUID v5),
une requête rejouée renvoie les mêmes ouvertures sans redébiter.

Réponse 201 : `{"booster": {"slug", "name"}, "count", "price" (total débité), "balance", "openings": [ouverture,
…]}`, chaque ouverture au format de `POST /open`. Erreurs : celles de l'ouverture simple, plus 422 si `count`
sort de 1 à 5. Le front s'en sert pour le bouton « × 5 » de la page Boosters.

### GET /api/shop/boosters/daily

Le booster offert aujourd'hui à l'utilisateur connecté : tiré au hasard parmi les 16 boosters d'un seul set
(le Légendaire, « Édition premium », est exclu), il reste le même toute la journée (heure de Paris). Réponse :
`{"day": "2026-10-22", "booster": booster (format de GET /boosters), "claimed": false, "claimed_at": null,
"next_at": "2026-10-23T00:00:00+02:00"}`.

### POST /api/shop/boosters/daily

Ouvre gratuitement le booster du jour : cartes tirées côté serveur, ajoutées à la collection, rien n'est débité
(`price` = 0, pas de ligne `wallet_entries`). Un seul par jour et par joueur : une fois ouvert, l'appel renvoie la
même ouverture (pas besoin d'`Idempotency-Key`). Réponse 201 au format de `POST /boosters/{slug}/open`.

## Machine à sous de shop-service

Le joueur choisit n'importe quelle carte du catalogue (1 797, même en rupture de stock), mise des PokéDollars et
gagne la carte ou rien. Mise et chance dépendent de la rareté de la carte. Déroulé :
`processus-boosters-et-pokedollars.md`.

### GET /api/shop/slots

Public. `[{"rarity": "COMMON", "stake": 20, "chance": 0.5}, …]` :

| Rareté | Mise (PokéDollars) | Chance de gagner | Coût moyen d'une carte |
|--------|--------------------|------------------|------------------------|
| `COMMON` | 20 | 50 % | 40 |
| `UNCOMMON` | 40 | 30 % | 133 |
| `RARE` | 100 | 15 % | 667 |
| `HOLO` | 200 | 10 % | 2 000 |
| `ULTRA` | 400 | 7 % | 5 714 |
| `SECRET` | 750 | 4 % | 18 750 |

Valeurs dans `slot_service.RULES` (`services/shop-service/app/slot_service.py`) : les modifier ne demande qu'un
redémarrage de `shop-service`.

### POST /api/shop/slots/spin

Corps `{"card_id": "base1-4"}`, en-tête facultatif `Idempotency-Key: <UUID>` (une requête rejouée renvoie la
même partie sans redébiter). Une seule transaction : débit de la mise (`wallet_entries`, `reason = SLOT`), tirage
côté serveur, ajout de la carte à la collection en cas de gain, historique dans `slot_spins`.

Réponse 201 : `{"id", "card": carte, "stake", "chance", "won": true, "is_new": true, "balance", "spun_at"}`.

- 404 : `Carte introuvable` ;
- 409 : `Solde insuffisant : il vous manque N PokéDollars`, ou `Clé d'idempotence déjà utilisée pour une autre
  carte` ;
- 422 : `card_id` absent ou de plus de 30 caractères, `Idempotency-Key` qui n'est pas un UUID.

## Panier de shop-service

Le prix, le stock et les totaux sont toujours recalculés par `shop-service` à partir de la base, jamais
repris du navigateur. Quantité par article : 1 à 10 pour une carte (`max_quantity_per_item`) ; pour un lot de
PokéDollars, pas de limite commerciale, seulement un plafond technique de 9 999 (`max_pokedollar_packs_per_item`).
Tout est numérique : pas de frais de port. Toutes les routes du panier renvoient le panier complet à jour.

### POST /api/shop/cart/quote

**Sans authentification.** Chiffre le panier d'un visiteur non connecté, que le front garde dans
`localStorage`. Corps : `{"items": [{"product_id": 1, "quantity": 2}, …]}` (50 lignes max). Les produits
inconnus sont ignorés et les quantités d'un même produit additionnées. Rien n'est écrit en base.

### GET /api/shop/cart

Panier de l'utilisateur connecté : lignes, `total`, et ce qui sera livré au paiement (`pokedollars`,
`cards_count`). Chaque ligne indique `available: false` si le stock est devenu insuffisant.

### POST /api/shop/cart/items

Ajoute un article : corps `{"product_id": 1, "quantity": 1}`. La quantité s'ajoute à celle déjà présente.

- 404 : `Produit introuvable`.
- 409 : `Maximum N exemplaires par article` (10 pour une carte, 9999 pour un lot de PokéDollars), `Stock insuffisant pour « <nom> » : plus que N exemplaire(s)` ou
  `« <nom> » est en rupture de stock`.

### PATCH /api/shop/cart/items/{product_id}

Remplace la quantité d'une ligne : corps `{"quantity": 3}`.
404 : `Cet article n'est pas dans votre panier`. 409 : mêmes messages de stock que l'ajout.

### DELETE /api/shop/cart/items/{product_id}

Retire un article. Ne renvoie pas d'erreur si l'article n'était pas dans le panier.

### DELETE /api/shop/cart

Vide le panier de l'utilisateur connecté.

### POST /api/shop/cart/merge

Appelé par le front juste après la connexion : verse le panier invité dans le panier du compte. Corps
identique à `/cart/quote`. Pour chaque produit, la quantité devient
`min(quantité existante + quantité invitée, stock, 10)` (sans plafond de stock pour les PokéDollars). Les
produits inconnus ou en rupture sont ignorés, sans erreur.

## Commandes de shop-service

### POST /api/shop/orders

Transforme le panier en commande payée. C'est la seule route de la boutique qui débite une carte bancaire :
elle appelle `POST /api/payment/transactions` sur `payment-service`. Corps :

```json
{"payment": {"card_number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123"}}
```

Plus d'adresse de livraison : un champ `shipping` envoyé par un ancien client ou script est ignoré. Au paiement,
la livraison est immédiate : cartes ajoutées à la collection, PokéDollars crédités sur le porte-monnaie.

Réponses : 201 commande créée ; 400 `Votre panier est vide` ; 402 carte refusée ; 409 stock insuffisant ;
422 validation (carte invalide ou expirée) ; 502 réponse inattendue de la plateforme ; 503 plateforme
injoignable, rien n'est débité. Déroulé complet : `processus-commande-et-paiement.md`.

### GET /api/shop/orders

Les 100 dernières commandes de l'utilisateur connecté, des plus récentes aux plus anciennes.

### GET /api/shop/orders/{id}

Détail d'une commande (`id` = UUID). 404 `Commande introuvable` si elle n'existe pas ou appartient à un autre
utilisateur.

### POST /api/shop/orders/{id}/cancel

Annule une commande payée : vérifie que les PokéDollars achetés sont encore sur le porte-monnaie et les cartes
achetées dans la collection, fait rembourser la transaction par `payment-service`
(`POST /api/payment/transactions/{reference}/refund`), reprend PokéDollars et cartes, remet les cartes en stock
et passe la commande en `CANCELLED`. Réponses : 200 ; 404 ; 409 `Cette commande est déjà annulée`,
`Les PokéDollars de cette commande ont déjà été dépensés : elle ne peut plus être annulée` ou
`Certaines cartes de cette commande ne sont plus dans votre collection` ; 502 remboursement refusé ; 503
plateforme injoignable, la commande reste payée. Déroulé : `processus-annulation-et-remboursement.md`.

## Porte-monnaie et collection

### GET /api/shop/wallet

`{"balance": 1200, "entries": [{"amount": -400, "balance_after": 800, "reason": "BOOSTER",
"reference": "<uuid de l'ouverture>", "label": "Ouverture : Booster 151", "created_at": …}, …]}` : solde et
30 derniers mouvements. `reason` : `PURCHASE` (achat, référence = numéro de commande), `BOOSTER`, `REFUND`
(annulation), `SLOT` (mise à la machine à sous, référence = identifiant de la partie). Un utilisateur qui n'a
jamais rien acheté a un solde de 0.

### GET /api/shop/collection

`distinct` (cartes différentes), `copies` (exemplaires), `total` (1 797), `value` (valeur au prix de la
boutique), `sets` (`id`, `name`, `logo_url`, `owned`, `total` par set), `boosters` (boosters ouverts, du plus
acheté au moins acheté : `slug`, `name`, `card_count`, `sets`, `cover`, `colors`, `opened`, `spent` en
PokéDollars, `last_opened_at` ; les boosters du jour comptent dans `opened`, pour 0 dans `spent`), `items`
(`card`, `quantity`, `first_obtained_at`).

## Système et documentation de shop-service

- `GET /api/shop/health` : `{"status": "ok", "service": "shop-service"}`, sans interroger la base.
- Swagger : `/api/shop/docs`, ReDoc : `/api/shop/redoc`, OpenAPI : `/api/shop/openapi.json`. Dans Swagger,
  **Authorize** attend le `access_token` obtenu avec `POST /api/auth/login`.

## Formats de réponse de shop-service

### Carte

`id` (identifiant TCGdex, ex. `base1-4`), `slug`, `number`, `name`, `category`, `rarity` (palier),
`rarity_label` (libellé d'origine, ex. `Illustration spéciale rare`), `types`, `hp`, `illustrator`,
`description` (texte du Pokédex), `image_url` (à compléter par `/low.webp` ou `/high.webp`), `set` (`id`,
`name`, `logo_url`).

### Produit

`id`, `slug`, `kind` (`CARD` ou `POKEDOLLARS`), `name`, `description`, `price`, `compare_at_price` (prix barré
ou `null`), `stock` (`null` = illimité), `card` (carte, ou `null`), `pokedollars` (montant crédité, ou `null`),
`is_featured`, plus deux champs calculés : `in_stock` et `discount_percent`.

### Panier

`items` (chaque ligne : `product`, `quantity`, `line_total`, `available`), `items_count`, `total`,
`pokedollars`, `cards_count`. Montants en chaînes décimales, par exemple `"54.90"`.

### Commande

`id`, `number` (`CMD-AAMMJJ-XXXXXX`), `status` (`PAID` ou `CANCELLED`), `items` (nom et prix figés au moment
de l'achat, `kind`, `card_id`, `pokedollars`, `image_url`), `total`, `pokedollars` (crédités par la commande),
`card_last4`, `payment_reference` (`PAY_…`, référence de la transaction chez `payment-service`), `created_at`,
`cancelled_at`, `items_count`.
