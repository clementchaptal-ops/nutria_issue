import os
import psycopg2

# Variables d'environnement
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", os.environ.get("DB_PASS", ""))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")

# Nom d'instance Cloud SQL (ex: nutria-issue:europe-west1:nutria-db)
INSTANCE_CONNECTION_NAME = os.environ.get("INSTANCE_CONNECTION_NAME")

def get_db_connection():
    """Creates and returns a connection to the NUTRIA PostgreSQL database."""
    try:
        # 1. Si on est déployé sur GCP (Cloud Run / Cloud Functions)
        if INSTANCE_CONNECTION_NAME or os.environ.get("K_SERVICE"):
            conn_name = INSTANCE_CONNECTION_NAME or "nutria-issue:europe-west1:nutria-issue-db"
            unix_socket = f"/cloudsql/{conn_name}"
            
            connection = psycopg2.connect(
                user=DB_USER,
                password=DB_PASSWORD,
                dbname=DB_NAME,
                host=unix_socket
            )
        # 2. Sinon, mode local ou via IP
        else:
            connection = psycopg2.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                dbname=DB_NAME,
                port=DB_PORT
            )
        return connection
    except Exception as e:
        print(f"Fatal PostgreSQL connection error: {e}")
        return None