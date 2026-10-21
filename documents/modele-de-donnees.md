# Modèle de données

Tables des trois bases PostgreSQL (`auth_db`, `shop_db`, `payment_db`) et de l'index de l'assistant. Principe
**database-per-service** : chaque service n'accède qu'à sa base, avec son propre rôle. Pas de clé étrangère
entre services : les liens se font par identifiant. Les tables sont créées par `create_all` au démarrage
(pas de migrations). Code : `services/*/app/models.py`.

## Liens entre les bases

```mermaid
flowchart LR
    U["auth_db.users.id"] -.->|"user_id"| C["shop_db.cart_items"]
    U -.->|"user_id"| O["shop_db.orders"]
    O -.->|"payment_reference = reference"| T["payment_db.transactions"]
    O -.->|"number = merchant_reference<br/>= idempotency_key"| T
```

| Donnée dans shop_db | Référence | Donnée dans l'autre base |
|---------------------|-----------|--------------------------|
| `cart_items.user_id`, `orders.user_id` | UUID de l'utilisateur | `auth_db.users.id` |
| `orders.payment_reference` | `PAY_…` | `payment_db.transactions.reference` |
| `orders.number` | `CMD-…` | `payment_db.transactions.merchant_reference` et `idempotency_key` |

Ces liens ne sont garantis par aucune contrainte : leur cohérence se vérifie par rapprochement (voir
`metriques-journaux-et-signaux.md`).

## Base auth_db (auth-service)

### Table users

| Colonne | Type | Contraintes |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `email` | varchar(255) | Unique, indexé, en minuscules |
| `full_name` | varchar(100) | – |
| `hashed_password` | varchar(60) | Hash bcrypt (toujours 60 caractères) |
| `is_active` | boolean | Défaut `true` |
| `created_at` | timestamptz | Défaut `now()` |

## Base shop_db (shop-service)

```mermaid
erDiagram
    categories ||--o{ products : contient
    products ||--o{ cart_items : "dans le panier"
    orders ||--|{ order_items : comprend
    products |o--o{ order_items : "acheté (SET NULL)"
```

### Table categories

`id` (entier, clé primaire), `slug` (unique), `name`, `emoji`, `position` (ordre d'affichage). Valeurs de
démonstration : `creatures`, `fantasy`, `scifi`, `retro`, `accessoires`.

### Table products

| Colonne | Type | Remarque |
|---------|------|----------|
| `id` | entier | Clé primaire |
| `slug` | varchar(80) | Unique, indexé, utilisé dans les URL |
| `name`, `description` | texte | – |
| `price` | numeric(10,2) | Contrainte `ck_product_price_positive` : > 0 |
| `compare_at_price` | numeric(10,2) | Prix barré, `null` si pas de promotion |
| `stock` | entier | Contrainte `ck_product_stock_non_negative` : ≥ 0 |
| `category_id` | entier | Clé étrangère vers `categories` |
| `details` | JSONB | Liste de caractéristiques |
| `emoji`, `color`, `image_url` | texte | Visuel de secours et URL du SVG |
| `art` | JSONB | Fiche d'apparence lue par `app/art.py` |
| `rating`, `reviews_count`, `is_featured` | – | Tri et mise en avant |
| `created_at` | timestamptz | Tri `newest` |

La contrainte `stock >= 0` empêche en dernier recours toute survente, en plus des verrous posés au paiement.

### Table cart_items

Une ligne par article du panier d'un client connecté : `id`, `user_id` (UUID d'`auth-service`, indexé),
`product_id` (clé étrangère, `ON DELETE CASCADE`), `quantity` (contrainte > 0), `added_at`. Contrainte unique
`uq_cart_user_product` sur `(user_id, product_id)`.

### Table orders

