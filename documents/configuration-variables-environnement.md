# Configuration et variables d'environnement

Variables qui pilotent la stack, leur valeur par défaut et les services qui les lisent. Elles se règlent dans
le fichier `.env` à la racine (modèle : `.env.example`) ; toutes ont une valeur par défaut dans
`docker-compose.yml`. Les valeurs des secrets ne sont pas reproduites ici.

## Exposition réseau

| Variable | Défaut | Service | Rôle |
|----------|--------|---------|------|
| `HTTP_BIND` | `0.0.0.0` | frontend | Adresse d'écoute du site. Jour J : adresse de la VM sur le point d'accès du consortium |
| `HTTP_PORT` | `8080` | frontend | Port du site et de la passerelle API |
| `ASSISTANT_BIND` | valeur de `HTTP_BIND` | assistant-ui | Adresse d'écoute de l'assistant. `127.0.0.1` : VM seule |
| `ASSISTANT_PORT` | `8083` | assistant-ui | Port de l'assistant |
| `METRICS_BIND` | `127.0.0.1` | metrics-gateway | Adresse d'écoute de la passerelle des métriques : VM seule, Prometheus la joint par le réseau Docker |
| `METRICS_PORT` | `9464` | metrics-gateway | Port de la passerelle des métriques |

Les ports 8081 (`adminer`) et 8082 (`payment-console`) sont fixés sur `127.0.0.1` dans `docker-compose.yml`.

`HTTP_BIND` ne doit pas reprendre `192.168.137.1` : c'est l'adresse du PC Hôte Windows sur son point d'accès,
absente de la VM, et `docker compose up` échouerait (« cannot assign requested address »).

## Bases de données

| Variable | Service | Rôle |
|----------|---------|------|
| `POSTGRES_USER` | postgres | Super-utilisateur (défaut `postgres`) |
| `POSTGRES_PASSWORD` | postgres | Secret : mot de passe du super-utilisateur |
| `AUTH_DB_PASSWORD` | postgres, auth-service | Secret : mot de passe du rôle `auth_user` |
| `SHOP_DB_PASSWORD` | postgres, shop-service | Secret : mot de passe du rôle `shop_user` |
| `PAYMENT_DB_PASSWORD` | postgres, payment-service | Secret : mot de passe du rôle `payment_user` |

Chaque service reçoit une `DATABASE_URL` construite par `docker-compose.yml`
(`postgresql+psycopg://<rôle>:<mot de passe>@postgres:5432/<base>`).

Attention : les mots de passe des rôles ne sont appliqués qu'à la **création** du volume `pgdata`. Le script
d'init ne modifie pas un rôle existant. Changer un mot de passe dans `.env` sur un volume existant empêche le
service de se connecter (`Base indisponible (tentative N/15)` puis redémarrages en boucle) : il faut
`docker compose down -v`, ou changer le mot de passe du rôle à la main dans Postgres.

## Authentification des clients

| Variable | Défaut | Services | Rôle |
|----------|--------|----------|------|
| `JWT_SECRET` | valeur de développement | auth-service, shop-service | Secret de signature HS256, **identique** dans les deux services |
| `JWT_EXPIRE_MINUTES` | `60` | auth-service | Durée de vie des jetons |
| `SEED_DEMO_USERS` | `true` | auth-service | Création des comptes de démo |
| `CORS_ORIGINS` | `http://localhost:8080,http://localhost:5173` | auth-service, shop-service | Origines autorisées par CORS |

Changer `JWT_SECRET` invalide tous les jetons en circulation : les clients connectés sont déconnectés à leur
prochaine requête.

## Paiement et boutique

| Variable | Défaut | Services | Rôle |
|----------|--------|----------|------|
| `MERCHANT_API_KEY` | valeur de développement (`sk_test_…`) | payment-service, shop-service | Secret : clé API du marchand NovaShop |
| `FREE_SHIPPING_THRESHOLD` | `50.00` | shop-service | Sous-total à partir duquel la livraison est offerte |
| `SHIPPING_COST` | `4.90` | shop-service | Frais de livraison sous le seuil |

