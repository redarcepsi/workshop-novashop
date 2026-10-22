# Pages du site et passerelle nginx

Le conteneur `frontend` joue deux rôles : il sert la SPA React de PokéBling et il est la **passerelle API**
(reverse proxy) vers `auth-service` et `shop-service`. C'est le seul point d'entrée publié de la plateforme
(port 8080). Code : `frontend/nginx.conf`, `frontend/src/App.jsx`, `frontend/src/api.js`.

## Routage de la passerelle nginx

| Préfixe d'URL | Destination | Comportement |
|---------------|-------------|--------------|
| `/api/auth/` | `http://auth-service:8000` | Chemin transmis tel quel |
| `/api/shop/` | `http://shop-service:8000` | Chemin transmis tel quel |
| `/assets/` | fichiers statiques | Cache 1 an (`Cache-Control: public, immutable`) |
| `/` (tout le reste) | `index.html` | Routage côté client (React Router) |
| Port 8081, `/stub_status` | compteurs de nginx | Non publié : lu par `nginx-exporter` (profil `monitoring`) |

Chaque service expose déjà son préfixe (`/api/auth`, `/api/shop`), nginx ne réécrit donc pas les chemins.
nginx ajoute `X-Real-IP`, `X-Forwarded-For` et `X-Forwarded-Proto` ; les services Python sont lancés avec
`--proxy-headers` et reprennent l'adresse du client dans leurs journaux.

## Comportements particuliers de la passerelle

- **`/api/payment/*` et `/api/rag/*` ne sont pas routés.** Ils tombent dans `location /` : un GET renvoie la
  page HTML de la SPA (200, `text/html`), un POST renvoie `405 Not Allowed`. Aucune requête n'atteint
  `payment-service` ou `rag-service` par le port 8080.
- **Taille des corps limitée à 1 Mo** (`client_max_body_size 1m`) : au-delà, nginx répond 413 sans
  transmettre la requête.
- **Service injoignable** : si `auth-service` ou `shop-service` est arrêté ou ne répond pas sur son port,
  nginx répond 502 (page HTML). Le front affiche alors `Le service est momentanément indisponible`.
- **Résolution DNS dynamique** (`resolver 127.0.0.11 valid=5s`) : un service recréé avec une nouvelle IP est
  retrouvé en 5 s au plus, sans redémarrer nginx.
- Route d'API inconnue sous `/api/auth/` ou `/api/shop/` : 404 JSON `{"detail": "Not Found"}` renvoyé par
  le service.

## Pages de la SPA PokéBling

| Route | Page | Connexion | Appels d'API |
|-------|------|-----------|--------------|
| `/` | Accueil | – | `GET /api/shop/products`, `GET /api/shop/boosters`, `GET /api/shop/sets` |
| `/cards` | Cartes à l'unité, filtrables (set, rareté, type) | – | `GET /api/shop/sets`, `GET /api/shop/products?kind=CARD&…` |
| `/cards/:slug` | Fiche d'une carte | – | `GET /api/shop/products/{slug}`, la même carte dans d'autres sets ; connecté : `GET /api/shop/collection` |
| `/boosters` | Boosters et ouverture, booster du jour offert | ouverture : oui | `GET /api/shop/boosters`, `POST /api/shop/boosters/{slug}/open`, `…/open-batch` (« × 5 ») ; connecté : `GET` et `POST /api/shop/boosters/daily` |
| `/slots` | Machine à sous : choix d'une carte, mise, rouleaux (`?card=<slug>` présélectionne une carte) | jouer : oui | `GET /api/shop/slots`, `GET /api/shop/products?kind=CARD`, `GET /api/shop/sets`, `POST /api/shop/slots/spin` ; connecté : `GET /api/shop/collection` |
| `/pokedollars` | Lots de PokéDollars, solde et historique | – | `GET /api/shop/products?kind=POKEDOLLARS` ; connecté : `GET /api/shop/wallet` |
| `/collection` | Collection, boosters ouverts, avancement par set | oui | `GET /api/shop/collection`, `GET /api/shop/sets/{id}/cards` |
| `/cart` | Panier | – | Panier invité : `POST /api/shop/cart/quote` ; connecté : routes `/api/shop/cart…` |
| `/checkout` | Paiement par carte | oui | `POST /api/shop/orders` |
| `/orders` | Historique | oui | `GET /api/shop/orders` |
| `/orders/:id` | Détail, annulation | oui | `GET /api/shop/orders/{id}`, `POST /api/shop/orders/{id}/cancel` |
| `/login` | Connexion | – | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/shop/cart/merge` |
| `/register` | Inscription | – | `POST /api/auth/register`, puis connexion |

Les anciennes adresses `/products…` redirigent vers `/cards`, toute autre route vers `/`. En-tête : solde de
PokéDollars de l'utilisateur connecté (`GET /api/shop/wallet`), rechargé après un paiement ou une ouverture. Les pages marquées « oui » renvoient vers `/login` sans session.

## Session et stockage dans le navigateur

- Jeton JWT : `localStorage`, clé `pokebling_token`. Envoyé dans `Authorization: Bearer` à chaque appel.
- Panier invité : `localStorage`, clé `pokebling_guest_cart`, lignes `{product_id, quantity}`.
- Images des cartes et logos des sets : chargés par le navigateur depuis `https://assets.tcgdex.net` (TCGdex),
  pas par nginx. Sans accès à Internet, une carte de secours dessinée en CSS s'affiche à la place.
- Au chargement d'une page avec un jeton : `GET /api/auth/me`. En cas d'échec (jeton expiré, auth-service
  indisponible), le jeton est effacé et l'utilisateur déconnecté.
- Toute réponse 401 d'une route authentifiée déconnecte aussi l'utilisateur.

## Messages d'erreur affichés par le front

Le front affiche le champ `detail` renvoyé par l'API quand c'est un texte (par exemple
`Le service de paiement est momentanément indisponible, veuillez réessayer dans quelques instants`). Pour
les erreurs de validation (422), il affiche les messages séparés par « · ». À défaut :

- erreur 5xx sans message (page 502 de nginx) : `Le service est momentanément indisponible` ;
- serveur injoignable (réseau coupé, frontend arrêté) : `Impossible de joindre le serveur` ;
- autre code : `Erreur <code>`.

Au paiement, une réponse 409 (stock modifié entre-temps) recharge le panier pour afficher les lignes
devenues indisponibles.

## Développement du front sans reconstruire l'image

```bash
docker compose up -d
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Le serveur Vite relaie `/api/*` vers la passerelle `http://localhost:8080` : les API restent atteintes par
nginx, jamais directement.
