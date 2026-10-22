# Codes HTTP et messages d'erreur

Catalogue des codes de réponse et des messages exacts renvoyés par la passerelle et par chaque service, avec
leur conséquence (débit, commande, panier). Utile pour interpréter une ligne de journal ou un message affiché
au client. Les messages sont dans le champ `detail` des réponses JSON.

## Codes renvoyés par la passerelle nginx (frontend)

| Code | Cas | Corps |
|------|-----|-------|
| 405 | Méthode autre que GET sur une URL non routée (ex. POST `/api/payment/...`) | Page HTML `405 Not Allowed` |
| 413 | Corps de requête de plus de 1 Mo | Page HTML |
| 502 | `auth-service` ou `shop-service` arrêté, introuvable dans le DNS Docker ou refusant la connexion | Page HTML `502 Bad Gateway` |
| 504 | Service qui ne répond pas dans le délai par défaut de nginx (60 s) | Page HTML |
| 200 `text/html` | GET sur une URL non routée (ex. `/api/payment/...`, `/api/rag/...`) : la SPA est renvoyée | `index.html` |

Une page HTML d'erreur n'a pas de champ `detail` : le front affiche `Le service est momentanément
indisponible` pour un code 5xx.

## Codes communs à toutes les API

| Code | Cas | Message |
|------|-----|---------|
| 401 | JWT invalide ou expiré (`auth-service`, `shop-service`), ou absent (`shop-service`) | `Jeton invalide ou expiré` |
| 401 | JWT absent sur `GET /api/auth/me` | `Not authenticated` |
| 401 | Clé marchand absente ou invalide (`payment-service`) | `Clé API absente ou invalide` |
| 401 | Clé de l'interface absente ou invalide (`rag-service`) | `Clé API invalide ou absente` |
| 404 | Route inconnue | `Not Found` |
| 422 | Corps ou paramètre invalide (format, bornes) | Liste `detail` de `{loc, msg, type}` |
| 500 | Erreur non prévue, notamment base de données injoignable | `Internal Server Error` (texte brut) |

## Codes d'auth-service

| Route | Code | Message |
|-------|------|---------|
| `POST /api/auth/register` | 409 | `Un compte existe déjà avec cet email` |
| `POST /api/auth/register` | 422 | `Le mot de passe doit contenir au moins une lettre et un chiffre`, `Le nom doit contenir au moins 2 caractères` |
| `POST /api/auth/login` | 401 | `Email ou mot de passe incorrect` |
| `GET /api/auth/me` | 401 | `Jeton invalide ou expiré` |

## Codes de shop-service : catalogue et panier

| Route | Code | Message |
|-------|------|---------|
| `GET /api/shop/products/{slug}` | 404 | `Produit introuvable` |
| `GET /api/shop/sets/{set_id}/cards` | 404 | `Set introuvable` |
| `POST /api/shop/cart/items` | 404 | `Produit introuvable` |
| `POST`, `PATCH /api/shop/cart/items…` | 409 | `Maximum 10 exemplaires par article` (carte) ou `Maximum 9999 exemplaires par article` (lot de PokéDollars) |
| `POST`, `PATCH /api/shop/cart/items…` | 409 | `Stock insuffisant pour « <nom> » : plus que N exemplaire(s)` |
| `POST`, `PATCH /api/shop/cart/items…` | 409 | `« <nom> » est en rupture de stock` |
| `PATCH /api/shop/cart/items/{product_id}` | 404 | `Cet article n'est pas dans votre panier` |

## Codes de shop-service : boosters

`POST /api/shop/boosters/{slug}/open` et `POST /api/shop/boosters/{slug}/open-batch` (plusieurs boosters ; payés
en PokéDollars, sans `payment-service`). Pour un lot, le solde doit couvrir tous les boosters, sinon rien n'est
débité ; `count` hors de 1 à 5 : 422.

