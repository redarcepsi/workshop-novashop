# Processus des PokéDollars, des boosters et de la collection

PokéBling vend deux choses en euros, par carte bancaire (via `payment-service`) : des cartes Pokémon à l'unité
et des lots de **PokéDollars**, sa monnaie virtuelle. Les PokéDollars servent à ouvrir des **boosters** et à
jouer à la **machine à sous** ; un **booster du jour** est en plus offert chaque jour. Les cartes, achetées,
tirées ou gagnées, rejoignent la **collection** du client. Code : `services/shop-service/app/wallet_service.py`,
`booster_service.py`, `daily_service.py`, `slot_service.py`, `collection_service.py`.

## Vue d'ensemble

```mermaid
flowchart LR
    C["Carte bancaire"] -->|"POST /api/shop/orders<br/>payment-service"| O[Commande PAID]
    O -->|"lot de PokéDollars"| W[("wallets<br/>wallet_entries")]
    O -->|"carte à l'unité"| K[("collection_items")]
    W -->|"POST /api/shop/boosters/{slug}/open<br/>débit en PokéDollars"| B[Tirage serveur]
    D["Booster du jour<br/>POST /api/shop/boosters/daily"] -->|"offert"| B
    B --> K
    W -->|"POST /api/shop/slots/spin<br/>mise en PokéDollars"| S[Machine à sous]
    S -->|"si gagné"| K
```

Seul l'achat en euros passe par `payment-service`. Boosters, booster du jour et machine à sous sont des
opérations internes à `shop_db` : une panne de la plateforme de paiement ne les empêche pas.

## Achat de PokéDollars

1. Le client met un lot dans son panier (`pokedollars-500`, `-1200`, `-2600`, `-7000`) et paie la commande
   comme n'importe quel article (`processus-commande-et-paiement.md`).
2. Dans la transaction SQL qui enregistre la commande, `shop-service` verrouille le porte-monnaie du client
   (`SELECT … FOR UPDATE`, créé au besoin), ajoute le montant et écrit une ligne `wallet_entries`
   (`reason = PURCHASE`, `reference = CMD-…`).
3. Si la commande ne peut pas être enregistrée, rien n'est crédité et le client est remboursé (compensation).

Taux de base : 100 PokéDollars par euro, avec un bonus de 20 à 40 % sur les gros lots. Les lots ont un stock
illimité.

## Ouverture d'un booster

`POST /api/shop/boosters/{slug}/open`, en une seule transaction SQL :

1. **Verrou du porte-monnaie** de l'utilisateur : ses ouvertures passent une par une, deux onglets ne peuvent
   pas dépenser deux fois le même solde.
2. **Idempotence** : si l'en-tête `Idempotency-Key` (UUID choisi par le navigateur) a déjà servi à cet
   utilisateur, la même ouverture est renvoyée sans nouveau débit (double clic, relance après une coupure).
   La même clé pour un autre booster : 409.
3. **Solde** : s'il est inférieur au prix, 409 `Solde insuffisant : il vous manque N PokéDollars`.
4. **Tirage côté serveur** avec `secrets.SystemRandom` (générateur du système, imprévisible) : pour chaque
   emplacement du booster, une rareté est choisie selon ses poids, puis une carte de cette rareté parmi les sets
   du booster, sans doublon dans le même paquet. Le navigateur ne choisit rien.
5. **Écritures** : débit (`wallet_entries`, `reason = BOOSTER`), ajout des cartes à `collection_items`
   (`INSERT … ON CONFLICT DO UPDATE`), historique dans `booster_openings` (cartes dans l'ordre de révélation,
   cartes nouvelles pour le client), puis `COMMIT`.
6. Métriques `shop_boosters_opened_total{booster}` et `shop_pokedollars_total{movement="spent"}` ; journal
   `Booster ouvert : user=<uuid> booster=<slug> cartes=<ids>`.

Le solde ne peut pas devenir négatif : la base l'interdit (`ck_wallet_balance_non_negative`) en plus du contrôle
applicatif.

### Ouverture groupée (5 boosters)

`POST /api/shop/boosters/{slug}/open-batch?count=5` suit les mêmes étapes dans **une seule transaction** :

- le solde doit couvrir tout le lot (`count × prix`), sinon 409 et rien n'est débité ;
- chaque booster est tiré indépendamment et a sa ligne `wallet_entries` et sa ligne `booster_openings` ;
- une carte tirée deux fois dans le lot n'est « nouvelle » que la première fois ;
- l'`Idempotency-Key` du lot donne une clé par booster (UUID v5 dérivé), toujours la même : une requête
  rejouée renvoie les mêmes 5 ouvertures sans redébiter ;
