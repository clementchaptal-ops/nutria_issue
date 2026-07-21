import os
import jwt
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import ValidationError

# Database configuration import
from config.database import get_db_connection 

# Role management script import
from config.admin_role import get_google_groups

# --- LOCAL FILE IMPORTS ---
from .schemas import GoogleTokenRequest # Assuming you move GoogleTokenRequest to schemas.py or keep it here

# --- CONFIGURATION ---
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com") 
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_change_this_in_production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "True") == "True"

# --- HELPER FUNCTIONS ---
def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# --- ROUTES ---
def google_auth(request_json):
    """
    Handles the Google Single Sign-On flow, validates the token,
    checks the Oracle LIMS database for the user profile,
    determines the role via Google Apps Script, and issues a JWT.
    """
    try:
        # Validate incoming JSON data
        auth_request = GoogleTokenRequest(**request_json)
    except ValidationError as e:
        return {"error": "Format des donnees invalide", "details": e.errors()}, 400

    try:
        # 1. Verify the Google Token
        try:
            idinfo = id_token.verify_oauth2_token(
                auth_request.credential, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
        except ValueError as token_err:
            print(f"=== GOOGLE TOKEN ERROR ===\n{token_err}")
            return {"error": "Invalid Google token."}, 401

        # 2. Extract email
        user_email = idinfo.get("email")
        if not user_email:
            return {"error": "Email not provided by Google."}, 400

        # 3. Query the Database (Mock or Oracle)
        if USE_MOCK_DATA:
            print(f"=== MOCK MODE ENABLED ===\nBypassing Oracle for user: {user_email}")
            
            # Generate a fake username based on the email prefix
            fake_username = user_email.split('@')[0].upper()
            
            # Simulate the exact response format expected from Oracle
            user_rows = [
                (fake_username, "Demo User", "Demo Laboratory")
            ]
            
        else:
            print(f"=== PRODUCTION MODE ===\nConnecting to Oracle for user: {user_email}")
            connection = get_db_connection()
            if not connection:
                return {"error": "Database connection error."}, 500
                
            cursor = connection.cursor()

            query = """
                SELECT user_name, full_name, location 
                FROM LIMS_USERS 
                WHERE LOWER(EMAIL_ADDR) = LOWER(:1)
            """
            cursor.execute(query, (user_email,))
            user_rows = cursor.fetchall()  

            cursor.close()
            connection.close()
            
        # 4. Check if user exists
        if not user_rows:
            return {"error": f"User not found in LIMS database with email: {user_email}"}, 403

        # --- MULTIPLE PROFILES MANAGEMENT LOGIC ---
        
        # Case A: User has multiple profiles BUT has not chosen one yet
        if len(user_rows) > 1 and not auth_request.selected_profile:
            profiles_list = [
                {"user_name": row[0], "full_name": row[1], "location": row[2]} 
                for row in user_rows
            ]
            return {
                "require_selection": True,
                "profiles": profiles_list
            }, 200

        # Case B: User has only one profile OR has already selected one
        selected_row = user_rows[0]  
        
        if auth_request.selected_profile:
            # Find the exact row matching the user's choice
            matched_row = next((row for row in user_rows if row[0] == auth_request.selected_profile), None)
            if matched_row:
                selected_row = matched_row
            else:
                return {"error": "Invalid selected profile."}, 400

        # 5. Extract database values based on the final selection
        db_username = selected_row[0]  
        db_fullname = selected_row[1]
        db_location = selected_row[2]

        # ---------------------------------------------------------
        # 6. DETERMINE ROLE VIA GOOGLE APPS SCRIPT
        # ---------------------------------------------------------  
        role = "USER"  # Default role
        
        groups_data = get_google_groups()
        
        # Safe extraction of the 'data' dictionary from Google response
        data_content = groups_data.get("data", {}) if groups_data else {}
        
        # Exact Google Group emails used as dictionary keys
        it_team_emails = data_content.get("nutria_core_it@mxns.com", [])
        local_admin_emails = data_content.get("nutria-local_admin@mxns.com", [])

        # Debug logs to verify strings are cleaned
        cleaned_user_email = user_email.strip().lower()
        cleaned_it_list = [email.strip().lower() for email in it_team_emails]
        cleaned_admin_list = [email.strip().lower() for email in local_admin_emails]

        if cleaned_user_email in cleaned_it_list:
            role = "IT_TEAM"
        elif cleaned_user_email in cleaned_admin_list:
            role = "LOCAL_ADMIN"

        print(f"\n=> MATCH RESULT FORCED FOR DEV: {db_username} as {role} ({db_location})\n")

        # 7. Generate the JWT Access Token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "sub": db_username, 
                "email": user_email,
                "role": role,           
                "location": db_location 
            }, 
            expires_delta=access_token_expires
        )

        # Return all information back to React
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_name": db_username,
            "full_name": db_fullname,
            "role": role,
            "location": db_location
        }, 200

    except Exception as e:
        print("=== UNEXPECTED SYSTEM ERROR ===")
        print(e)
        return {"error": "Internal server error during authentication."}, 500