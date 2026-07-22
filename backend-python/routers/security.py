import os
import jwt

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_change_this_in_production")
JWT_ALGORITHM = "HS256"
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY", "Nutria_Citrix_Secret_2026_XYZ")

def verify_token(auth_header=None, request_headers=None):
    """
    Verifies authentication.
    Supports either the Web JWT Token (Authorization: Bearer ...)
    or the Citrix API key (X-System-Key: ...).
    """
    # 1. If full headers are provided, check for Citrix key first
    if request_headers:
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

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expired. Please log in again."
    except jwt.InvalidTokenError:
        return None, "Invalid security token."