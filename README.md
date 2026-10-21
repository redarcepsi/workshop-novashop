# Plateforme de paiement fictive et sa boutique marchande NovaShop

Démonstrateur du workshop **PROJECT RESILIENCE-ALPHA** : une **plateforme de paiement** fictive
(`payment-service`) qui encaisse les paiements par carte pour le compte de marchands, et un marchand
de démonstration, la boutique en ligne **NovaShop**, qui génère des transactions réelles de bout en bout.
**Aucun paiement réel, aucune donnée bancaire réelle.**

- **payment-service** est le système critique : transactions, remboursements, journal des opérations.
  C'est lui qui est attaqué, surveillé et rétabli. La preuve de reprise est une nouvelle transaction acceptée.
- **NovaShop** est un marchand partenaire : site e-commerce spécialisé en **body pillows de personnages de
  jeu vidéo** (accueil, catalogue filtrable, fiches produit recto / verso, panier, paiement, suivi des commandes).

Les personnages sont **originaux** (dragonne, paladin, nécromancienne, cyber-ninja, slime, héros 8-bit…),
adultes et entièrement habillés. Leurs illustrations sont générées en SVG par shop-service à partir
d'une « fiche d'apparence » stockée en base (`products.art`), voir `services/shop-service/app/art.py`.

## Comptes de démonstration

Créés automatiquement au démarrage d'auth-service (désactivable avec `SEED_DEMO_USERS=false`) :

| Nom          | Email              | Mot de passe |
|--------------|--------------------|--------------|
| Léo Martin   | `leo@novashop.fr`  | `Demo1234`   |
| Inès Durand  | `ines@novashop.fr` | `Demo1234`   |

Sur la page de connexion, un clic sur un compte de démo suffit pour se connecter.

## Architecture

```mermaid
flowchart LR
    U[Navigateur] -->|":8080 (HTTP_BIND)"| F

    F[frontend<br/>nginx + React/Tailwind<br/>passerelle /api/*]
    A[auth-service<br/>FastAPI · bcrypt · JWT]
    S[shop-service · NovaShop<br/>FastAPI · catalogue, panier,<br/>commandes, visuels SVG]
    P[payment-service<br/>FastAPI · transactions,<br/>remboursements, journal]
    DB[(postgres 16<br/>auth_db · shop_db · payment_db)]

    F -->|/api/auth/*| A
    F -->|/api/shop/*| S
    S -->|"X-API-Key + Idempotency-Key"| P
    A --> DB
    S --> DB
    P --> DB
```

| Service           | Rôle                                                              | Publié sur l'hôte          | Base         |
|-------------------|-------------------------------------------------------------------|----------------------------|--------------|
| `frontend`        | Sert la SPA React et fait **passerelle API** (reverse proxy)      | `HTTP_BIND:8080`           | –            |
| `auth-service`    | Comptes clients NovaShop : inscription, connexion, JWT            | non                        | `auth_db`    |
| `shop-service`    | NovaShop (marchand) : catalogue, panier, commandes                | non                        | `shop_db`    |
| `payment-service` | Plateforme de paiement : transactions, remboursements, journal    | non                        | `payment_db` |
| `postgres`        | Une instance, **une base + un rôle par service**                  | non                        | –            |
| `adminer` (opt.)  | Interface web Postgres (`--profile tools`)                        | `127.0.0.1:8081` seulement | –            |
| `payment-console` (opt.) | Swagger de payment-service via un proxy (`--profile tools`) | `127.0.0.1:8082` seulement | –     |
| `ollama` (IA)     | Modèles locaux `gemma4:e4b` et `embeddinggemma` (`--profile ai`)  | non                        | –            |
| `rag-service` (IA)| Assistant documentaire LangChain : index Chroma de `documents/`   | non                        | volume `rag-index` |
| `assistant-ui` (IA) | Interface de chat Streamlit de l'assistant (`--profile ai`)     | `HTTP_BIND:8083`           | –            |

### Réseaux et exposition

Seules la passerelle nginx et l'interface de l'assistant (profil `ai`) sont publiées sur le réseau. Chaque service n'est branché que sur les réseaux dont il a besoin :

