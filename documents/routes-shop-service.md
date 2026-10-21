# Routes de shop-service

`shop-service` est l'API du marchand NovaShop : catalogue, panier, commandes et visuels. API FastAPI,
préfixe `/api/shop`, port interne 8000, base `shop_db`. Depuis l'extérieur, elle n'est joignable que par la
passerelle nginx : `http://<hôte>:8080/api/shop/...`. Code : `services/shop-service/app/routers/`.

Le catalogue est public. Le panier et les commandes exigent un JWT délivré par `auth-service`, vérifié
localement par `shop-service`. Sans jeton valide : 401 `Jeton invalide ou expiré`.

## Résumé des routes de shop-service

| Méthode | Route | Auth | Rôle |
|---------|-------|------|------|
| GET | `/api/shop/categories` | – | Catégories et nombre de produits |
| GET | `/api/shop/products` | – | Recherche, filtres, tri, pagination |
| GET | `/api/shop/products/{slug}` | – | Détail d'un produit |
| POST | `/api/shop/cart/quote` | – | Chiffrer un panier invité |
| GET | `/api/shop/cart` | JWT | Mon panier |
| POST | `/api/shop/cart/items` | JWT | Ajouter un article |
| PATCH | `/api/shop/cart/items/{product_id}` | JWT | Modifier la quantité |
| DELETE | `/api/shop/cart/items/{product_id}` | JWT | Retirer un article |
| DELETE | `/api/shop/cart` | JWT | Vider le panier |
| POST | `/api/shop/cart/merge` | JWT | Fusionner le panier invité |
| POST | `/api/shop/orders` | JWT | Payer le panier (appelle payment-service) |
| GET | `/api/shop/orders` | JWT | Mes commandes |
| GET | `/api/shop/orders/{id}` | JWT | Détail d'une commande |
| POST | `/api/shop/orders/{id}/cancel` | JWT | Annuler et rembourser (appelle payment-service) |
| GET | `/api/shop/media/{slug}.svg` | – | Visuel SVG du produit |
| GET | `/api/shop/health` | – | Sonde de santé |
| GET | `/metrics` | – | Métriques Prometheus, hors préfixe : relayée par `metrics-gateway` seulement |

## Catalogue de shop-service

### GET /api/shop/categories

Liste les catégories, triées par position, avec le nombre de produits de chacune.
Réponse : `[{"slug": "creatures", "name": "Créatures & monstres", "emoji": "🐉", "product_count": 5}, …]`.
Catégories de démonstration : `creatures`, `fantasy`, `scifi`, `retro`, `accessoires`.

### GET /api/shop/products

Recherche dans le catalogue public. Paramètres de requête, tous facultatifs :

