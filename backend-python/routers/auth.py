import os
import jwt
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import ValidationError

from config.database import get_db_connection 
from config.admin_role import get_google_groups
from routers.schemas import GoogleTokenRequest 

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com") 
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "True") == "True"


def create_access_token(data: dict, expires_delta: timedelta):
    """
    Generates a signed HS256 JWT access token with the specified payload and expiration.

    Args:
        data (dict): Data to be encoded as the JWT payload.
        expires_delta (timedelta): Time offset defining when the token will expire.

    Returns:
        str: Encoded cryptographic JWT.

    Raises:
        ValueError: If JWT_SECRET_KEY is missing from environment configurations.
    """
    if not JWT_SECRET_KEY:
        raise ValueError("Server configuration error: JWT_SECRET_KEY is missing in GCP variables.")
        
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def google_auth(request_json):
    """
    Authenticates a user via Google Single Sign-On (SSO), resolves profiles against
    the LIMS database, assigns permission levels, and returns an access token.

    If multiple database profiles match the authenticated email, provides a flag
    requiring the user to select their desired identity.

    Args:
        request_json (dict): Payload containing the Google token and optional profile.

    Returns:
        tuple[dict, int]: Dict payload with details or token and the HTTP status code.
    """
    try:
        auth_request = GoogleTokenRequest(**request_json)
    except ValidationError as e:
        return {"error": "Invalid data format", "details": e.errors()}, 400

    try:
        try:
            # Validate token integrity directly against Google's OAuth2 authorization servers.
            idinfo = id_token.verify_oauth2_token(
                auth_request.credential, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
        except ValueError:
            return {"error": "Invalid Google token."}, 401

        user_email = idinfo.get("email")
        if not user_email:
            return {"error": "Email not provided by Google."}, 400

        if USE_MOCK_DATA:
            fake_username = user_email.split('@')[0].upper()
            user_rows = [
                (fake_username, "Demo User", "Demo Laboratory")
            ]
            
        else:
            connection = get_db_connection()
            if not connection:
                return {"error": "Database connection error."}, 500
                
            cursor = connection.cursor()

            # Retrieve active profiles mapped to the authenticated email address.
            query = """
                SELECT user_name, full_name, location 
                FROM lims_users 
                WHERE LOWER(EMAIL_ADDR) = LOWER(%s)
            """
            cursor.execute(query, (user_email,))
            user_rows = cursor.fetchall()  

            cursor.close()
            connection.close()
            
        if not user_rows:
            return {"error": f"User not found in LIMS database with email: {user_email}"}, 403

        # Return list of potential profiles if selection ambiguity exists.
        if len(user_rows) > 1 and not auth_request.selected_profile:
            profiles_list = [
                {"user_name": row[0], "full_name": row[1], "location": row[2]} 
                for row in user_rows
            ]
            return {
                "require_selection": True,
                "profiles": profiles_list
            }, 200

        selected_row = user_rows[0]  
        
        if auth_request.selected_profile:
            matched_row = next((row for row in user_rows if row[0] == auth_request.selected_profile), None)
            if matched_row:
                selected_row = matched_row
            else:
                return {"error": "Invalid selected profile."}, 400

        db_username = selected_row[0]  
        db_fullname = selected_row[1]
        db_location = selected_row[2]

        role = "USER"  
        
        # Interrogate Google Apps Script groups to dynamically compute administrative hierarchy.
        groups_data = get_google_groups()
        
        it_team_emails = groups_data.get("nutria_core_it@mxns.com", [])
        local_admin_emails = groups_data.get("nutria-local_admin@mxns.com", [])

        cleaned_user_email = user_email.strip().lower()

        if cleaned_user_email in it_team_emails:
            role = "IT_TEAM"
        elif cleaned_user_email in local_admin_emails:
            role = "LOCAL_ADMIN"

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        try:
            access_token = create_access_token(
                data={
                    "sub": db_username, 
                    "email": user_email,
                    "role": role,            
                    "location": db_location 
                }, 
                expires_delta=access_token_expires
            )
        except ValueError as ve:
            return {"error": str(ve)}, 500

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_name": db_username,
            "full_name": db_fullname,
            "role": role,
            "location": db_location
        }, 200

    except Exception as e:
        print(f"[AUTH ERROR - google_auth]: {str(e)}")
        return {"error": "Internal server error during authentication."}, 500