- `shop_boosters_opened_total` augmente de 5, et le journal compte une ligne `Booster ouvert` par booster.

Côté navigateur, le bouton « × 5 » de la page Boosters fait une seule requête, puis le client déchire les paquets
un par un (les cartes sont déjà tirées) ; un récapitulatif rassemble toutes les cartes, les plus rares en tête.

## Booster du jour (offert)

Chaque joueur connecté reçoit un booster gratuit par jour, tiré au hasard parmi les 16 boosters d'un seul set
(le Légendaire, seul booster de l'« Édition premium », est exclu).

- **Lequel ?** `GET /api/shop/boosters/daily`. Le choix dépend de l'utilisateur et de la date (empreinte SHA-256
  de `<user_id>:<jour>`) : il est fixé pour la journée, recharger la page ne permet pas d'en changer. La journée
  suit l'heure de Paris et change à minuit (`next_at`).
- **Ouverture** : `POST /api/shop/boosters/daily`, en une transaction : verrou du porte-monnaie (deux requêtes
  simultanées passent l'une après l'autre), tirage des cartes comme pour un booster payé, ajout à la collection,
  ligne `booster_openings` avec `price = 0` et ligne `daily_boosters`. Aucun débit, aucune ligne `wallet_entries`.
- **Un seul par jour** : la clé primaire de `daily_boosters` (`user_id`, `day`) l'interdit. Une fois le booster
  ouvert, l'appel renvoie la même ouverture : un double clic ou une relance ne donne pas de second booster.
- Métriques `shop_daily_boosters_total` et `shop_boosters_opened_total{booster}` ; journal
  `Booster du jour ouvert : user=<uuid> booster=<slug> cartes=<ids>`.

Côté navigateur, un bandeau « Cadeau du jour » en tête de la page Boosters montre le paquet et le bouton « Ouvrir
gratuitement » (même animation d'ouverture qu'un booster payé) ; une fois ouvert, il affiche le temps restant
avant le suivant.

## Machine à sous

Le joueur choisit n'importe quelle carte du catalogue (page `/slots`, ou lien « machine à sous » de la fiche d'une
carte), mise des PokéDollars et gagne la carte, ou rien. La mise monte et la chance baisse avec la rareté :

| Rareté | Mise | Chance | Coût moyen d'une carte (mise ÷ chance) |
|--------|------|--------|----------------------------------------|
| Commune | 20 | 50 % | 40 |
| Peu commune | 40 | 30 % | 133 |
| Rare | 100 | 15 % | 667 |
| Holo / EX | 200 | 10 % | 2 000 |
| Ultra rare | 400 | 7 % | 5 714 |
| Secrète | 750 | 4 % | 18 750 |

`POST /api/shop/slots/spin` (`{"card_id": …}`), en une transaction, sur le modèle de l'ouverture d'un booster :

1. verrou du porte-monnaie, puis **idempotence** (`Idempotency-Key` déjà utilisée : même partie renvoyée sans
   nouveau débit ; même clé pour une autre carte : 409) ;
2. **solde** inférieur à la mise : 409 `Solde insuffisant : il vous manque N PokéDollars` ;
3. **tirage côté serveur** (`secrets.SystemRandom`) : gagné si le nombre tiré est inférieur à la chance ;
4. **écritures** : débit de la mise (`wallet_entries`, `reason = SLOT`, libellé `Machine à sous : <carte>`), carte
   ajoutée à `collection_items` si gagnée, partie enregistrée dans `slot_spins` (mise et chance du moment,
   résultat, carte nouvelle ou non), puis `COMMIT` ;
5. métriques `shop_slot_spins_total{rarity, outcome}` et `shop_pokedollars_total{movement="spent"}` ; journal
   `Machine à sous : user=<uuid> carte=<id> mise=<n> gagné=<True|False>`.

Le navigateur ne décide rien : il reçoit le résultat, puis fait tourner les trois rouleaux jusqu'à la
combinaison correspondante (trois fois la carte si gagné, une autre combinaison sinon).

## Probabilités affichées

Chaque booster est une liste d'emplacements `{rareté: poids}` (`seed.py`), dans l'ordre de révélation :

