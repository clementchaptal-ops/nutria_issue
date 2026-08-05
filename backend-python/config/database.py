import os
import psycopg2

DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", os.environ.get("DB_PASS", ""))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")

INSTANCE_CONNECTION_NAME = os.environ.get("INSTANCE_CONNECTION_NAME")

def get_db_connection():
    """
    Establish and return a connection to the NUTRIA PostgreSQL database.

    Supports connection routing for both local environments via TCP/IP and GCP 
    cloud environments (Cloud Run/Cloud Functions) via Unix sockets.

    Returns:
        psycopg2.extensions.connection: A valid connection object, or None if connection fails.
    """
    try:
        if INSTANCE_CONNECTION_NAME or os.environ.get("K_SERVICE"):
            # Connect via Cloud SQL Auth Proxy Unix socket in GCP environments
            conn_name = INSTANCE_CONNECTION_NAME or "nutria-issue:europe-west1:nutria-issue-db"
            unix_socket = f"/cloudsql/{conn_name}"
            
            connection = psycopg2.connect(
                user=DB_USER,
                password=DB_PASSWORD,
                dbname=DB_NAME,
                host=unix_socket
            )
        else:
            # Connect via standard TCP/IP socket for local development
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