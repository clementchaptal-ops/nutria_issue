import jwt
import os

# C'est toujours mieux de lire la clé depuis les variables d'environnement (ou le .env en local)
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_change_this_in_production")
JWT_ALGORITHM = "HS256"

def verify_token(auth_header):
    """
    Vérifie et décode le token JWT envoyé par le Frontend React.
    Retourne un tuple : (payload_utilisateur, message_erreur)
    """
    # 1. Vérifier si l'en-tête existe et commence bien par "Bearer "
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Token d'authentification manquant ou mal formate."

    # 2. Extraire le token (on coupe au niveau de l'espace et on prend la 2ème partie)
    token = auth_header.split(" ")[1]

    # 3. Décoder le token avec la bibliothèque PyJWT
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None  # Succès : on retourne les données, et aucune erreur
        
    except jwt.ExpiredSignatureError:
        return None, "Session expiree. Veuillez vous reconnecter."
        
    except jwt.InvalidTokenError:
        return None, "Token de securite invalide."