# Sommaire de la documentation technique

Documentation de la plateforme, un thème par fichier. Ces fichiers sont aussi lus par l'assistant des
opérateurs (voir `_LISEZ-MOI.md`). Ce sommaire commence par `_` : il n'est pas indexé.

État décrit : le dépôt au 21/10/2026. Toute la plateforme tourne sur une VM Linux (Docker Engine), avec sa
supervision (Prometheus, Loki, Grafana) dans un compose voisin que le profil `monitoring` alimente. Les
vérifications citées dans ces fiches ont été faites sous Docker Desktop, sur le PC Hôte, avant le passage sur la
VM. À mettre à jour quand le WAF, le SIEM ou le moteur de remédiation arrivent.

## Architecture

| Fichier | Contenu |
|---------|---------|
| [architecture-generale.md](architecture-generale.md) | Services, rôles, technologies, profils, volumes, ordre de démarrage, healthchecks |
| [liens-entre-services-et-reseaux.md](liens-entre-services-et-reseaux.md) | Matrice des flux, réseaux Docker, authentification entre services, effets d'une panne |
| [modele-de-donnees.md](modele-de-donnees.md) | Tables des trois bases, liens entre bases, données de carte, index Chroma |
| [configuration-variables-environnement.md](configuration-variables-environnement.md) | Variables `.env` (dont supervision), réglages internes, rotation de la clé marchand |

## Routes

| Fichier | Contenu |
|---------|---------|
| [routes-frontend-et-passerelle-nginx.md](routes-frontend-et-passerelle-nginx.md) | Routage nginx, pages de la SPA et appels d'API par page |
| [routes-auth-service.md](routes-auth-service.md) | Inscription, connexion, profil |
| [routes-shop-service.md](routes-shop-service.md) | Catalogue, panier, commandes, médias |
| [routes-payment-service.md](routes-payment-service.md) | Transactions, remboursements, cartes de test |
| [routes-rag-service.md](routes-rag-service.md) | API de l'assistant, compatible OpenAI |

## Processus

| Fichier | Contenu |
|---------|---------|
| [processus-authentification-jwt.md](processus-authentification-jwt.md) | Connexion, contenu et vérification du JWT, expiration |
| [processus-panier.md](processus-panier.md) | Panier invité, fusion à la connexion, règles de calcul |
| [processus-commande-et-paiement.md](processus-commande-et-paiement.md) | Paiement de bout en bout, délais, mode dégradé, compensation, preuve de reprise |
| [processus-annulation-et-remboursement.md](processus-annulation-et-remboursement.md) | Annulation, remboursement idempotent |
| [cycle-de-vie-transaction-paiement.md](cycle-de-vie-transaction-paiement.md) | États, transitions, journal des événements, idempotence |
| [processus-assistant-rag.md](processus-assistant-rag.md) | Indexation, recherche hybride, génération, garde-fous |

## Exploitation et sécurité

| Fichier | Contenu |
|---------|---------|
| [metriques-journaux-et-signaux.md](metriques-journaux-et-signaux.md) | Métriques Prometheus, journaux dans Loki, profil `monitoring`, requêtes PromQL, LogQL et SQL, signaux par incident |
| [codes-http-et-messages-d-erreur.md](codes-http-et-messages-d-erreur.md) | Codes et messages exacts, conséquence pour le client |
| [securite-mecanismes-en-place.md](securite-mecanismes-en-place.md) | Protections existantes et points ouverts |