- `category` : slug de catégorie ;
- `q` : texte cherché dans le nom et la description, sans tenir compte de la casse (100 caractères max) ;
- `featured` : `true` = coups de cœur seulement, `false` = les autres ;
- `on_sale=true` : produits en promotion (`compare_at_price` > `price`) ;
- `in_stock=true` : masque les produits en rupture ;
- `sort` : `popular` (défaut, nombre d'avis), `price_asc`, `price_desc`, `rating`, `newest` ;
- `limit` : 1 à 100, défaut 12 ; `offset` : défaut 0.

Réponse : `{"items": [produit, …], "total": 21, "limit": 12, "offset": 0}`. Valeur hors bornes : 422.

### GET /api/shop/products/{slug}

Détail d'un produit par son slug, par exemple `/api/shop/products/dragonnette-xxl`.
404 : `Produit introuvable`.

## Panier de shop-service

Le prix, le stock et les totaux sont toujours recalculés par `shop-service` à partir de la base, jamais
repris du navigateur. Quantité par article : 1 à 10 (`max_quantity_per_item`). Livraison : 4,90 €, offerte
dès 50 € de sous-total. Toutes les routes du panier renvoient le panier complet à jour.

### POST /api/shop/cart/quote

**Sans authentification.** Chiffre le panier d'un visiteur non connecté, que le front garde dans
`localStorage`. Corps : `{"items": [{"product_id": 1, "quantity": 2}, …]}` (50 lignes max). Les produits
inconnus sont ignorés et les quantités d'un même produit additionnées. Rien n'est écrit en base.

### GET /api/shop/cart

Panier de l'utilisateur connecté, avec sous-total, frais de port, total et montant restant pour la livraison
offerte. Chaque ligne indique `available: false` si le stock est devenu insuffisant.

### POST /api/shop/cart/items

Ajoute un article : corps `{"product_id": 1, "quantity": 1}`. La quantité s'ajoute à celle déjà présente.

- 404 : `Produit introuvable`.
- 409 : `Maximum 10 exemplaires par article`, `Stock insuffisant pour « <nom> » : plus que N disponible(s)` ou
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
`min(quantité existante + quantité invitée, stock, 10)`. Les produits inconnus ou en rupture sont ignorés,
sans erreur.

## Commandes de shop-service

### POST /api/shop/orders

Transforme le panier en commande payée. C'est la seule route de la boutique qui débite une carte : elle
appelle `POST /api/payment/transactions` sur `payment-service`.

Corps :

```json
{
  "shipping": {"full_name": "Alice Martin", "address": "12 rue des Lilas",
               "postal_code": "75011", "city": "Paris", "country": "France"},
  "payment": {"card_number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123"}
}
```

Réponses : 201 commande créée ; 400 `Votre panier est vide` ; 402 carte refusée ; 409 stock insuffisant ;
422 validation (carte invalide ou expirée) ; 502 réponse inattendue de la plateforme ; 503 plateforme
injoignable, rien n'est débité. Déroulé complet : `processus-commande-et-paiement.md`.

### GET /api/shop/orders

Les 100 dernières commandes de l'utilisateur connecté, des plus récentes aux plus anciennes.

### GET /api/shop/orders/{id}

Détail d'une commande (`id` = UUID). 404 `Commande introuvable` si elle n'existe pas ou appartient à un autre
utilisateur.

### POST /api/shop/orders/{id}/cancel

Annule une commande payée : fait rembourser la transaction par `payment-service`
(`POST /api/payment/transactions/{reference}/refund`), remet les articles en stock et passe la commande en
`CANCELLED`. Réponses : 200 ; 404 ; 409 `Cette commande est déjà annulée` ; 502 remboursement refusé ;
503 plateforme injoignable, la commande reste payée. Déroulé : `processus-annulation-et-remboursement.md`.

## Médias de shop-service

### GET /api/shop/media/{slug}.svg

Illustration du body pillow générée à la volée en SVG à partir de la fiche d'apparence du produit
(`products.art`, rendu par `app/art.py`). Paramètre `view` : `pair` (défaut, recto et verso), `front`, `back`.
En-tête `Cache-Control: public, max-age=600`. 404 : `Visuel introuvable`. Ces requêtes représentent l'essentiel
du trafic de la boutique dans les journaux.

## Système et documentation de shop-service

- `GET /api/shop/health` : `{"status": "ok", "service": "shop-service"}`, sans interroger la base.
- Swagger : `/api/shop/docs`, ReDoc : `/api/shop/redoc`, OpenAPI : `/api/shop/openapi.json`. Dans Swagger,
  **Authorize** attend le `access_token` obtenu avec `POST /api/auth/login`.

## Formats de réponse de shop-service

### Produit

`id`, `slug`, `name`, `description`, `details` (liste), `price`, `compare_at_price` (prix barré ou `null`),
`stock`, `category` (`slug`, `name`), `emoji`, `color`, `image_url`, `rating`, `reviews_count`,
`is_featured`, plus deux champs calculés : `in_stock` et `discount_percent`.

### Panier

`items` (chaque ligne : `product`, `quantity`, `line_total`, `available`), `items_count`, `subtotal`,
`shipping_cost`, `total`, `free_shipping_threshold`, `free_shipping_remaining`. Montants en chaînes
décimales, par exemple `"54.90"`.

### Commande

`id`, `number` (`CMD-AAMMJJ-XXXXXX`), `status` (`PAID` ou `CANCELLED`), `items` (nom et prix figés au moment
de l'achat), `subtotal`, `shipping_cost`, `total`, adresse de livraison (`shipping_*`), `card_last4`,
`payment_reference` (`PAY_…`, référence de la transaction chez `payment-service`), `created_at`,
`cancelled_at`, `items_count`.
