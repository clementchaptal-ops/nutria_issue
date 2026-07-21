import os
import psycopg2

# Variables d'environnement (GCP Cloud Run ou .env local)
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "postgres")
# Supporte DB_PASSWORD (ton ancien format) ou DB_PASS (format standard Cloud)
DB_PASSWORD = os.environ.get("DB_PASSWORD", os.environ.get("DB_PASS", ""))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_PORT = os.environ.get("DB_PORT", "5432")

def get_db_connection():
    """Crée et retourne une connexion à la base PostgreSQL NUTRIA."""
    try:
        connection = psycopg2.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME,
            port=DB_PORT
        )
        return connection
    except Exception as e:
        print(f"Erreur fatale de connexion PostgreSQL : {e}")
        return None