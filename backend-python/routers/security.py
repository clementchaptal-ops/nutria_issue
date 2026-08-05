import os
import jwt

# Récupération sécurisée des secrets depuis l'environnement GCP
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY")

def verify_token(auth_header=None, request_headers=None):
    """
    Vérifie l'authentification de la requête.
    Gère la clé API système Citrix (X-System-Key) et les jetons Bearer JWT.
    """
    # 1. Vérification de la clé système Citrix (si envoyée dans les entêtes)
    if request_headers and SYSTEM_API_KEY:
        system_key = request_headers.get("X-System-Key")
        if system_key and system_key == SYSTEM_API_KEY:
            return {"sub": "CITRIX_SYSTEM", "role": "IT_TEAM", "location": "GLOBAL"}, None

    # Extraction du header Authorization si non fourni explicitement
    if not auth_header and request_headers:
        auth_header = request_headers.get("Authorization")

    # 2. Validation du format de l'entête Authorization
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Missing or malformed authentication token."

    # 3. Validation de la configuration serveur
    if not JWT_SECRET_KEY:
        return None, "Server configuration error: JWT_SECRET_KEY is missing in GCP."

    token = auth_header.split(" ")[1]

    # 4. Décodage et vérification de la signature du JWT
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expired. Please log in again."
    except jwt.InvalidTokenError:
        return None, "Invalid security token."