| Code | Message | Effet |
|------|---------|-------|
| 201 | Ouverture renvoyée (cartes, nouveau solde) | PokéDollars débités, cartes ajoutées à la collection |
| 201 | Même ouverture qu'avant (même `Idempotency-Key`) | Aucun nouveau débit |
| 404 | `Booster introuvable` | Aucun |
| 409 | `Solde insuffisant : il vous manque N PokéDollars` | Aucun |
| 409 | `Clé d'idempotence déjà utilisée pour un autre booster` | Aucun |
| 422 | `Idempotency-Key` qui n'est pas un UUID | Aucun |

`POST /api/shop/boosters/daily` (booster du jour, offert) : 201 avec l'ouverture ; une fois le booster du jour
ouvert, 201 avec la même ouverture (aucun second booster). 404 `Aucun booster à offrir pour le moment` si aucun
booster d'un seul set n'existe.

## Codes de shop-service : machine à sous

`POST /api/shop/slots/spin` (mise en PokéDollars, sans `payment-service`) :

| Code | Message | Effet |
|------|---------|-------|
| 201 | Partie renvoyée (`won`, carte, nouveau solde) | Mise débitée ; carte ajoutée à la collection si gagnée |
| 201 | Même partie qu'avant (même `Idempotency-Key`) | Aucun nouveau débit |
| 404 | `Carte introuvable` | Aucun |
| 409 | `Solde insuffisant : il vous manque N PokéDollars` | Aucun |
| 409 | `Clé d'idempotence déjà utilisée pour une autre carte` | Aucun |
| 422 | `card_id` absent ou trop long, `Idempotency-Key` qui n'est pas un UUID | Aucun |

## Codes de shop-service : paiement d'une commande

`POST /api/shop/orders` :

| Code | Message | Débité ? | Commande | Panier |
|------|---------|----------|----------|--------|
| 201 | Commande renvoyée ; cartes et PokéDollars livrés aussitôt | oui | `PAID` | vidé |
| 400 | `Votre panier est vide` | non | – | – |
| 402 | Motif de la banque, par ex. `Paiement refusé par la banque émettrice` | non | – | conservé |
| 409 | `Stock insuffisant pour : <noms>` | non | – | conservé |
| 422 | `Numéro de carte invalide`, `La carte est expirée` | non | – | conservé |
| 502 | `Le paiement n'a pas pu être traité` | non | – | conservé |
| 503 | `Le service de paiement est momentanément indisponible, veuillez réessayer dans quelques instants` | non | – | conservé |
| 500 | Erreur après débit : la commande n'a pas pu être enregistrée | remboursé aussitôt | – | conservé |

Le 502 signifie que `payment-service` a répondu, mais pas comme prévu : clé API refusée (401), clé
d'idempotence en conflit (409), données refusées (422) ou statut différent de `CAPTURED`. Le détail est dans
le journal de `shop-service` : `Paiement de la commande CMD-… rejeté : <code> <corps>`.

## Codes de shop-service : annulation d'une commande

`POST /api/shop/orders/{id}/cancel` :

| Code | Message | Effet |
|------|---------|-------|
| 200 | Commande renvoyée | Remboursée, `CANCELLED`, cartes et PokéDollars repris, stock restitué |
| 404 | `Commande introuvable` | Aucun |
| 409 | `Cette commande est déjà annulée` | Aucun |
| 409 | `Les PokéDollars de cette commande ont déjà été dépensés : elle ne peut plus être annulée` | Aucun, pas de remboursement |
| 409 | `Certaines cartes de cette commande ne sont plus dans votre collection` | Aucun, pas de remboursement |
| 502 | `Le remboursement n'a pas pu être effectué` | La commande reste `PAID` |
| 503 | `Le service de paiement est momentanément indisponible, veuillez réessayer dans quelques instants` | La commande reste `PAID` |

`GET /api/shop/orders/{id}` répond aussi 404 `Commande introuvable`.

## Codes de payment-service

