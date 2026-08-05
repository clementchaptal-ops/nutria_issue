import os
import jwt

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
SYSTEM_API_KEY = os.environ.get("SYSTEM_API_KEY")

def verify_token(auth_header=None, request_headers=None):
    """
    Verifies the authentication of an incoming request.

    This function supports dual-authentication mechanisms:
    1. A system-to-system API key validation using custom headers.
    2. A standard Bearer JSON Web Token (JWT) signature validation.

    Args:
        auth_header (str, optional): The raw Authorization header value. Defaults to None.
        request_headers (dict, optional): Dictionary containing request headers. Defaults to None.

    Returns:
        tuple: A tuple containing (payload_dict, error_message). One of the elements is always None.
    """
    # Authenticate via system-to-system secret key if provided
    if request_headers and SYSTEM_API_KEY:
        system_key = request_headers.get("X-System-Key")
        if system_key and system_key == SYSTEM_API_KEY:
            return {"sub": "CITRIX_SYSTEM", "role": "IT_TEAM", "location": "GLOBAL"}, None

    # Fallback to extracting Authorization header if not explicitly passed
    if not auth_header and request_headers:
        auth_header = request_headers.get("Authorization")

    # Validate presence and schema of Bearer token
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, "Missing or malformed authentication token."

    if not JWT_SECRET_KEY:
        return None, "Server configuration error: JWT_SECRET_KEY is missing in GCP."

    token = auth_header.split(" ")[1]

    # Decode and validate the JWT signature and expiration status
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, "Session expired. Please log in again."
    except jwt.InvalidTokenError:
        return None, "Invalid security token."