| Colonne | Type | Remarque |
|---------|------|----------|
| `id` | UUID | Clé primaire, utilisée dans `/api/shop/orders/{id}` |
| `number` | varchar(20) | Unique, `CMD-AAMMJJ-XXXXXX` |
| `user_id`, `customer_email` | UUID, texte | Client, repris du JWT |
| `status` | enum `order_status` | `PAID` ou `CANCELLED` |
| `subtotal`, `shipping_cost`, `total` | numeric(10,2) | Calculés par `shop-service` |
| `shipping_name`, `shipping_address`, `shipping_postal_code`, `shipping_city`, `shipping_country` | texte | Adresse de livraison |
| `card_last4` | varchar(4) | Seule donnée de carte conservée |
| `payment_reference` | varchar(32) | Référence `PAY_…` chez `payment-service` |
| `created_at`, `cancelled_at` | timestamptz | `created_at` indexé |

### Table order_items

Lignes de commande, **figées au moment de l'achat** : `product_slug`, `product_name`, `emoji`, `color`,
`image_url`, `unit_price`, `quantity` (> 0), `line_total`. `order_id` : clé étrangère `ON DELETE CASCADE`.
`product_id` : clé étrangère `ON DELETE SET NULL`, pour garder la commande si le produit est supprimé. Un
changement de prix au catalogue ne modifie donc pas les commandes passées.

## Base payment_db (payment-service)

```mermaid
erDiagram
    merchants ||--o{ transactions : encaisse
    transactions ||--|{ transaction_events : journalise
```

### Table merchants

`id` (UUID), `code` (unique, `novashop`), `name` (`NovaShop`), `api_key_hash` (SHA-256 en hexadécimal,
64 caractères, unique), `is_active`, `created_at`. La clé API elle-même n'est jamais stockée.

### Table transactions

| Colonne | Type | Remarque |
|---------|------|----------|
| `id` | UUID | Clé primaire interne |
| `reference` | varchar(32) | Unique, `PAY_` + 16 hexadécimaux |
| `merchant_id` | UUID | Clé étrangère vers `merchants`, indexée |
| `merchant_reference` | varchar(64) | Numéro de commande du marchand, indexé |
| `idempotency_key` | varchar(64) | Unique par marchand (`uq_transaction_idempotency`), facultatif |
| `amount` | numeric(12,2) | Contrainte `ck_transaction_amount_positive` : > 0 |
| `currency` | varchar(3) | `EUR` |
| `status` | enum `transaction_status` | En pratique `CAPTURED`, `DECLINED` ou `REFUNDED` |
| `card_brand`, `card_last4` | texte | Ni numéro complet ni CVC |
| `decline_code`, `decline_message` | texte | Renseignés si `DECLINED` |
| `created_at`, `updated_at`, `captured_at`, `refunded_at` | timestamptz | `created_at` indexé |

### Table transaction_events

Journal en ajout seul : `id` (entier croissant, ordre d'insertion), `transaction_id` (clé étrangère, indexée),
`status`, `message` (200 caractères), `created_at`. Aucune route ne modifie ni ne supprime une ligne de
cette table.

## Données de carte conservées

| Donnée | Navigateur | shop-service | payment-service |
|--------|------------|--------------|-----------------|
| Numéro complet | saisi | en mémoire le temps de l'appel | en mémoire le temps de la décision |
| CVC | saisi | en mémoire | en mémoire |
| Date d'expiration | saisie | en mémoire | en mémoire |
| 4 derniers chiffres | – | `orders.card_last4` | `transactions.card_last4` |
| Marque | – | – | `transactions.card_brand` |

## Index de l'assistant (volume rag-index)

Base Chroma persistée dans le volume `rag-index`, collection `docs-embeddinggemma-latest`. Chaque extrait
stocke son texte, son vecteur et les métadonnées `source` (ex. `documents/modele-de-donnees.md`),
`fingerprint` (empreinte du fichier), `section` (titres Markdown) ou `page` (PDF). Supprimer le volume force
une réindexation complète au démarrage suivant.

## Réinitialiser une base

- Tout effacer : `docker compose down -v` (supprime aussi `pgdata` ; catalogue, comptes de démo et marchand
  sont recréés au démarrage).
- Tables de `shop-service` seulement : voir la commande `DROP TABLE` du README, puis
  `docker compose restart shop-service`.
- Après une modification des modèles, il faut recréer les tables : `create_all` n'ajoute pas les colonnes
  manquantes d'une table existante.