`MERCHANT_API_KEY` alimente deux variables : `MERCHANT_API_KEY` dans `payment-service` (dont il stocke le
hash) et `PAYMENT_API_KEY` dans `shop-service` (qu'il envoie dans `X-API-Key`). `PAYMENT_SERVICE_URL` est fixé
à `http://payment-service:8000` dans `docker-compose.yml`.

## Rotation de la clé API marchand

1. Générer une nouvelle valeur : `python3 -c "import secrets; print('sk_test_' + secrets.token_urlsafe(32))"`.
2. La mettre dans `MERCHANT_API_KEY` du fichier `.env`.
3. `docker compose up -d` : recrée `payment-service` et `shop-service` avec la nouvelle valeur.
4. Au démarrage, `payment-service` journalise `Marchand de démo novashop : clé API renouvelée`.

Si un seul des deux conteneurs est recréé, les clés ne correspondent plus : `payment-service` répond 401,
`shop-service` journalise `Paiement de la commande … rejeté : 401` et les clients reçoivent 502.

## Assistant documentaire (profil ai)

| Variable | Défaut | Services | Rôle |
|----------|--------|----------|------|
| `LLM_MODEL` | `gemma4:e4b` | ollama-models, rag-service | Modèle de génération |
| `EMBEDDING_MODEL` | `embeddinggemma:latest` | ollama-models, rag-service | Modèle de vectorisation |
| `OLLAMA_KEEP_ALIVE` | `-1` | ollama | Durée de maintien des modèles en mémoire ; `-1` : jamais déchargés (recharger `gemma4:e4b` sur processeur prend plus de 3 minutes) |
| `LLM_THINK` | `true` | rag-service | Mode réflexion (plus juste, environ 10 s de plus sur GPU, bien davantage sur processeur) |
| `RAG_API_KEY` | valeur de développement | rag-service, assistant-ui | Secret : clé entre l'interface et `rag-service` |

## Supervision (profil monitoring)

| Variable | Défaut | Services | Rôle |
|----------|--------|----------|------|
| `METRICS_TOKEN` | valeur de développement (`metrics_…`) | metrics-gateway | Secret : jeton exigé par la passerelle (`Authorization: Bearer`), à reporter dans `prometheus.yml` |
| `LOKI_URL` | aucun (`.env.example` : `http://loki:3100/loki/api/v1/push`) | log-shipper | Adresse d'envoi des journaux : le Loki de la supervision, branché sur le réseau `novashop_monitoring-edge`. Loki installé hors de Docker : `http://<adresse-de-la-VM>:3100/loki/api/v1/push` |

Générer un jeton : `python3 -c "import secrets; print('metrics_' + secrets.token_urlsafe(32))"`. Il ne doit
contenir ni `$` ni guillemet : il est recopié tel quel dans la configuration nginx de la passerelle. Changer le
jeton : `.env`, puis `docker compose --profile monitoring up -d` et mise à jour de `prometheus.yml` dans la
supervision ; d'ici là, Prometheus reçoit des 401 et voit toutes les cibles `down`.

Sans `LOKI_URL`, `log-shipper` démarre quand même mais ses envois échouent sur l'adresse
`loki-url-non-definie.invalid` (visible dans `docker compose logs log-shipper`).

## Réglages internes des services

Ces valeurs sont fixées dans le code (`app/config.py`). Elles peuvent être changées par une variable
d'environnement du même nom, à condition de l'ajouter au service dans `docker-compose.yml`.

| Service | Variable | Défaut | Rôle |
|---------|----------|--------|------|
| shop-service | `PAYMENT_TIMEOUT` | `3.0` | Délai de réponse de `payment-service`, en secondes, par tentative |
| shop-service | `PAYMENT_ATTEMPTS` | `2` | Nombre de tentatives vers `payment-service` |
| shop-service | `MAX_QUANTITY_PER_ITEM` | `10` | Quantité maximale par article |
| shop-service | `SEED_CATALOG` | `true` | Insertion du catalogue de démo |
| auth-service | `BCRYPT_ROUNDS` | `12` | Coût du hachage des mots de passe |
| auth-service, shop-service | `JWT_ALGORITHM`, `JWT_ISSUER` | `HS256`, `novashop-auth` | Format des jetons |
| payment-service | `SEED_MERCHANT`, `MERCHANT_CODE`, `MERCHANT_NAME` | `true`, `novashop`, `NovaShop` | Marchand de démo |
| rag-service | `LLM_TEMPERATURE`, `LLM_NUM_CTX` | `0.2`, `8192` | Génération |
| rag-service | `CHUNK_SIZE`, `CHUNK_OVERLAP`, `RETRIEVAL_K` | `1000`, `150`, `3` | Découpage et nombre d'extraits |
| rag-service | `SYNC_INTERVAL_SECONDS` | `30` | Fréquence de scrutation de `documents/` |
| rag-service | `ATTACHMENT_MAX_CHARS`, `ATTACHMENT_MAX_BYTES` | `6000`, 10 Mo | Fichiers joints : texte donné en entier au modèle, taille maximale |

Le plafond de 10 exemplaires est aussi écrit en dur dans le front (`MAX_QTY` de `CartContext.jsx`) pour le
panier invité : changer `MAX_QUANTITY_PER_ITEM` seul ne suffit pas.

## Réglages fixes de docker-compose.yml

- `OLLAMA_NUM_PARALLEL: 1` : une seule requête à la fois sur Ollama.
- `assistant-ui` : `RAG_SERVICE_URL=http://rag-service:8000/api/rag/v1`. Réglages Streamlit dans
  `services/assistant-ui/.streamlit/config.toml` : fichiers joints de 10 Mo au plus (`maxUploadSize`), aucune
  statistique d'utilisation envoyée (`gatherUsageStats=false`), ni menu de développement (`toolbarMode=minimal`).
- `nginx-exporter` lit `http://frontend:8081/stub_status` ; `docker-socket-proxy` n'autorise que la lecture des
  conteneurs et des réseaux (`CONTAINERS=1`, `NETWORKS=1`, écritures refusées).

## Appliquer une modification de configuration

`docker compose up -d` après avoir modifié `.env` : Compose recrée uniquement les conteneurs dont la
configuration a changé. Ajouter `--profile ai`, `--profile tools` ou `--profile monitoring` pour les services de
ces profils. Pour
générer un secret : `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
