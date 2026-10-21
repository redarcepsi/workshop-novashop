# Routes d'auth-service

`auth-service` gère les comptes clients de la boutique PokéBling : inscription, connexion et profil. API
FastAPI, préfixe `/api/auth`, port interne 8000, base `auth_db`. Depuis l'extérieur, elle n'est joignable que
par la passerelle nginx : `http://<hôte>:8080/api/auth/...`. Code : `services/auth-service/app/routes.py`.

## Résumé des routes d'auth-service

| Méthode | Route | Auth | Succès | Erreurs |
|---------|-------|------|--------|---------|
| POST | `/api/auth/register` | – | 201 | 409, 422 |
| POST | `/api/auth/login` | – | 200 | 401, 422 |
| GET | `/api/auth/me` | JWT | 200 | 401 |
| GET | `/api/auth/health` | – | 200 | – |
| GET | `/metrics` | – (relayée par `metrics-gateway` seulement) | 200 | – |

## POST /api/auth/register

Crée un compte client. Le mot de passe est haché avec bcrypt (12 tours) avant stockage.

- Corps JSON : `email`, `full_name`, `password`.
- Règles de validation (sinon 422) :
  - `email` : adresse valide, convertie en minuscules ;
  - `full_name` : 2 à 100 caractères, espaces multiples réduits (`Le nom doit contenir au moins 2 caractères`) ;
  - `password` : 8 à 64 caractères, au moins une lettre et un chiffre
    (`Le mot de passe doit contenir au moins une lettre et un chiffre`).
- 201 : `{"id": "<uuid>", "email": "...", "full_name": "...", "created_at": "..."}`.
- 409 : `Un compte existe déjà avec cet email`.

Le front enchaîne automatiquement `register` puis `login`.

## POST /api/auth/login

Connexion au format OAuth2 « password flow ». Retourne un JWT à envoyer ensuite dans
`Authorization: Bearer <jeton>` à `auth-service` et à `shop-service`.

- Corps `application/x-www-form-urlencoded` : `username` (= email) et `password`. L'email est nettoyé et mis
  en minuscules avant la recherche.
- 200 : `{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 3600}` (`expires_in` en secondes,
  `JWT_EXPIRE_MINUTES` × 60).
- 401 : `Email ou mot de passe incorrect`, avec l'en-tête `WWW-Authenticate: Bearer`. Même message et même
  temps de réponse que l'email existe ou non (comparaison avec un hash factice), et pour un compte désactivé.

Contenu du jeton : `sub` (id utilisateur), `email`, `name`, `iat`, `exp`, `iss` = `novashop-auth`.

## GET /api/auth/me

Profil de l'utilisateur connecté.

- En-tête : `Authorization: Bearer <jeton>`.
- Vérifications : signature HS256 avec `JWT_SECRET`, émetteur `novashop-auth`, présence de `sub` et `exp`,
  expiration, puis existence et activité du compte en base.
- 200 : `{"id", "email", "full_name", "created_at"}`.
- 401 : `Jeton invalide ou expiré` (jeton absent, mal formé, expiré, signé avec un autre secret, compte
  supprimé ou désactivé).

Le front appelle cette route à chaque chargement de page pour restaurer la session. Un échec, quel qu'il soit,
déconnecte l'utilisateur côté navigateur.

## GET /api/auth/health

Sonde de santé utilisée par le `HEALTHCHECK` du conteneur. Réponse 200 :
`{"status": "ok", "service": "auth-service"}`. Elle n'interroge pas la base : elle prouve seulement que le
processus répond.

## Documentation interactive d'auth-service

- Swagger : `http://<hôte>:8080/api/auth/docs`
- ReDoc : `http://<hôte>:8080/api/auth/redoc`
- Schéma OpenAPI : `/api/auth/openapi.json`

Dans Swagger, le bouton **Authorize** se connecte directement : email dans *username*, mot de passe dans
*password* (le `tokenUrl` pointe sur `/api/auth/login`).

## Journaux d'auth-service

auth-service ne produit pas de journal métier pour les connexions : une connexion réussie ou refusée n'apparaît
que dans le journal d'accès uvicorn, avec son code HTTP.

```
INFO:     172.21.0.1:0 - "POST /api/auth/login HTTP/1.0" 200 OK
INFO:     172.21.0.1:0 - "GET /api/auth/me HTTP/1.0" 401 Unauthorized
```

Messages applicatifs (préfixe `auth-service`) :

- `Base indisponible (tentative N/15), nouvel essai dans 2.0s` : Postgres injoignable au démarrage ;
- `Comptes de démo créés : leo@novashop.fr, ines@novashop.fr` : premier démarrage.

Une suite de `POST /api/auth/login … 401` signale une tentative de devinette de mots de passe : il n'y a pas
de limitation de débit sur cette route.
