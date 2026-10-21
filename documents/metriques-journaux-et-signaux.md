# Métriques, journaux et signaux de la plateforme

Ce que la plateforme produit aujourd'hui comme données d'observation : métriques Prometheus, journaux, sondes de
santé, état des conteneurs et indicateurs calculables en base. C'est la matière première de la supervision, du SIEM
et de la détection d'anomalies. État au 21/10/2026, vérifié sur la stack en marche.

## Sources de données disponibles

| Source | Où la lire | Contenu |
|--------|-----------|---------|
| Métriques Prometheus | Prometheus de la supervision, via `metrics-gateway` (profil `monitoring`) | Requêtes, codes HTTP et durées par route ; paiements, pannes du paiement, assistant ; connexions nginx |
| Journaux dans Loki | Loki de la supervision, envoyés par `log-shipper` (profil `monitoring`) | Les journaux de tous les conteneurs, étiquetés par service |
| Journal d'accès nginx | `docker compose logs frontend` | Chaque requête reçue sur le port 8080 |
| Journaux d'accès uvicorn | `docker compose logs <service>` | Chaque requête reçue par une API |
| Journaux métier | `docker compose logs payment-service` (et les autres) | Opérations de paiement, erreurs, indexation |
| Sondes de santé Docker | `docker compose ps`, `docker inspect` | `healthy`, `unhealthy`, `starting` |
| Bases de données | `psql` dans le conteneur `postgres` | Transactions, commandes, stocks |
| API de payment-service | `payment-console`, `GET /transactions` | Transactions filtrées par statut |
| API de rag-service | `GET /api/rag/documents` | État de l'index de l'assistant |

## Supervision sur la VM : profil monitoring

Prometheus, Loki et Grafana tournent sur la même VM que la plateforme, dans leur propre compose. Le profil
`monitoring` de `docker-compose.yml` leur fournit les données :

```bash
docker compose --profile monitoring up -d     # avec LOKI_URL et METRICS_TOKEN renseignés dans .env
```

| Conteneur | Rôle |
|-----------|------|
| `metrics-gateway` | nginx, joint par Prometheus sur le réseau `monitoring-edge` (`metrics-gateway:80`) et publié sur `127.0.0.1:9464` seulement (`METRICS_BIND`) : relaie la route `/metrics` de chaque service, seulement avec le jeton `METRICS_TOKEN` |
| `nginx-exporter` | Lit les compteurs de nginx (`stub_status`, port 8081 du frontend, non publié) et les convertit au format Prometheus |
| `log-shipper` | Grafana Alloy : envoie les journaux de tous les conteneurs PokéBling au Loki de la supervision (`LOKI_URL`) |
| `docker-socket-proxy` | Donne à `log-shipper` un accès en lecture seule à l'API Docker (conteneurs, réseaux, journaux) |

Configuration de la supervision :

- Brancher les conteneurs Prometheus et Loki sur le réseau externe `novashop_monitoring-edge` (créé par le profil
  `monitoring`, à lancer avant la supervision). Exemple dans le README, section Supervision.
- Copier `monitoring/prometheus-scrape.example.yml` dans `prometheus.yml` (cible `metrics-gateway:80`, jeton à
  reporter). Prometheus installé hors de Docker : cible `127.0.0.1:9464`.
