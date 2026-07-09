from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from typing import Optional
import jwt
from datetime import datetime, timedelta

# Database configuration import
from config.database import get_db_connection 

# Role management script import
from config.admin_role import get_google_groups

# --- CONFIGURATION ---
GOOGLE_CLIENT_ID = "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com" 
JWT_SECRET_KEY = "your_super_secret_key_change_this_in_production"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

# --- MODELS ---
class GoogleTokenRequest(BaseModel):
    credential: str
    token: Optional[str] = None
    selected_profile: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_name: str
    full_name: str
    role: str       # User role (USER, LOCAL_ADMIN, IT_TEAM)
    location: str   # User country/location

# --- HELPER FUNCTIONS ---
def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# --- ROUTES ---
@router.post("/google")
def google_auth(request: GoogleTokenRequest):
    try:
        # 1. Verify the Google Token
        try:
            idinfo = id_token.verify_oauth2_token(
                request.credential, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
        except ValueError as token_err:
            print(f"=== GOOGLE TOKEN ERROR ===\n{token_err}")
            raise HTTPException(status_code=401, detail="Invalid Google token.")

        # 2. Extract email
        user_email = idinfo.get("email")
        if not user_email:
            raise HTTPException(status_code=400, detail="Email not provided by Google.")

        # 3. Query the Oracle Database
        connection = get_db_connection()
        cursor = connection.cursor()

        query = """
            SELECT user_name, full_name, location 
            FROM LIMS_USERS 
            WHERE LOWER(EMAIL_ADDR) = LOWER(:1)
        """
        cursor.execute(query, (user_email,))
        user_rows = cursor.fetchall()  # Fetch all matching rows to support multiple profiles

        cursor.close()
        connection.close()

        # 4. Check if user exists
        if not user_rows:
            raise HTTPException(
                status_code=403, 
                detail=f"User not found in LIMS database with email: {user_email}"
            )

        # --- MULTIPLE PROFILES MANAGEMENT LOGIC ---
        
        # Case A: User has multiple profiles BUT has not chosen one yet
        if len(user_rows) > 1 and not request.selected_profile:
            profiles_list = [
                {"user_name": row[0], "full_name": row[1], "location": row[2]} 
                for row in user_rows
            ]
            # Send the profiles list back to React with a special flag
            return {
                "require_selection": True,
                "profiles": profiles_list
            }

        # Case B: User has only one profile OR has already selected one
        selected_row = user_rows[0]  # Default to the first profile
        
        if request.selected_profile:
            # Find the exact row matching the user's choice
            matched_row = next((row for row in user_rows if row[0] == request.selected_profile), None)
            if matched_row:
                selected_row = matched_row
            else:
                raise HTTPException(status_code=400, detail="Invalid selected profile.")

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

        
        # =====================================================================
        
        # ---- CAS 1 : Tester en tant que membre de l'équipe IT globale ----
        #role = "IT_TEAM"
        ##db_location = "PL-WAW"
        
        # ---- CAS 2 : Tester en tant qu'Administrateur Local  ----
        #role = "LOCAL_ADMIN"
        #db_location = "PT_OPO"
        
        # ---- CAS 3 : Tester en tant qu'Utilisateur Standard ----
        # role = "USER"
        #db_location = "PL-WAW"

        # =====================================================================
                
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
        }

    except HTTPException as http_err:
        raise http_err

    except Exception as e:
        print("=== UNEXPECTED SYSTEM ERROR ===")
        print(e)
        raise HTTPException(status_code=500, detail="Internal server error during authentication.")