| Route | Code | Message |
|-------|------|---------|
| `POST /api/payment/transactions` | 201 | Paiement capturé |
| `POST /api/payment/transactions` | 200 | Requête rejouée (en-tête `Idempotent-Replayed: true`) |
| `POST /api/payment/transactions` | 402 | `Paiement refusé par la banque émettrice`, `Paiement refusé : fonds insuffisants`, `Paiement refusé : carte expirée` |
| `POST /api/payment/transactions` | 409 | `Cette clé d'idempotence a déjà servi pour un autre paiement` |
| `POST /api/payment/transactions` | 422 | `Numéro de carte invalide`, devise autre que `EUR`, `Idempotency-Key` mal formée |
| `GET /api/payment/transactions/{reference}` | 404 | `Transaction introuvable` |
| `POST /api/payment/transactions/{reference}/refund` | 404 | `Transaction introuvable` |
| `POST /api/payment/transactions/{reference}/refund` | 409 | `Seule une transaction capturée peut être remboursée` |

Un 402 de `payment-service` n'est pas une panne : la transaction est enregistrée en `DECLINED`.

## Codes de rag-service

| Route | Code | Message |
|-------|------|---------|
| `POST /api/rag/v1/chat/completions` | 400 | `La conversation doit se terminer par une question de l'utilisateur` |
| `POST /api/rag/v1/chat/completions` | 503 | `Recherche documentaire indisponible (Ollama injoignable ?)` |
| `POST /api/rag/v1/chat/completions` | 503 | `Modèle local indisponible` |
| Réponse en flux interrompue | 200 | Texte `⚠️ Le modèle local ne répond plus, réessayez.` ajouté à la réponse |

## Messages affichés par le front sans code précis

| Message | Cause |
|---------|-------|
| `Impossible de joindre le serveur` | Le navigateur n'atteint pas le port 8080 (frontend arrêté, réseau coupé) |
| `Le service est momentanément indisponible` | Code 5xx sans message JSON (page d'erreur nginx) |
| `La requête est trop volumineuse` | 413 de nginx (corps de plus de 1 Mo) |
| `Erreur <code>` | Autre code sans message |

## Traduction par le front des messages anglais

Les messages par défaut de FastAPI et de Pydantic sont en anglais. Le front (`frontend/src/api.js`) les
traduit avant affichage ; les API, elles, les renvoient tels quels.

| Message de l'API | Affiché par le front |
|------------------|----------------------|
| `Not Found` | `Ressource introuvable` |
| `Not authenticated` | `Vous devez être connecté` |
| `Method Not Allowed` | `Action non autorisée` |
| `There was an error parsing the body` | `Requête invalide` |

Pour un 422, chaque élément de la liste `detail` devient une phrase, préfixée par le libellé du champ
(dernier élément de `loc`) ; les phrases sont séparées par ` · ` :

| `type` Pydantic | Exemple affiché |
|-----------------|-----------------|
| `missing` | `Email : champ obligatoire` |
| `string_too_short`, `string_too_long` | `Mot de passe : 8 caractère(s) minimum` |
| `string_pattern_mismatch` | `Code postal invalide`, `Date d'expiration invalide (format MM/AA)`, `Le CVC doit comporter 3 ou 4 chiffres` |
| `greater_than_equal`, `less_than_equal` | `Quantité : la valeur doit être supérieure ou égale à 1` |
| `int_parsing` | `Produit : nombre attendu` |
| `value_error` (email) | `Adresse email invalide` |
| `value_error` (validateur maison) | Message français du service, sans le préfixe `Value error, ` |
| Autre | `<Champ> : valeur invalide` |

## Comment distinguer une panne d'un refus normal

- **402** au paiement : refus de carte. La plateforme fonctionne. Visible en `DECLINED` dans `payment_db`.
- **409** : conflit métier (stock, double annulation). La plateforme fonctionne.
- **503** au paiement ou à l'annulation : `payment-service` injoignable ou en erreur 5xx deux fois de suite.
- **502** au paiement : `payment-service` répond mais refuse la demande de PokéBling (souvent la clé API).
- **502 HTML de nginx** : `auth-service` ou `shop-service` injoignable.
- **500** : erreur interne, le plus souvent la base de données.
