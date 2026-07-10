import os
import oracledb

# On récupère les variables (venant du .env en local, ou de GCP en production)
DB_USER = os.environ.get("DB_USER")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_DSN = os.environ.get("DB_DSN")

def get_db_connection():
    """Crée et retourne une connexion à la base Oracle NUTRIA."""
    try:
        connection = oracledb.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            dsn=DB_DSN
        )
        return connection
    except Exception as e:
        print(f"Erreur fatale de connexion Oracle : {e}")
        return None