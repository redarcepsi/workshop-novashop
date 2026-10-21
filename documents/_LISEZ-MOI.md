# Documents de l'assistant

Tout ce qui est déposé ici est lu par l'assistant des opérateurs (port 8083 de la VM) : il répond à
partir de ces fichiers et cite ses sources. **Pas besoin de redémarrer** : un fichier ajouté, modifié ou
supprimé est pris en compte en moins de 30 secondes.

Le README du dépôt (architecture, réseaux, endpoints) est indexé d'office, sous le nom `project/README.md`.

## Quoi déposer

Tout va directement dans ce dossier : procédures de reprise (runbooks), architecture et matrice des
réseaux, gouvernance (EBIOS RM, PCA/PRA, NIS2 / DORA, RTO / RPO), scénarios d'incident et réponses de
l'automate.

## Formats lus

Markdown (`.md`), texte (`.txt`), YAML (`.yml`, `.yaml` : playbooks Ansible, configurations), PDF (`.pdf`)
et Word (`.docx`). Un PDF scanné (image sans texte) ne peut pas être lu.

Sont ignorés : les fichiers et dossiers qui commencent par `.` ou `_` (comme celui-ci), les fichiers
temporaires de Word (`~$…`) et les fichiers de plus de 25 Mo.

## Pour de bonnes réponses

- **Un sujet par fichier**, avec un titre explicite : l'assistant cite le nom du fichier.
- En Markdown, **structurez avec des titres** (`#`, `##`, `###`) : ils apparaissent dans les sources
  (« `documents/reprise.md` › Reprise › Vérifier le paiement »).
- Écrivez les noms exacts : services (`payment-service`), commandes, codes d'erreur, noms des alertes.
- Pour un PDF, l'assistant cite la page ; pour un Word, seulement le nom du fichier (les titres Word ne
  sont pas repris). Les procédures qu'on veut retrouver vite gagnent à être en Markdown.
- Posez des **questions précises** : l'assistant répond à partir des 5 passages les plus pertinents.
  Il ne sait pas résumer fidèlement un long document entier.
- Pour une question ponctuelle sur un fichier (journal, rapport d'incident), **joignez-le dans le chat**
  (bouton « + ») plutôt que de le déposer ici : il ne sert qu'à la conversation en cours.
- Pas de secret ici (mots de passe, clés API) : ce dossier est versionné et lu par le modèle.

## Vérifier l'indexation

```bash
docker compose logs -f rag-service     # "index action=added source=documents/reprise.md chunks=7"
```

Un fichier illisible apparaît en `action=failed` avec la raison.