| Réseau       | Membres                                   | Type                 |
|--------------|-------------------------------------------|----------------------|
| `edge`       | frontend                                  | porte le port publié |
| `frontend`   | frontend, auth-service, shop-service      | `internal`           |
| `payment`    | shop-service, payment-service (+ payment-console) | `internal`   |
| `backend`    | auth-service, shop-service, postgres      | `internal`           |
| `payment-db` | payment-service, postgres                 | `internal`           |
| `tools`      | adminer, payment-console                  | profil `tools`       |
| `ai`         | ollama, rag-service, assistant-ui         | `internal`, profil `ai` |
| `ai-egress`  | ollama (téléchargement des modèles)       | profil `ai`          |
| `assistant-edge` | assistant-ui (porte le port publié)   | profil `ai`          |

Conséquences, vérifiées sur la stack :

- depuis le réseau (point d'accès du consortium, Wi-Fi du campus), seuls les ports 8080 (site) et 8083
  (assistant, profil `ai`) répondent : la base et les API ne sont pas joignables, et le WAF à venir ne pourra pas être contourné en appelant les API directement ;
- `payment-service` n'est joignable que par `shop-service` (ni nginx ni auth-service ne le voient) et, si on
  la lance, par sa console d'exploration sur 127.0.0.1 ;
- un réseau `internal` n'a pas de route vers l'extérieur : les API et la base **ne peuvent rien envoyer
  hors de Docker** (utile face à une tentative d'exfiltration). Seul nginx peut sortir ;
- le jour J, `HTTP_BIND=192.168.137.1` dans `.env` publie le site **uniquement sur le point d'accès** du consortium,
  pas sur le Wi-Fi du campus. Le point d'accès doit alors être actif avant `docker compose up`, et le site
  s'ouvre sur http://192.168.137.1:8080 (plus sur `localhost`). L'assistant suit : http://192.168.137.1:8083.

### Choix de conception

- **Database-per-service** : chaque rôle (`auth_user`, `shop_user`, `payment_user`) n'a accès qu'à sa base.
  Pas de clé étrangère entre services : `cart_items.user_id` / `orders.user_id` référencent l'id de
  l'utilisateur d'auth-service, `transactions.merchant_reference` le numéro de commande NovaShop.
- **Données de carte minimales** : NovaShop transmet la carte à `payment-service` sans la stocker et ne garde
  que les 4 derniers chiffres et la référence `PAY_…`. La plateforme non plus ne stocke ni numéro complet ni CVC.
- **Authentification marchand par clé API** (`X-API-Key`) : la plateforme n'en stocke que le hash SHA-256, et un
  marchand ne voit que ses propres transactions. Elle ne connaît pas le secret JWT des clients NovaShop.
- **Paiements idempotents** : NovaShop envoie son numéro de commande en `Idempotency-Key`. Une requête rejouée
  (nouvelle tentative après un délai dépassé, double envoi) renvoie la transaction d'origine sans redébiter ;
  la même clé avec un autre montant est refusée (409). Les remboursements sont idempotents aussi.
- **Cycle de vie journalisé** : `PENDING → AUTHORIZED → CAPTURED → REFUNDED` (ou `DECLINED`). Chaque changement
  d'état est inscrit dans `transaction_events` (en ajout seul) et dans les logs, au format `clé=valeur`. Toute
  autre transition lève une erreur.
- **Mode dégradé** : si `payment-service` ne répond pas (délai de 3 s, 2 tentatives), NovaShop répond **503**
  sans rien débiter ni modifier ; le catalogue et le panier restent utilisables. Si la commande ne peut pas être
  enregistrée après un débit, NovaShop rembourse aussitôt (compensation).
- **Auth stateless** : auth-service signe un JWT HS256 (`sub`, `email`, `name`, `exp`, `iss`) ;
  shop-service le vérifie **localement** avec le secret partagé, donc sans appel réseau par requête.
- **Le serveur fait foi** : prix, stocks, frais de port et totaux sont toujours recalculés par shop-service,
  jamais envoyés par le navigateur. Les lignes de commande figent le nom et le prix au moment de l'achat.
- **Pas de survente** : au paiement, les produits sont verrouillés (`SELECT … FOR UPDATE`, triés par id
  pour éviter les interblocages). Deux clients ne peuvent pas acheter le dernier exemplaire en même temps.
  Le panier est verrouillé lui aussi, donc un double clic sur « Payer » ne crée pas deux commandes.
- **Panier hybride** : un visiteur non connecté a un panier en `localStorage`, chiffré par `POST /cart/quote`.
  À la connexion, il est fusionné dans le panier serveur (`POST /cart/merge`).
- **Isolation réseau** : Postgres n'est que sur le réseau `backend` ; le frontend ne peut pas l'atteindre.
- Images Python non-root avec `HEALTHCHECK` ; `depends_on: service_healthy` orchestre le démarrage.
- Le catalogue de démonstration (5 univers, 17 body pillows + 4 accessoires) est inséré automatiquement
  au premier démarrage, ainsi que les comptes de démo.

## Démarrage

Prérequis : Docker Desktop.

```bash
cp .env.example .env          # optionnel : toutes les variables ont une valeur par défaut
docker compose up -d --build
```

> **Volume Postgres créé avant l'arrivée de payment-service** : le script d'init ne tourne qu'à la création du
> volume. Il est idempotent, on peut donc le rejouer pour créer `payment_db` sans rien effacer :
> `docker compose up -d postgres && docker compose exec postgres bash /docker-entrypoint-initdb.d/01-init-databases.sh`,
> puis `docker compose up -d --build`.

| URL                                    | Contenu                    |
|----------------------------------------|----------------------------|
| http://localhost:8080                  | Boutique NovaShop          |
| http://localhost:8080/api/shop/docs    | Swagger shop-service       |
| http://localhost:8080/api/auth/docs    | Swagger auth-service       |
| `/api/shop/redoc`, `/api/auth/redoc`   | Documentation ReDoc        |

### Explorer la plateforme de paiement

`payment-service` n'est pas publié. Pour le voir, lancer sa **console d'exploration** (profil `tools`, sur
127.0.0.1 uniquement, donc invisible depuis le réseau) :

```bash
docker compose --profile tools up -d payment-console   # http://127.0.0.1:8082 → Swagger de payment-service
```

Dans Swagger : **Authorize** → coller la clé API du marchand NovaShop (`MERCHANT_API_KEY`, par défaut
`sk_test_novashop_dev_only_change_me`), puis `GET /transactions` liste les paiements passés sur la boutique,
avec leur journal. Pour les tables elles-mêmes : Adminer (`docker compose --profile tools up -d adminer`,
serveur `postgres`, utilisateur `payment_user`, base `payment_db`).

Arrêter la console : `docker compose --profile tools stop payment-console`.

**Cartes de test** (date future et CVC quelconques) :

| Numéro                | Résultat                     |
|-----------------------|------------------------------|
| `4242 4242 4242 4242` | Paiement accepté             |
| `4000 0000 0000 0002` | Refusé par la banque (402)   |
| `4000 0000 0000 9995` | Refusé, fonds insuffisants (402) |

Livraison : 4,90 €, offerte dès 50 € (configurable via `SHIPPING_COST` et `FREE_SHIPPING_THRESHOLD`).

### Tester l'API dans Swagger

1. auth-service → `POST /api/auth/register`
2. Bouton **Authorize** : email dans *username*, mot de passe dans *password*
3. Copier l'`access_token` de `POST /api/auth/login`, puis dans shop-service → **Authorize** → coller le jeton
4. `POST /api/shop/cart/items` → `POST /api/shop/orders`

### Commandes utiles

```bash
docker compose ps                      # état et santé des conteneurs
docker compose logs -f shop-service    # logs d'un service
docker compose --profile tools up -d   # + Adminer (http://127.0.0.1:8081) et console paiement (http://127.0.0.1:8082)
docker compose down                    # arrêter
docker compose down -v                 # arrêter ET supprimer les données (le catalogue sera recréé)
```

> Le script `db/init/01-init-databases.sh` ne s'exécute automatiquement qu'à la **création** du volume. Il crée
> ce qui manque mais ne modifie pas un rôle existant : si vous changez les mots de passe des bases, faites
> `docker compose down -v`.

> Pas de migrations pour l'instant (`create_all`) : après une modification des modèles de shop-service,
> réinitialisez ses tables (le catalogue est recréé au démarrage, les comptes ne sont pas touchés) :
> `docker compose exec postgres psql -U postgres -d shop_db -c "DROP TABLE IF EXISTS order_items, orders, cart_items, products, categories CASCADE; DROP TYPE IF EXISTS order_status;"`
> puis `docker compose restart shop-service`.

## Assistant documentaire des opérateurs (IA)

Un chatbot local qui répond aux questions des opérateurs à partir des documents de l'équipe (procédures,
architecture, PCA/PRA, EBIOS…) et **cite ses sources**. Il est construit avec **LangChain** et **Ollama**
(RAG) et n'a aucun accès au système : il aide à comprendre l'incident, la remédiation reste le travail de
l'automate.

```mermaid
flowchart LR
    O["Opérateur<br/>:8083 (HTTP_BIND)"] -->|"question + fichiers joints"| W[assistant-ui<br/>chat Streamlit]
    W -->|"API compatible OpenAI<br/>Bearer RAG_API_KEY"| R[rag-service<br/>LangChain]
    D[/documents/ + README<br/>lecture seule/] -->|"scruté toutes les 30 s"| R
    R <-->|extraits| C[(Chroma<br/>volume rag-index)]
    R -->|"embeddinggemma : vectorisation<br/>gemma4:e4b : réponse"| L[ollama<br/>GPU si disponible]
```

```bash
docker compose --profile ai up -d                                             # sur le processeur
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ai up -d   # avec une carte NVIDIA
```

- Premier lancement : `ollama-models` télécharge les modèles (environ 7 Go), `rag-service` démarre ensuite.
  Les lancements suivants n'ont plus besoin d'Internet (testé : réseaux Internet coupés, réponses sourcées).
  Hors ligne, lancer sans `--build` et ne jamais faire `down -v`, qui supprime les modèles téléchargés.
- Ouvrir http://localhost:8083 sur le PC Hôte, ou le port 8083 du PC Hôte depuis un autre poste du réseau
  (http://192.168.137.1:8083 le jour J) : une conversation à la manière de Claude, sans historique (recharger
  la page repart de zéro). Pendant une réponse, le bouton d'envoi devient un bouton stop.
- L'interface est publiée comme le site et **sans compte** : tout poste du réseau peut interroger l'assistant,
  donc lire ce que contient `documents/`. `ASSISTANT_BIND=127.0.0.1` dans `.env` la réserve au PC Hôte.
- **Joindre un fichier à une question** (bouton « + » : journal, rapport d'incident, procédure ; texte, PDF,
  Word, 10 Mo au plus) : il ne sert qu'à la conversation en cours, sans être indexé ni enregistré.
- Venant d'une version avec Open WebUI : `docker compose --profile ai up -d --build --remove-orphans` retire son
  conteneur ; son volume se supprime avec `docker volume rm novashop_open-webui-data`.
- **Déposer les fichiers dans [`documents/`](documents/_LISEZ-MOI.md)** (Markdown, texte, YAML, PDF, Word) :
  ils sont indexés en moins de 30 s, sans redémarrage (`docker compose logs -f rag-service` pour suivre).
- Arrêter : `docker compose --profile ai down` (sans `--profile ai`, les services de l'assistant restent lancés).

Choix et garde-fous :

| Sujet | Choix |
|-------|-------|
| Modèle de langage | `gemma4:e4b`, 7,5 Md de paramètres (limite du sujet : 8), sur GPU si disponible |
| Mode réflexion | Activé (`LLM_THINK`) : sans lui, le modèle commet des contresens sur les négations (« la base n'est *pas* joignable »). Environ 10 s de plus, réflexion affichée en direct dans un bloc repliable |
| Embeddings | `embeddinggemma` avec ses préfixes de tâche (`task: search result \| query:` / `title: <fichier › section> \| text:`) |
| Découpage | Markdown découpé par titres puis en extraits d'environ 1 000 caractères (recouvrement 150) ; PDF par page |
| Recherche | **Hybride** : sémantique (Chroma) + mots-clés (BM25, identifiants comme `payment-db` ou `503` gardés exacts), fusionnées par rang (RRF) ; 5 extraits ; une relance courte est complétée par la question précédente |
| Réponse | Uniquement à partir des extraits, numéros cités `[n]`, seuls les extraits cités listés en fin de réponse |
| Injection de consignes | Les extraits sont présentés au modèle comme des données ; l'assistant n'a aucun outil, aucune action possible |
| Fichiers joints | Lus en mémoire par `rag-service`, jamais indexés ni écrits ; en entier jusqu'à 6 000 caractères, au-delà les passages les plus proches de la question (même recherche hybride) ; cités « pièce jointe » |
| Interface | Streamlit (`assistant-ui`) : une conversation, des fichiers joints, la réflexion repliable, la réponse en Markdown ; ni compte, ni historique, ni choix de modèle ; publiée comme le site (`HTTP_BIND`) |
| Isolation | `rag-service` sur un réseau `internal` sans accès à la plateforme ; documents en lecture seule ; `assistant-ui` n'appelle que `rag-service` (ni Ollama, ni web, ni exécution de code) |

## Développement du front sans rebuild

```bash
docker compose up -d
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxy Vite /api → passerelle :8080)
```

## Pages du site

| Route            | Page                                                              |
|------------------|-------------------------------------------------------------------|
| `/`              | Accueil : bannière, avantages, catégories, coups de cœur, promotions |
| `/products`      | Catalogue : recherche, catégories, filtres, tri, pagination       |
| `/products/:slug`| Fiche produit : galerie recto / verso, caractéristiques, stock, ajout au panier |
| `/cart`          | Panier : quantités, suppression, seuil de livraison offerte       |
| `/checkout`      | Adresse + paiement par carte via la plateforme (connexion requise) |
| `/orders`        | Historique des commandes                                          |
| `/orders/:id`    | Détail, confirmation après achat, annulation                      |
| `/login`, `/register` | Authentification (le panier invité est conservé)             |

## Endpoints

**auth-service** (`/api/auth`)

| Méthode | Route       | Auth | Description                                 |
|---------|-------------|------|---------------------------------------------|
| POST    | `/register` | –    | Créer un compte (mot de passe haché bcrypt) |
| POST    | `/login`    | –    | Form OAuth2 → JWT                           |
| GET     | `/me`       | JWT  | Profil courant                              |
| GET     | `/health`   | –    | Sonde de santé                              |

**shop-service** (`/api/shop`)

| Méthode | Route                        | Auth | Description                                            |
|---------|------------------------------|------|--------------------------------------------------------|
| GET     | `/categories`                | –    | Catégories avec nombre de produits                     |
| GET     | `/products`                  | –    | `category`, `q`, `featured`, `on_sale`, `in_stock`, `sort`, `limit`, `offset` |
| GET     | `/products/{slug}`           | –    | Détail d'un produit                                    |
| POST    | `/cart/quote`                | –    | Chiffrer un panier invité                              |
| GET     | `/cart`                      | JWT  | Mon panier (totaux calculés)                           |
| POST    | `/cart/items`                | JWT  | Ajouter un article (409 si stock insuffisant)          |
| PATCH   | `/cart/items/{product_id}`   | JWT  | Modifier la quantité                                   |
| DELETE  | `/cart/items/{product_id}`   | JWT  | Retirer un article                                     |
| DELETE  | `/cart`                      | JWT  | Vider le panier                                        |
| POST    | `/cart/merge`                | JWT  | Fusionner le panier invité après connexion             |
| POST    | `/orders`                    | JWT  | Payer le panier → commande (402 carte refusée, 409 stock, 503 paiement indisponible) |
| GET     | `/orders`                    | JWT  | Mes commandes                                          |
| GET     | `/orders/{id}`               | JWT  | Détail d'une commande                                  |
| POST    | `/orders/{id}/cancel`        | JWT  | Annuler (remboursement via la plateforme + remise en stock) |
| GET     | `/media/{slug}.svg`          | –    | Visuel du produit : `?view=pair` (défaut), `front`, `back` |
| GET     | `/health`                    | –    | Sonde de santé                                         |

**payment-service** (`/api/payment`, réseau interne uniquement)

| Méthode | Route                              | Auth    | Description                                                    |
|---------|------------------------------------|---------|----------------------------------------------------------------|
| POST    | `/transactions`                    | clé API | Payer : 201 capturée, 402 refusée, 200 si rejouée (`Idempotency-Key`), 409 clé déjà utilisée |
| GET     | `/transactions`                    | clé API | Mes transactions : `status`, `merchant_reference`, `limit`, `offset` |
| GET     | `/transactions/{reference}`        | clé API | Détail et journal d'une transaction                            |
| POST    | `/transactions/{reference}/refund` | clé API | Rembourser (idempotent ; 409 si non capturée)                  |
| GET     | `/health`                          | –       | Sonde de santé                                                 |

## Arborescence

```
.
├── docker-compose.yml
├── .env.example
├── db/init/01-init-databases.sh       # crée auth_db / shop_db / payment_db + rôles dédiés (idempotent)
├── services/
│   ├── auth-service/                   # FastAPI : config, database, models, schemas, security, routes
│   │   └── app/seed.py                 # comptes de démonstration
│   ├── shop-service/
│   │   └── app/
│   │       ├── models.py               # Category, Product, CartItem, Order, OrderItem
│   │       ├── seed.py                 # catalogue de démonstration + fiches d'apparence
│   │       ├── art.py                  # générateur d'illustrations SVG (housses recto / verso)
│   │       ├── cart_service.py         # règles du panier (stock, plafonds, frais de port)
│   │       ├── order_service.py        # paiement du panier, annulation (verrous, compensation)
│   │       ├── payment.py              # client de payment-service (clé API, idempotence, 503)
│   │       └── routers/                # catalog.py, cart.py, orders.py, media.py
│   ├── payment-service/
│   │   └── app/
│   │       ├── models.py               # Merchant, Transaction (+ transitions), TransactionEvent
│   │       ├── processor.py            # réseau carte / banque émettrice simulés, cartes de test
│   │       ├── transaction_service.py  # création idempotente, capture, remboursement
│   │       ├── security.py             # authentification marchand par clé API
│   │       ├── seed.py                 # marchand de démo NovaShop
│   │       └── routes.py
│   ├── rag-service/
│   │   └── app/
│   │       ├── indexer.py              # chargement, découpage, synchronisation de documents/ dans Chroma
│   │       ├── embeddings.py           # embeddinggemma avec ses préfixes de tâche
│   │       ├── attachments.py          # fichiers joints dans le chat : lecture en mémoire, choix des passages
│   │       ├── assistant.py            # recherche des extraits, prompt, génération, sources
│   │       └── routes.py               # API compatible OpenAI pour l'interface de chat
│   └── assistant-ui/                   # interface de chat Streamlit (app.py, style.css, .streamlit/config.toml)
├── documents/                          # fichiers lus par l'assistant (voir documents/_LISEZ-MOI.md)
├── docker-compose.gpu.yml              # option : GPU NVIDIA pour Ollama
└── frontend/                           # Vite + React 18 + Tailwind 3, servi par nginx
    ├── nginx.conf                      # SPA + reverse proxy /api/*
    └── src/{pages,components,context,utils}
```

## Pistes d'évolution

- Rapprochement automatique NovaShop ↔ plateforme (commandes payées sans transaction capturée et inversement),
  à brancher sur la vérification post-reprise
- Tokenisation de la carte côté navigateur : le numéro ne transiterait plus par NovaShop
- Migrations **Alembic** à la place de `create_all`
- Back-office admin (gestion des produits et des stocks, rôle dans le JWT)
- Codes promo, liste de souhaits, avis clients
- JWT **RS256** + endpoint JWKS ; refresh tokens ; limitation du débit sur `/login`
- Événements asynchrones (RabbitMQ ou Redis Streams) : email de confirmation, mise à jour des stocks
- Tests (pytest + testcontainers), CI, puis déploiement Kubernetes
