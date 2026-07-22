import os
import psycopg2

# Environment variables (GCP Cloud Run or local .env)
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "postgres")
# Supports DB_PASSWORD (your former format) or DB_PASS (standard Cloud format)
DB_PASSWORD = os.environ.get("DB_PASSWORD", os.environ.get("DB_PASS", ""))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_PORT = os.environ.get("DB_PORT", "5432")

def get_db_connection():
    """Creates and returns a connection to the NUTRIA PostgreSQL database."""
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
        print(f"Fatal PostgreSQL connection error: {e}")
        return None