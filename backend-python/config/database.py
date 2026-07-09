import os
import oracledb # ou cx_Oracle selon ce que tu avais installé
from dotenv import load_dotenv

# Charge les variables cachées dans ton fichier .env
load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_DSN = os.getenv("DB_DSN") # ex: localhost:1521/XEPDB1 ou l'IP de ton serveur

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