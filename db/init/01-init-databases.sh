#!/bin/bash
# Exécuté automatiquement au premier démarrage du volume Postgres.
# Database-per-service : chaque microservice a sa base et son rôle, sans accès à celles des autres.
#
# Idempotent : sur un volume existant, il ne crée que ce qui manque. Pour l'appliquer à la main :
#   docker compose exec postgres bash /docker-entrypoint-initdb.d/01-init-databases.sh
set -euo pipefail

create_service_db() {
	local db="$1" role="$2" password="$3"
	# Le mot de passe passe par une variable psql et format(%L) : jamais concaténé dans le SQL
	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-$POSTGRES_USER}" \
		-v db="$db" -v role="$role" -v password="$password" <<-'EOSQL'
		SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password')
		WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
		SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
		WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
		REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
	EOSQL
	echo "Base $db prête (rôle $role)."
}

create_service_db auth_db auth_user "$AUTH_DB_PASSWORD"
create_service_db shop_db shop_user "$SHOP_DB_PASSWORD"
create_service_db payment_db payment_user "$PAYMENT_DB_PASSWORD"