- Loki doit accepter les envois sans authentification (`auth_enabled: false`, réglage par défaut de l'image).
  Dans `.env` : `LOKI_URL=http://loki:3100/loki/api/v1/push` (`loki` = nom du service Loki dans le compose de la
  supervision). Loki installé hors de Docker : `http://<adresse-de-la-VM>:3100/loki/api/v1/push`.
- Grafana : sources de données `http://prometheus:9090` et `http://loki:3100`.

Vérification sur la VM :

```bash
curl -H "Authorization: Bearer <METRICS_TOKEN>" http://127.0.0.1:9464/metrics/payment
```

Sans le jeton, ou avec un mauvais jeton, la passerelle répond 401. Elle ne journalise que ces refus et les
échecs (502 si un service ne répond pas) : une rafale de 401 dans `docker compose logs metrics-gateway` signale
quelqu'un qui cherche le jeton. Pas de filtrage par adresse IP : celle du conteneur Prometheus change à chaque
recréation, et le jeton protège aussi des autres conteneurs qui voient la passerelle.

## Métriques Prometheus

Chaque API expose `/metrics` hors de son préfixe `/api/<service>` : la passerelle nginx du site ne la relaie pas
(`http://<hôte>:8080/metrics` renvoie la page d'accueil de la SPA). Seule `metrics-gateway` y accède.

| Chemin sur metrics-gateway | Service | Étiquette `service` dans Prometheus |
|----------------------------|---------|-------------------------------------|
| `/metrics/auth` | `auth-service` | `auth-service` |
| `/metrics/shop` | `shop-service` | `shop-service` |
| `/metrics/payment` | `payment-service` | `payment-service` |
| `/metrics/rag` | `rag-service` (502 sans le profil `ai`) | `rag-service` |
| `/metrics/nginx` | `nginx-exporter` | `frontend` |

`up{service="…"}` vaut 0 quand la passerelle ou le service ne répond pas. Pour le frontend, `up` indique que
`nginx-exporter` répond et `nginx_up` que nginx lui-même répond.

### Métriques HTTP des quatre API

| Métrique | Type | Étiquettes | Contenu |
|----------|------|-----------|---------|
| `http_requests_total` | compteur | `handler`, `method`, `status` | Requêtes par route et code HTTP exact (401, 402, 503…) |
| `http_request_duration_seconds` | histogramme | `handler`, `method` | Durée de traitement, seuils de 0,05 à 10 s |
| `http_request_duration_highr_seconds` | histogramme | – | Durée toutes routes confondues, seuils fins de 0,01 à 60 s |
| `http_request_size_bytes`, `http_response_size_bytes` | résumé | `handler` | Taille des requêtes et des réponses |
| `process_resident_memory_bytes`, `process_cpu_seconds_total`, `process_open_fds` | jauge, compteur | – | Mémoire, processeur et fichiers ouverts du processus |

- `handler` est le modèle de la route (`/api/shop/products/{slug}`), pas l'URL réelle. Toute URL qui ne
  correspond à aucune route est regroupée sous `handler="none"` : une hausse des 404 sur `none` signale un
  balayage de chemins.
- Les sondes `/health` et les collectes `/metrics` ne sont pas comptées.

### Métriques métier

| Métrique | Service | Étiquettes | Contenu |
|----------|---------|-----------|---------|
| `payment_transactions_total` | `payment-service` | `merchant`, `status`, `decline_code` | Paiements et remboursements enregistrés : `CAPTURED`, `DECLINED` (motif `card_declined`, `insufficient_funds`, `expired_card`), `REFUNDED`. `decline_code="-"` hors refus |
| `payment_amount_total` | `payment-service` | `merchant`, `status`, `currency` | Montant cumulé par statut, en euros |
| `shop_payment_service_errors_total` | `shop-service` | `reason` | Appels à `payment-service` en échec, nouvelles tentatives comprises : `timeout` (trop lent), `unreachable` (arrêté, injoignable), `server_error` (réponse 5xx) |
| `shop_order_compensations_total` | `shop-service` | `outcome` | Commandes non enregistrées après un paiement accepté : `refunded` (client remboursé) ou `failed` (débit à régulariser) |
| `shop_pokedollars_total` | `shop-service` | `movement` | PokéDollars `credited` (achetés), `spent` (boosters) ou `revoked` (repris à l'annulation d'une commande) |
| `shop_boosters_opened_total` | `shop-service` | `booster` | Boosters ouverts, par slug (`set-de-base`, `151`, `legendaire`…) |
| `rag_answer_duration_seconds` | `rag-service` | – | Durée de génération des réponses de l'assistant, réflexion comprise |
| `rag_failures_total` | `rag-service` | `stage` | Questions sans réponse complète : `search` (recherche documentaire) ou `generation` (modèle local) |
| `nginx_connections_active`, `nginx_http_requests_total` | `frontend` | – | Connexions ouvertes et requêtes traitées par nginx |

Les compteurs repartent de zéro au redémarrage d'un conteneur ; `rate()` et `increase()` en tiennent compte.

### Requêtes PromQL utiles

```promql
# Taux de refus des paiements sur 5 minutes
sum(rate(payment_transactions_total{status="DECLINED"}[5m])) / sum(rate(payment_transactions_total{status=~"CAPTURED|DECLINED"}[5m]))

# Motifs de refus
sum by (decline_code) (increase(payment_transactions_total{status="DECLINED"}[15m]))

# Montant encaissé sur la dernière heure
sum(increase(payment_amount_total{status="CAPTURED"}[1h]))

# Échecs de connexion par minute
sum(rate(http_requests_total{service="auth-service", handler="/api/auth/login", status="401"}[1m])) * 60

# Taux d'erreurs 5xx par service
sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))

# Temps de réponse du paiement vu par la boutique (95e centile)
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="shop-service", handler="/api/shop/orders", method="POST"}[5m])))

# Panne ou lenteur de payment-service vue par shop-service
sum by (reason) (increase(shop_payment_service_errors_total[5m]))

# Débits à régulariser (doit rester à 0)
shop_order_compensations_total{outcome="failed"}

# Service qui ne répond plus
up{job="novashop"} == 0
```

## Journaux dans Loki

`log-shipper` envoie à Loki les journaux de tous les conteneurs du projet `novashop`, avec ces étiquettes :

| Étiquette | Valeur |
|-----------|--------|
| `project` | `novashop` |
| `service` | Nom du service compose (`payment-service`, `frontend`…) |
| `container` | Nom du conteneur (`novashop-payment-service-1`) |
| `stream` | `stdout` ou `stderr` |
| `level` | `INFO`, `WARNING`, `ERROR`… pour les lignes des services Python ; absente sinon |

Les lignes des sondes `/health`, des collectes `/metrics` et de la sonde d'Ollama (`GET "/api/tags"`) ne sont
pas envoyées. Elles restent visibles dans `docker compose logs`.

```logql
# Paiements refusés (lignes clé=valeur : analyseur logfmt)
{service="payment-service"} |= "transaction" | logfmt | status="DECLINED"

# Avertissements et erreurs de toutes les API
{project="novashop", level=~"WARNING|ERROR"}

# Échecs de connexion vus par nginx, par minute
sum(count_over_time({service="frontend"} |= "POST /api/auth/login" |= "\" 401 " [1m]))

# Sondage des routes internes depuis l'extérieur
{service="frontend"} |~ "\"[A-Z]+ /api/(payment|rag)/"
```

Au premier démarrage, `log-shipper` envoie aussi l'historique conservé par Docker. Il note ensuite sa position
dans chaque journal (volume `alloy-data`) : un redémarrage ne renvoie pas les mêmes lignes. Sans `LOKI_URL`, ses
envois échouent sur l'adresse `loki-url-non-definie.invalid` (visible dans `docker compose logs log-shipper`).

## Format des journaux

Tous les conteneurs écrivent sur leur sortie standard ; Docker conserve ces lignes (`docker compose logs`).

- **Services Python** : `NIVEAU:nom-du-service:message`, par exemple
  `INFO:payment-service:transaction reference=…`. Les niveaux utilisés sont `INFO`, `WARNING` et `ERROR`.
- **Accès uvicorn** : `INFO:     <ip>:<port> - "<méthode> <chemin> HTTP/<version>" <code> <libellé>`.
- **nginx** : format `main` de l'image officielle (voir section suivante).

Les lignes métier de `payment-service` et de `rag-service` sont au format `clé=valeur`, prévu pour être filtré
par un SIEM ou par Loki (analyseur `logfmt`). Les journaux ne sont pas en JSON et ne portent pas
d'identifiant de requête commun aux services.

## Journal d'accès nginx (frontend)

Exemple réel :

```
172.21.0.1 - - [20/Oct/2026:09:54:36 +0000] "POST /api/auth/login HTTP/1.1" 200 344 "http://localhost:8080/login" "Mozilla/5.0 (…) Edg/155.0.0.0" "-"
```

Champs : adresse source, horodatage, méthode, chemin et paramètres, protocole, code HTTP, taille de la réponse
en octets, page d'origine (`Referer`), `User-Agent`, `X-Forwarded-For`. C'est la seule source qui voit
**toutes** les requêtes entrantes, y compris celles rejetées par nginx lui-même (405, 413, 502).

Le format ne contient pas la durée de traitement (`$request_time`) : la latence n'est pas mesurable depuis ces
journaux sans modifier `frontend/nginx.conf`.

## Adresse source dans les journaux

Sous Docker Desktop (sur le PC Hôte, avant le passage sur la VM), les requêtes faites depuis le navigateur local
apparaissaient avec l'adresse `172.21.0.1` (passerelle du réseau Docker), pas avec l'adresse réelle du client.
Les API voyaient la même adresse, transmise par nginx (`172.21.0.1:0` dans les journaux uvicorn).

Sur la VM (Docker Engine sous Linux), les connexions venues du réseau sont redirigées par le noyau et gardent en
principe l'adresse réelle du client ; seules les requêtes faites depuis la VM elle-même portent l'adresse de la
passerelle Docker. À vérifier depuis le PC Attaquant avant de fonder une détection ou un blocage sur l'adresse IP
source.

## Journaux d'accès uvicorn

Chaque API journalise ses requêtes :

```
INFO:     172.21.0.1:0 - "POST /api/shop/cart/merge HTTP/1.0" 200 OK
INFO:     172.22.0.3:44004 - "POST /api/payment/transactions HTTP/1.1" 201 Created
```

- Requête relayée par nginx : protocole `HTTP/1.0` et port `0` (adresse reprise de `X-Forwarded-For`).
- Appel de `shop-service` vers `payment-service` : adresse de `shop-service` sur le réseau `payment`,
  `HTTP/1.1`.
- Pas de durée de traitement dans ces lignes non plus : elle est dans les métriques Prometheus
  (`http_request_duration_seconds`).
- Les sondes de santé produisent une ligne `GET /api/<service>/health … 200 OK` toutes les 10 s et, avec le
  profil `monitoring`, les collectes une ligne `GET /metrics … 200 OK` toutes les 15 s : à filtrer.
  `log-shipper` ne les envoie pas à Loki.

## Journaux métier de payment-service

Une ligne par paiement ou remboursement enregistré :

```
INFO:payment-service:transaction reference=PAY_8FA8A393135D82FF merchant=novashop merchant_reference=CMD-261020-B423D5 status=CAPTURED amount=39.80 currency=EUR decline_code=-
```

| Champ | Contenu |
|-------|---------|
| `reference` | Référence publique `PAY_…` |
| `merchant` | Code du marchand (`novashop`) |
| `merchant_reference` | Numéro de commande PokéBling `CMD-…` |
| `status` | `CAPTURED`, `DECLINED` ou `REFUNDED` |
| `amount`, `currency` | Montant et devise (`EUR`) |
| `decline_code` | `card_declined`, `insufficient_funds`, `expired_card`, ou `-` |

Autres messages : `Marchand de démo novashop : créé` / `clé API renouvelée` (démarrage),
`Base indisponible (tentative N/15), nouvel essai dans 2.0s`.

## Journaux métier de shop-service

`shop-service` ne journalise pas les commandes réussies (seulement la ligne d'accès `POST /api/shop/orders …
201`). Il journalise les incidents avec `payment-service` :

| Niveau | Message | Signification |
|--------|---------|---------------|
| WARNING | `payment-service injoignable (tentative N/2) : ConnectError(…)` ou `ReadTimeout(…)` | Paiement injoignable ou trop lent |
| WARNING | `payment-service en erreur 500 (tentative N/2)` | Paiement en erreur serveur |
| ERROR | `Paiement de la commande CMD-… rejeté : <code> <corps>` | Réponse inattendue (401 clé API, 409…) |
| ERROR | `Remboursement de PAY_… rejeté : <code> <corps>` | Remboursement refusé |
| ERROR | `Commande CMD-… non enregistrée après le paiement PAY_… : remboursement` | Compensation lancée |
| ERROR | `Remboursement de compensation impossible pour PAY_… : à régulariser` | Débit sans commande |

Au démarrage : `Catalogue PokéBling inséré : 609 cartes, 4 lots de PokéDollars, 6 boosters`, `Tables de l'ancienne boutique NovaShop détectées : …` (une fois, au passage à PokéBling), `Booster ouvert : user=… booster=… cartes=…`, `Base indisponible (tentative N/15)…`.

## Journaux d'auth-service

`auth-service` n'écrit aucune ligne métier pour les connexions. Les échecs de connexion se repèrent aux lignes
d'accès `"POST /api/auth/login HTTP/1.0" 401 Unauthorized` (journal uvicorn et nginx). Au démarrage :
`Comptes de démo créés : …` et `Base indisponible (tentative N/15)…`.

## Journaux de rag-service

| Message | Signification |
|---------|---------------|
| `index action=added source=documents/x.md chunks=7` | Fichier indexé (`updated` si modifié) |
| `index action=removed source=…` | Fichier retiré de l'index |
| `index action=failed source=… error=…` | Fichier illisible |
| `index action=skipped source=… reason=too_large` | Fichier de plus de 25 Mo |
| `answer extracts=5 sources=… reasoning_chars=1747 chars=236 duration_ms=73697` | Réponse produite |
| `Modèle gemma4:e4b chargé` / `Préchargement du modèle … impossible` | Préchargement au démarrage |
| `Recherche documentaire impossible`, `Génération impossible`, `Génération interrompue` | Ollama indisponible |

## Métriques calculables depuis les journaux

| Métrique | Source | Calcul |
|----------|--------|--------|
| Débit de requêtes, par route | nginx | Nombre de lignes par minute, par chemin |
| Taux d'erreurs 5xx | nginx, uvicorn | Lignes en `5xx` / total |
| Échecs de connexion | nginx ou uvicorn `auth-service` | `POST /api/auth/login` en 401, par minute |
| Accès refusés | uvicorn | Lignes 401 sur `/api/shop/cart…`, `/api/shop/orders…` |
| Paiements acceptés, refusés, remboursés | `payment-service` | Lignes `transaction` par `status` |
| Taux de refus et motifs | `payment-service` | `status=DECLINED` / total, par `decline_code` |
| Montant encaissé | `payment-service` | Somme de `amount` pour `status=CAPTURED` |
| Indisponibilité du paiement vue par la boutique | `shop-service` | Lignes `payment-service injoignable` ou `en erreur` |
| Paiements en 503 | nginx | `POST /api/shop/orders` en 503 |
| Accès à des routes non exposées | nginx | Requêtes vers `/api/payment/` ou `/api/rag/` |
| Requêtes trop grosses | nginx | Codes 413 |
| Temps de réponse de l'assistant | `rag-service` | `duration_ms` des lignes `answer` |

## Indicateurs en base : payment_db

Commandes en lecture seule, à lancer depuis le dossier du projet :

```bash
# Transactions des 15 dernières minutes, par statut
docker compose exec postgres psql -U postgres -d payment_db -c "SELECT status, count(*) AS nb, sum(amount) AS montant FROM transactions WHERE created_at > now() - interval '15 minutes' GROUP BY status;"

# Taux de refus sur 15 minutes
docker compose exec postgres psql -U postgres -d payment_db -c "SELECT round(100.0 * count(*) FILTER (WHERE status = 'DECLINED') / nullif(count(*), 0), 1) AS taux_refus_pct, count(*) AS total FROM transactions WHERE created_at > now() - interval '15 minutes';"

# Motifs de refus
docker compose exec postgres psql -U postgres -d payment_db -c "SELECT decline_code, count(*) FROM transactions WHERE status = 'DECLINED' GROUP BY 1;"

# 20 derniers événements du journal
docker compose exec postgres psql -U postgres -d payment_db -c "SELECT t.reference, e.status, e.message, e.created_at FROM transaction_events e JOIN transactions t ON t.id = e.transaction_id ORDER BY e.id DESC LIMIT 20;"
```

## Indicateurs en base : shop_db

```bash
# Commandes par statut
docker compose exec postgres psql -U postgres -d shop_db -c "SELECT status, count(*), sum(total) FROM orders GROUP BY status;"

# Produits en rupture ou presque
docker compose exec postgres psql -U postgres -d shop_db -c "SELECT slug, stock FROM products WHERE stock <= 3 ORDER BY stock, slug;"

# Dernières commandes et leur référence de paiement
docker compose exec postgres psql -U postgres -d shop_db -c "SELECT number, payment_reference, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10;"
```

## Rapprochement entre PokéBling et la plateforme de paiement

Les deux bases sont séparées : pas de jointure possible en une requête. On compare deux listes :

```bash
docker compose exec postgres psql -U postgres -d shop_db -At -c "SELECT payment_reference, status FROM orders ORDER BY 1;"
docker compose exec postgres psql -U postgres -d payment_db -At -c "SELECT reference, status FROM transactions WHERE status IN ('CAPTURED', 'REFUNDED') ORDER BY 1;"
```

État cohérent : chaque commande `PAID` a une transaction `CAPTURED` de même référence, chaque commande
`CANCELLED` une transaction `REFUNDED`. Une transaction `CAPTURED` sans commande signale une compensation
échouée (`à régulariser`). Des commandes antérieures à l'arrivée de `payment-service` peuvent porter des
références `PAY_…` inconnues de `payment_db`.

## Ce que prouvent les sondes de santé

Les sondes `/health` de `auth-service`, `shop-service`, `payment-service` et `rag-service` répondent
`{"status": "ok"}` **sans interroger la base ni les dépendances**. Elles prouvent que le processus répond, pas
que le service fonctionne :

- base arrêtée : les sondes restent `healthy`, mais les routes métier répondent 500 ;
- `payment-service` bloqué sur une requête lente : la sonde peut passer `unhealthy` (délai de 3 s, 5 échecs) ;
- `ollama` arrêté : `rag-service` reste `healthy` mais ne peut plus répondre.

La preuve de bon fonctionnement de la chaîne de paiement reste une nouvelle transaction `CAPTURED`.

## Lire l'état des conteneurs

```bash
docker compose ps                                     # état et santé de chaque service
docker inspect --format "{{json .State.Health}}" novashop-payment-service-1   # 5 derniers résultats de sonde
docker events --filter type=container                 # arrêts, redémarrages, changements de santé en direct
```

`docker events` émet notamment `health_status: unhealthy`, `die` et `restart`. Rappel : Docker ne relance pas
un conteneur `unhealthy` ; il ne relance (`restart: unless-stopped`) qu'un conteneur dont le processus s'est
arrêté.

## Signaux observables par type d'incident

| Incident | Signaux dans les journaux et Docker | Signaux dans Prometheus |
|----------|-------------------------------------|-------------------------|
| `payment-service` arrêté | `shop-service` : `payment-service injoignable` ; nginx : `POST /api/shop/orders` en 503 ; `docker compose ps` : conteneur absent ou `Exited` ; plus de ligne `transaction` | `up{service="payment-service"}` à 0 ; `shop_payment_service_errors_total{reason="unreachable"}` en hausse ; 503 sur `/api/shop/orders` |
| `payment-service` lent ou saturé | `ReadTimeout` dans `shop-service` ; 503 au paiement après environ 6 s ; sonde qui passe `unhealthy` | `shop_payment_service_errors_total{reason="timeout"}` en hausse ; 95e centile de `/api/shop/orders` en hausse |
| `postgres` arrêté | 500 sur toutes les routes qui lisent une base (catalogue, connexion, panier, paiement) ; sondes toujours `healthy` ; `postgres` absent ou `unhealthy` dans `docker compose ps` | Taux de 500 en hausse sur les trois API ; `up` reste à 1 |
| Devinette de mots de passe | Rafale de `POST /api/auth/login` en 401 depuis une même source | `http_requests_total{handler="/api/auth/login", status="401"}` en hausse |
| Rafale de requêtes (déni de service) | Hausse brutale du nombre de lignes nginx par seconde ; hausse des 502/503 | `rate(nginx_http_requests_total[1m])` et `nginx_connections_active` en hausse |
| Sondage des routes internes | Requêtes nginx vers `/api/payment/` (200 HTML ou 405) ou `/api/rag/` | Rien : nginx les sert sans les relayer aux API. Les chemins inconnus sous `/api/auth/` ou `/api/shop/` montent en `handler="none"`, 404 |
| Cartes testées en série | Hausse du taux de `DECLINED` et des `card_declined` dans `payment-service` | `payment_transactions_total{status="DECLINED"}` en hausse, par `decline_code` |
| Clé API marchand invalide | `shop-service` : `Paiement de la commande … rejeté : 401` ; clients en 502 | `http_requests_total{service="payment-service", status="401"}` ; 502 sur `/api/shop/orders` |
| Tentative d'injection dans la recherche | Paramètre `q` inhabituel dans les lignes nginx `GET /api/shop/products?q=…` | Rien de spécifique (le paramètre n'est pas une étiquette) |

## Limites actuelles de l'observabilité

- Pas de durée de requête dans les journaux nginx ni uvicorn (elle n'est que dans les métriques Prometheus des
  API ; nginx n'en fournit pas).
- Pas d'identifiant de corrélation entre nginx, `shop-service` et `payment-service` ; le lien se fait par le
  numéro de commande `CMD-…` et la référence `PAY_…`.
- Sondes de santé sans test de la base : `up` et les sondes restent au vert quand `postgres` est arrêté.
- Pas de métriques de `postgres` ni des conteneurs eux-mêmes (processeur, mémoire par conteneur) : il faudrait
  ajouter `postgres_exporter` et cAdvisor.
- Adresse source : masquée sous Docker Desktop, en principe réelle sur la VM (à vérifier depuis le PC Attaquant).
- Sans le profil `monitoring`, journaux conservés par Docker seulement (pilote par défaut) : perdus si le
  conteneur est supprimé. Avec le profil, ils sont aussi dans Loki.