| Booster | Emplacements |
|---------|--------------|
| Set de Base, Jungle, Fossile | 3 × commune, 2 × peu commune, 1 × {rare 2, holo 1} |
| Série Noir & Blanc (un booster par set) | 3 × commune, 1 × peu commune, 1 × variante {commune 55, peu commune 30, rare 15}, 1 × {rare 853, holo/EX 120, ultra 20, secrète 7} |
| Coffre des Dragons | 4 × holo, 1 × {holo 993, secrète 7} |
| 151, Évolutions Prismatiques | 3 × commune, 1 × peu commune, 1 × variante {commune 590, peu commune 300, ultra 80, secrète 30}, 1 × {rare 770, holo 150, ultra 65, secrète 15} |
| Légendaire (5 sets, 4 cartes) | 1 × holo, 1 × {holo 70, ultra 30}, 2 × {ultra 75, secrète 25} |

Une rareté absente des sets du booster est ignorée (les anciens sets n'ont pas d'ultra rare ; les trois premiers
sets Noir & Blanc n'ont pas d'EX). Probabilités qui en résultent (au moins une carte par booster) :

| Booster | Holo / EX | Ultra rare | Secrète |
|---------|-----------|------------|---------|
| Set de Base, Jungle, Fossile | 1 sur 3 | – | – |
| Série Noir & Blanc | 1 sur 8 (EX, à partir de Destinées Futures) | 1 sur 44 à 50 | 1 sur 125 à 143 |
| Coffre des Dragons | toujours | – | 1 sur 143 |
| 151, Évolutions Prismatiques | 1 sur 7 | 1 sur 7 | 1 sur 22 |
| Légendaire | toujours | 95,6 % | 43,8 % |

Les boosters Écarlate et Violet suivent les taux constatés sur les vrais paquets ; ceux de la série Noir & Blanc
rendent volontairement les ultra rares (full art) et les « magnifiques rares » plus difficiles à obtenir. Pour
cette série, TCGdex ne distingue pas les holos des rares : les cartes EX forment le palier `HOLO` (libellé
`Rare EX`). `GET
/api/shop/boosters` publie pour chaque rareté la probabilité d'en obtenir au moins une par booster :
`1 − Π (1 − p_emplacement)`. Sur 20 000 tirages simulés, l'écart entre fréquence observée et probabilité publiée
est resté sous 0,5 point.

## Collection

- Une ligne `collection_items` par carte possédée, avec le nombre d'exemplaires.
- `GET /api/shop/collection` : cartes différentes possédées sur 1 797, exemplaires, valeur au prix de la boutique,
  avancement par set, et nombre de boosters ouverts par type (calculé sur `booster_openings`, avec les
  PokéDollars dépensés). La page Collection affiche ces boosters (« Mes boosters » : totaux visibles, détail
  par booster replié par défaut), regroupe les sets par série et affiche toutes les cartes du set choisi, de la moins rare
  à la plus rare (ou par numéro), les manquantes en grisé avec
  un lien pour les acheter à l'unité.

## Annulation d'une commande et PokéDollars

Une commande annulée reprend ce qu'elle a livré : PokéDollars débités (`reason = REFUND`), cartes retirées de la
collection. Si le solde actuel est inférieur aux PokéDollars achetés (déjà dépensés en boosters), l'annulation
est refusée (409) **avant** tout remboursement : pas de remboursement en euros de PokéDollars déjà utilisés.
Voir `processus-annulation-et-remboursement.md`.

## Vérifications utiles

```sql
-- Solde et journal d'un utilisateur cohérents (doit renvoyer 0 ligne)
SELECT w.user_id, w.balance, COALESCE(SUM(e.amount), 0) AS somme
FROM wallets w LEFT JOIN wallet_entries e ON e.user_id = w.user_id
GROUP BY w.user_id, w.balance HAVING w.balance <> COALESCE(SUM(e.amount), 0);

-- Dernières ouvertures
SELECT opened_at, user_id, price, card_ids FROM booster_openings ORDER BY opened_at DESC LIMIT 10;

-- Boosters du jour ouverts aujourd'hui
SELECT day, user_id, booster_id, claimed_at FROM daily_boosters
WHERE day = (now() AT TIME ZONE 'Europe/Paris')::date;

-- Machine à sous : taux de gain observé par mise (doit approcher la chance publiée)
SELECT stake, chance, count(*) AS parties, round(avg(won::int), 3) AS taux_observe
FROM slot_spins GROUP BY stake, chance ORDER BY stake;
```
