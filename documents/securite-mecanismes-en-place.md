# Mécanismes de sécurité en place

Les protections présentes dans le code et la configuration au 20/10/2026, et les points qui restent ouverts.
Ce document décrit l'existant ; il ne couvre ni le WAF, ni le SIEM, ni la gestion des secrets par Vault ou
SOPS, qui ne sont pas encore dans le dépôt.

## Exposition réseau minimale

- Un seul port métier publié : 8080 (`frontend`). Le jour J, `HTTP_BIND=192.168.137.1` le limite au point
  d'accès du consortium.
- `payment-service`, `auth-service`, `shop-service`, `rag-service`, `ollama` et `postgres` ne sont pas
  publiés.
- Outils (`adminer` 8081, `payment-console` 8082) liés à `127.0.0.1` : invisibles depuis le réseau.
- Assistant (`assistant-ui` 8083) publié comme le site, sur `HTTP_BIND` : le jour J, sur le seul point
  d'accès du consortium. Il n'a aucun droit sur le système et ne joint que `rag-service`.
- Réseaux `internal` pour les API et la base : pas de route vers l'extérieur, donc pas d'exfiltration directe
  depuis un service compromis.
- `payment-service` n'est joignable que depuis `shop-service` : un attaquant doit passer par la boutique.
  Détails : `liens-entre-services-et-reseaux.md`.

## Mots de passe des clients

- Hash bcrypt, 12 tours (`BCRYPT_ROUNDS`).
- Politique : 8 à 64 caractères, au moins une lettre et un chiffre.
- Message d'erreur unique (`Email ou mot de passe incorrect`) et temps de réponse constant grâce à un hash
  factice : impossible de savoir si un compte existe en essayant de se connecter.
- Emails normalisés en minuscules.

## Jetons JWT

- HS256, signés par `auth-service`, vérifiés par `shop-service` avec le même `JWT_SECRET`.
- Contrôles : signature, émetteur `novashop-auth`, expiration, champs obligatoires. L'algorithme est imposé
  (`algorithms=["HS256"]`) : un jeton `alg: none` est refusé.
- Durée de vie : 60 minutes.

## Clé API du marchand

- `payment-service` ne stocke que le SHA-256 de la clé (`merchants.api_key_hash`).
- Isolation entre marchands : une transaction d'un autre marchand répond 404, comme si elle n'existait pas.
- Rotation simple : changer `MERCHANT_API_KEY` et recréer les deux conteneurs.
- `payment-service` ne connaît pas le secret JWT des clients : la compromission de l'un ne donne pas l'autre.

## Données de carte

- Numéro contrôlé par l'algorithme de Luhn, date `MM/AA`, CVC de 3 ou 4 chiffres.
- Ni le numéro complet ni le CVC ne sont stockés, ni chez NovaShop ni sur la plateforme : seuls les
  4 derniers chiffres et la marque. Le code ne les écrit dans aucun journal.
- Le numéro transite en clair par `shop-service` (en mémoire) avant d'atteindre `payment-service`.
- Démonstrateur : aucune donnée bancaire réelle ne doit être saisie, seulement les cartes de test.

## Intégrité des paiements et des stocks

- **Le serveur fait foi** : prix, stocks, frais de port et totaux recalculés par `shop-service` ; le
  navigateur n'envoie que des identifiants et des quantités.
- **Idempotence** : une même `Idempotency-Key` ne débite qu'une fois ; une clé réutilisée avec un autre
  montant est refusée (409).
- **Verrous** : `SELECT … FOR UPDATE` sur le panier, les produits et la transaction à rembourser. Pas de
  survente, pas de double commande, pas de double remboursement.
- **Contraintes en base** : prix et montants > 0, stock ≥ 0, quantités > 0, unicité des références.
- **Cycle de vie contrôlé** : toute transition d'état non prévue lève une erreur.
- **Journal en ajout seul** : `transaction_events` n'est jamais modifié ni effacé par l'application.
- **Compensation** : un débit sans commande enregistrée est remboursé automatiquement.

## Moindre privilège en base

- Un rôle par service (`auth_user`, `shop_user`, `payment_user`), propriétaire de sa seule base.
- `REVOKE ALL ON DATABASE … FROM PUBLIC` : un rôle ne peut pas se connecter à la base d'un autre.
- Mots de passe passés au script d'init par variable `psql` et `format(%L)`, jamais concaténés dans le SQL.
- Requêtes applicatives écrites avec SQLAlchemy (paramètres liés). La recherche `q` du catalogue échappe les
  caractères `%` et `_` (`autoescape=True`).

## Conteneurs

- Images Python `python:3.12-slim`, processus lancés par un utilisateur non-root (`appuser`, uid 1000).
- `HEALTHCHECK` dans chaque image Python.
- Documents de l'assistant, README, script d'init et configuration de `payment-console` montés en lecture
  seule.
- Aucun conteneur ne monte le socket Docker.

## CORS et appels depuis un navigateur

- `auth-service` et `shop-service` n'acceptent que les origines de `CORS_ORIGINS`.
- `payment-service` et `rag-service` n'ont pas de CORS : ils ne sont jamais appelés par un navigateur.
- nginx limite les corps de requête à 1 Mo (413 au-delà).

## Garde-fous de l'assistant

- Aucun outil, aucune action possible sur le système ; réseau `ai` isolé de la plateforme.
- Extraits traités comme des données ; le prompt interdit de suivre les consignes qu'ils contiendraient.
- Clé `RAG_API_KEY` comparée en temps constant.
- `assistant-ui` n'appelle que `rag-service` : ni accès direct à Ollama, ni web, ni exécution de code, ni
  statistiques d'utilisation envoyées.
- Fichiers joints au chat : 10 Mo au plus, formats texte, PDF et Word seulement, lus en mémoire par
  `rag-service` sans être indexés ni écrits sur disque ; leurs extraits sont des données comme les autres.
- Ni le texte des questions ni le nom des fichiers joints ne sont journalisés.

## Points ouverts au 20/10/2026

- **Pas de limitation de débit** sur `POST /api/auth/login` ni ailleurs : devinette de mots de passe et
  rafales de requêtes ne sont freinées par rien.
- **HTTP sans TLS** sur le port 8080 : jetons, mots de passe et numéros de carte de test circulent en clair
  sur le réseau du point d'accès.
- **Secrets en variables d'environnement** avec des valeurs de développement par défaut dans
  `docker-compose.yml`, si `.env` ne les remplace pas.
- **JWT dans `localStorage`** : lisible par un script injecté dans la page (XSS).
- **Pas de révocation de jeton** : un compte désactivé garde l'accès à la boutique jusqu'à l'expiration
  (60 minutes au plus), car `shop-service` ne consulte pas `auth_db`.
- **Swagger public** : `/api/auth/docs` et `/api/shop/docs` sont accessibles par la passerelle, et décrivent
  toutes les routes.
- **Sondes de santé superficielles** : elles ne testent pas la base.
- **Assistant sans compte, ouvert au réseau** : tout poste du réseau où il est publié (le jour J, le point
  d'accès du consortium) peut l'interroger, donc lire la documentation de `documents/` (ce fichier compris)
  et occuper le modèle. Il n'a aucun droit sur le système. `ASSISTANT_BIND=127.0.0.1` le réserve au PC Hôte.
- **Adresse source masquée** par Docker Desktop dans les journaux : à vérifier depuis le PC Attaquant.
