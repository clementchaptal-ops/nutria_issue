import os
import jwt

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_change_this_in_production")
JWT_ALGORITHM = "HS256"
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY", "Nutria_Citrix_Secret_2026_XYZ")

def verify_token(auth_header=None, request_headers=None):
    """
    Vérifie l'authentification.
    Supporte soit le Token JWT Web (Authorization: Bearer ...),
    soit la clé d'API Citrix (X-System-Key: ...).
    """
    # 1. Si les headers complets sont passés, on cherche d'abord la clé Citrix
    if request_headers:
        system_key = request_headers.get("X-System-Key")
        if system_key and system_key == SYSTEM_API_KEY:
            return {"sub": "CITRIX_SYSTEM", "role": "IT_TEAM", "location": "GLOBAL"}, None

    # Si auth_header n'a pas été passé directement, on tente de le récupérer depuis request_headers
    if not auth_header and request_headers:
        auth_header = request_headers.get("Authorization")

    # 2. Vérification classique du Token JWT
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Token d'authentification manquant ou mal formate."

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expiree. Veuillez vous reconnecter."
    except jwt.InvalidTokenError:
        return None, "Token de securite invalide."