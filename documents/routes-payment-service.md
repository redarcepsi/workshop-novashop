# Routes de payment-service

`payment-service` est la plateforme de paiement fictive, le système critique du projet. Elle encaisse les
paiements par carte pour le compte de marchands (aujourd'hui un seul : PokéBling, code `novashop`),
rembourse et journalise chaque changement d'état. API FastAPI, préfixe `/api/payment`, port interne 8000,
base `payment_db`. Code : `services/payment-service/app/routes.py` et `transaction_service.py`.

`payment-service` n'est **pas publié** et n'est **pas routé** par la passerelle nginx. Il n'est joignable que
par `shop-service` (réseau `payment`) et par la console d'exploration `payment-console` sur
`http://127.0.0.1:8082` (profil `tools`).

## Résumé des routes de payment-service

| Méthode | Route | Auth | Succès | Erreurs |
|---------|-------|------|--------|---------|
| POST | `/api/payment/transactions` | clé API | 201, 200 si rejouée | 401, 402, 409, 422 |
| GET | `/api/payment/transactions` | clé API | 200 | 401, 422 |
| GET | `/api/payment/transactions/{reference}` | clé API | 200 | 401, 404 |
| POST | `/api/payment/transactions/{reference}/refund` | clé API | 200 | 401, 404, 409 |
| GET | `/api/payment/health` | – | 200 | – |
| GET | `/metrics` | – (relayée par `metrics-gateway` seulement) | 200 | – |

## Authentification marchand par clé API

Toutes les routes `/transactions` exigent l'en-tête `X-API-Key`. `payment-service` calcule le SHA-256 de la
clé et cherche le marchand actif dont `api_key_hash` correspond. Sinon : 401 `Clé API absente ou invalide`.

Un marchand ne voit que ses propres transactions : une référence appartenant à un autre marchand répond 404,
comme une référence inexistante. La clé de PokéBling est la variable `MERCHANT_API_KEY` ; au démarrage,
`payment-service` met à jour le hash si la clé a changé (rotation par simple redémarrage).

## POST /api/payment/transactions

Autorise puis capture un paiement par carte, en une seule transaction SQL.

En-têtes : `X-API-Key` (obligatoire) et `Idempotency-Key` (facultatif, 1 à 64 caractères parmi
`A-Z a-z 0-9 _ . : -`, sinon 422). PokéBling y met son numéro de commande.

Corps :

```json
{"amount": "54.90", "currency": "EUR", "merchant_reference": "CMD-261020-A1B2C3",
 "card": {"number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123"}}
```

Validation (422 sinon) : `amount` > 0 avec 2 décimales au plus ; `currency` = `EUR` uniquement ;
`merchant_reference` de 1 à 64 caractères ; numéro de carte de 13 à 19 chiffres valide selon Luhn
(`Numéro de carte invalide`) ; `expiry` au format `MM/AA` ; `cvc` de 3 ou 4 chiffres.

### Réponses de POST /api/payment/transactions

| Code | Cas | Corps |
|------|-----|-------|
| 201 | Paiement capturé | Transaction au statut `CAPTURED` |
| 200 | Même `Idempotency-Key` déjà utilisée pour la même demande : rien n'est redébité | Transaction d'origine, en-tête `Idempotent-Replayed: true` |
| 402 | Refus de la banque émettrice fictive (enregistré en `DECLINED`) | `{"detail": "<motif>", "transaction": {…}}` |
| 409 | `Idempotency-Key` déjà utilisée avec un autre montant, une autre devise ou une autre référence | `Cette clé d'idempotence a déjà servi pour un autre paiement` |
| 401 | Clé API absente ou invalide | `Clé API absente ou invalide` |

Un refus est une réponse normale, pas une panne : la transaction est enregistrée et journalisée. Rejouer
une demande refusée avec la même clé renvoie à nouveau 402 avec `Idempotent-Replayed: true`.

### Cartes de test de payment-service

| Numéro | Résultat | `decline_code` | Message |
|--------|----------|----------------|---------|
| `4242 4242 4242 4242` | Accepté (201) | – | – |
| `4000 0000 0000 0002` | Refusé (402) | `card_declined` | `Paiement refusé par la banque émettrice` |
| `4000 0000 0000 9995` | Refusé (402) | `insufficient_funds` | `Paiement refusé : fonds insuffisants` |
| Date passée | Refusé (402) | `expired_card` | `Paiement refusé : carte expirée` |

Tout autre numéro valide selon Luhn avec une date future est accepté. Via PokéBling, une carte expirée est
refusée plus tôt, par la validation de `shop-service` (422 `La carte est expirée`) : le cas `expired_card`
n'arrive que par un appel direct à `payment-service`.

## GET /api/payment/transactions

Transactions du marchand authentifié, des plus récentes aux plus anciennes. Paramètres :
`status` (`PENDING`, `AUTHORIZED`, `CAPTURED`, `DECLINED`, `REFUNDED`), `merchant_reference` (numéro de
commande PokéBling), `limit` (1 à 100, défaut 20), `offset`.

Réponse : `{"items": [transaction, …], "total": N, "limit": 20, "offset": 0}`.

Exemples utiles pour un opérateur : `?status=DECLINED` (refus récents), `?merchant_reference=CMD-261020-A1B2C3`
(paiement d'une commande donnée).

## GET /api/payment/transactions/{reference}

Détail d'une transaction par sa référence publique (`PAY_` suivi de 16 caractères hexadécimaux), avec son
journal complet. 404 : `Transaction introuvable`.

## POST /api/payment/transactions/{reference}/refund

Remboursement intégral d'une transaction capturée. La ligne est verrouillée (`SELECT … FOR UPDATE`) pendant
l'opération.

- 200 : transaction passée en `REFUNDED`, événement `Remboursement demandé par PokéBling` ajouté au journal.
- 200 également si elle était déjà `REFUNDED` : idempotent, rien n'est refait ni journalisé.
- 409 : `Seule une transaction capturée peut être remboursée` (par exemple une transaction `DECLINED`).
- 404 : `Transaction introuvable`.

## Format d'une transaction

`reference`, `status`, `amount`, `currency`, `merchant_reference`, `card_brand` (`visa`, `mastercard`,
`amex`, `other`), `card_last4`, `decline_code`, `decline_message`, `created_at`, `captured_at`,
`refunded_at`, et `events` : la liste chronologique des changements d'état (`status`, `message`,
`created_at`). Ni le numéro complet de la carte ni le CVC ne sont conservés ni renvoyés.

## GET /api/payment/health

Sonde de santé du `HEALTHCHECK` : `{"status": "ok", "service": "payment-service"}`. Elle n'interroge pas la
base : un `payment-service` `healthy` peut quand même échouer à enregistrer un paiement. La vraie preuve de
fonctionnement est une transaction `CAPTURED`.

## Explorer payment-service avec payment-console

```bash
docker compose --profile tools up -d payment-console   # http://127.0.0.1:8082 → Swagger
```

Dans Swagger : **Authorize**, coller la clé API du marchand PokéBling (valeur de `MERCHANT_API_KEY` dans
`.env`), puis `GET /transactions`. La console est un proxy nginx publié sur `127.0.0.1` uniquement : invisible
depuis le réseau. Arrêt : `docker compose --profile tools stop payment-console`.

## Journaux de payment-service

Une ligne `clé=valeur` par opération réussie (création ou remboursement), écrite après l'enregistrement en base :

```
INFO:payment-service:transaction reference=PAY_8FA8A393135D82FF merchant=novashop merchant_reference=CMD-261020-B423D5 status=CAPTURED amount=39.80 currency=EUR decline_code=-
INFO:payment-service:transaction reference=PAY_8FA8A393135D82FF merchant=novashop merchant_reference=CMD-261020-B423D5 status=REFUNDED amount=39.80 currency=EUR decline_code=-
```

Un refus donne `status=DECLINED` et le `decline_code`. Une requête rejouée (idempotence) ou un
remboursement déjà fait ne produisent pas de nouvelle ligne. Les accès apparaissent aussi dans le journal
uvicorn, par exemple `"POST /api/payment/transactions HTTP/1.1" 201 Created` (appel de `shop-service`).
