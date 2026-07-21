import os
import jwt

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_change_this_in_production")
JWT_ALGORITHM = "HS256"

# Clé secrète dédiée à Citrix (à définir dans les variables Cloud Run ou par défaut ici)
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY", "Nutria_Citrix_Secret_2026_XYZ")

def verify_token_or_system_key(headers):
    """
    Vérifie si la requête vient du script Citrix (X-System-Key) 
    OU de l'application Web React (Authorization Bearer JWT).
    """
    # 1. Vérification de la clé système Citrix
    system_key = headers.get("X-System-Key")
    if system_key and system_key == SYSTEM_API_KEY:
        # Authentification réussie pour le script automatique !
        return {"sub": "CITRIX_SYSTEM", "role": "IT_TEAM", "location": "GLOBAL"}, None

    # 2. Vérification classique du token JWT Web
    auth_header = headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Token d'authentification manquant ou mal formate."

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expiree."
    except jwt.InvalidTokenError:
        return None, "Token invalide."