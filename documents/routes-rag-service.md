# Routes de rag-service

`rag-service` est l'assistant documentaire des opérateurs (profil `ai`) : il répond aux questions à partir
des fichiers de `documents/` et du README, en citant ses sources. API FastAPI + LangChain, préfixe
`/api/rag`, port interne 8000. Code : `services/rag-service/app/routes.py`.

`rag-service` n'est pas publié et n'est pas routé par la passerelle nginx. Il est branché uniquement sur le
réseau `ai` : seuls `assistant-ui` (l'interface de chat) et les commandes lancées dans son conteneur peuvent
l'appeler. Il n'a aucun accès à la plateforme de paiement.

## Résumé des routes de rag-service

| Méthode | Route | Auth | Rôle |
|---------|-------|------|------|
| GET | `/api/rag/health` | – | Sonde de santé |
| GET | `/metrics` | – | Métriques Prometheus, hors préfixe : relayée par `metrics-gateway` seulement |
| GET | `/api/rag/documents` | Bearer | État de l'index |
| POST | `/api/rag/reindex` | Bearer | Synchroniser l'index tout de suite |
| GET | `/api/rag/v1/models` | Bearer | Modèles proposés (compatible OpenAI) |
| POST | `/api/rag/v1/chat/completions` | Bearer | Poser une question (compatible OpenAI) |

Auth « Bearer » : en-tête `Authorization: Bearer <RAG_API_KEY>`, comparé en temps constant. Sinon :
401 `Clé API invalide ou absente`.

## GET /api/rag/health

Réponse : `{"status": "ok", "model": "gemma4:e4b", "embedding_model": "embeddinggemma:latest"}`. Utilisée
par le `HEALTHCHECK` du conteneur. Ne vérifie pas qu'Ollama répond.

## GET /api/rag/documents

Documents indexés, nombre d'extraits par document et fichiers illisibles :

```json
{"documents": [{"source": "documents/architecture-generale.md", "chunks": 19},
               {"source": "project/README.md", "chunks": 34}],
 "chunks": 136, "errors": {}}
```

`errors` associe le nom d'un fichier à la raison de l'échec, par exemple
`aucun texte extrait (PDF scanné ou fichier vide ?)`.

## POST /api/rag/reindex

Lance une synchronisation immédiate au lieu d'attendre le cycle suivant (toutes les 30 s). Réponse :
`{"added": [...], "updated": [...], "removed": [...], "failed": [...]}`.

## GET /api/rag/v1/models

Format OpenAI. Un seul modèle est proposé : `assistant-resilience`.

## POST /api/rag/v1/chat/completions

Sous-ensemble de l'API Chat Completions d'OpenAI. Corps : `model` (ignoré), `messages` (au moins un, le
dernier doit venir de l'utilisateur), `stream` (défaut `false`). Les autres paramètres sont ignorés.

Fichiers joints, au format OpenAI : le `content` d'un message `user` devient une liste de parties
`{"type": "text", "text": "…"}` et `{"type": "file", "file": {"filename": "incident.log", "file_data":
"data:text/plain;base64,…"}}`. Les fichiers de tous les messages `user` de la conversation sont lus (voir
« Fichiers joints dans le chat » dans `processus-assistant-rag.md`).

- `stream: false` : réponse `chat.completion` complète ; la réflexion du modèle, si elle existe, est dans
  `message.reasoning_content`.
- `stream: true` : flux `text/event-stream`. Les morceaux de réflexion arrivent dans
  `delta.reasoning_content` (affichés par `assistant-ui` dans un bloc repliable), la réponse dans
  `delta.content`, puis `data: [DONE]`.
- La réponse se termine par la liste des sources réellement citées, après la ligne `**Sources**`.

### Erreurs de POST /api/rag/v1/chat/completions

| Code ou message | Cause |
|-----------------|-------|
| 400 `La conversation doit se terminer par une question de l'utilisateur` | Dernier message absent ou non `user` |
| 400 `« x.exe » : format non pris en charge (formats lus : …)` | Fichier joint d'un autre format |
| 400 `« x.pdf » dépasse 10 Mo` | Fichier joint trop gros |
| 400 `« x.pdf » : aucun texte extrait (PDF scanné ou fichier vide ?)` | Fichier joint sans texte |
| 400 `« x.docx » : fichier illisible ou endommagé`, `contenu base64 invalide` | Fichier joint corrompu |
| 503 `Recherche documentaire indisponible (Ollama injoignable ?)` | La vectorisation de la question a échoué |
| 503 `Modèle local indisponible` | Génération impossible (mode sans flux) |
| Texte `⚠️ Le modèle local ne répond plus, réessayez.` | Génération interrompue en mode flux : le code 200 était déjà parti |
| Réponse `Aucun document n'est encore indexé…` | L'index est vide |

## Appeler l'API de rag-service depuis la VM

`rag-service` n'étant pas publié, on passe par son conteneur, qui connaît déjà la clé :

```bash
docker compose exec rag-service python -c "import os, urllib.request as u; r = u.Request('http://127.0.0.1:8000/api/rag/documents', headers={'Authorization': 'Bearer ' + os.environ['RAG_API_KEY']}); print(u.urlopen(r).read().decode())"
```

Pour forcer la réindexation, même commande avec l'URL `.../api/rag/reindex` et `method='POST'` dans
`u.Request(...)`. Plus simple pour suivre l'indexation : `docker compose logs -f rag-service`.

## Documentation interactive de rag-service

Swagger sur `/api/rag/docs`, ReDoc sur `/api/rag/redoc`, mais seulement depuis le réseau `ai` : il n'existe
pas de console publiée pour `rag-service` comme `payment-console` pour `payment-service`.

## Comment assistant-ui utilise rag-service

`assistant-ui` est configuré avec `RAG_SERVICE_URL=http://rag-service:8000/api/rag/v1` et `RAG_API_KEY`. Pour
chaque question, il appelle `POST /v1/chat/completions` en mode flux avec toute la conversation, fichiers
joints compris. Il affiche `delta.reasoning_content` dans le bloc « Réflexion », `delta.content` comme
réponse, et le `detail` d'une erreur 400 ou 503 dans le chat. Le bouton stop ferme la connexion :
`rag-service` abandonne alors la génération et Ollama est libéré pour la question suivante.
