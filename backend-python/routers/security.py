import os
import jwt

# On récupère les variables d'environnement sans valeur secrète codée en dur
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY")

def verify_token(auth_header=None, request_headers=None):
    """
    Verifies authentication.
    Supports either the Web JWT Token (Authorization: Bearer ...)
    or the Citrix API key (X-System-Key: ...).
    """
    # 1. If full headers are provided, check for Citrix key first
    if request_headers and SYSTEM_API_KEY:
        system_key = request_headers.get("X-System-Key")
        if system_key and system_key == SYSTEM_API_KEY:
            return {"sub": "CITRIX_SYSTEM", "role": "IT_TEAM", "location": "GLOBAL"}, None

    # If auth_header was not passed directly, try retrieving it from request_headers
    if not auth_header and request_headers:
        auth_header = request_headers.get("Authorization")

    # 2. Standard JWT token verification
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Missing or malformed authentication token."

    token = auth_header.split(" ")[1]

    # Vérification que la clé de signature JWT est bien définie sur le serveur
    if not JWT_SECRET_KEY:
        return None, "Server configuration error: JWT_SECRET_KEY is missing."

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expired. Please log in again."
    except jwt.InvalidTokenError:
        return None, "Invalid security token."