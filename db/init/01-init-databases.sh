#!/bin/bash
# Exécuté une seule fois, au premier démarrage du volume Postgres.
# Database-per-service : chaque microservice a sa base et son rôle, sans accès à celle de l'autre.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-$POSTGRES_USER}" <<-EOSQL
	CREATE ROLE auth_user WITH LOGIN PASSWORD '${AUTH_DB_PASSWORD}';
	CREATE DATABASE auth_db OWNER auth_user;
	REVOKE ALL ON DATABASE auth_db FROM PUBLIC;

	CREATE ROLE shop_user WITH LOGIN PASSWORD '${SHOP_DB_PASSWORD}';
	CREATE DATABASE shop_db OWNER shop_user;
	REVOKE ALL ON DATABASE shop_db FROM PUBLIC;
EOSQL

echo "Bases auth_db et shop_db créées."
