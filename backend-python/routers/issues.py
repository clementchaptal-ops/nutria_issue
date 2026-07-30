import os
import uuid
import datetime
import google.auth
from google.auth.transport import requests
from google.cloud import storage

from config.database import get_db_connection
from pydantic import ValidationError

# Local file imports
from .schemas import TicketCreate, TicketUpdate, StatusUpdate
from .audit import log_user_action

BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")

def make_signed_url(public_url: str) -> str:
    """Generates a temporary signed URL (15 min) compatible with Cloud Run and GCP IAM Credentials."""
    if not public_url or "storage.googleapis.com" not in public_url:
        return public_url

    parts = public_url.replace("https://storage.googleapis.com/", "").split("/", 1)
    if len(parts) != 2:
        return public_url

    bucket_name, blob_name = parts[0], parts[1]

    try:
        # Fetch default service account credentials from Cloud Run environment
        credentials, _ = google.auth.default()
        
        # Refresh the short-lived OAuth access token
        auth_request = requests.Request()
        credentials.refresh(auth_request)

        client = storage.Client(credentials=credentials)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        # Generate signed URL using IAM SignBlob API via access token
        return blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="GET",
            service_account_email=credentials.service_account_email,
            access_token=credentials.token
        )
    except Exception as e:
        # Exception caught silently to avoid log pollution, returning fallback URL
        print(f"[STORAGE ERROR - make_signed_url]: {str(e)}")
        return public_url

# =====================================================================
# 1. STATIC ROUTES
# =====================================================================

def get_all_issues(current_user):
    """Fetches all tickets from the database, filtering them based on the user's role and site location code prefix."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    cursor = connection.cursor()
    tickets = []
    
    try:
        # Utilisation de DISTINCT ON pour garantir l'unicité stricte par ID de ticket
        base_qry = """
            SELECT DISTINCT ON (i.id_issue) 
                   i.id_issue, i.title, i.issue_type, i.status, i.user_name,
                   u.full_name, u.location, TO_CHAR(i.created_on, 'YYYY-MM-DD HH24:MI') as c_date,
                   i.criticity, i.environment,l.id_regroupment  
            FROM c_issue i
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
            LEFT JOIN c_link_issue_regroupment l ON i.id_issue = l.id_issue  
        """

        if user_role == "IT_TEAM":
            qry = base_qry + " ORDER BY i.id_issue DESC"
            cursor.execute(qry)
        else:
            safe_location = str(user_location).strip().upper() if user_location else ""
            
            if len(safe_location) >= 7 and safe_location[6:7] == "-":
                site_root = safe_location[:6]
            else:
                site_root = safe_location

            # PostgreSQL parameterized query
            qry = base_qry + """
                WHERE TRIM(UPPER(u.location)) LIKE TRIM(UPPER(%s)) || '%%' 
                ORDER BY i.id_issue DESC
            """
            cursor.execute(qry, (site_root,))
            
        rows = cursor.fetchall()
        for row in rows:
            tickets.append({
                "id_issue": row[0],
                "title": row[1] if row[1] else "Untitled",
                "issue_type": row[2] if row[2] else "N/A",
                "status": row[3] if row[3] else "PRETICKET",
                "user_name": row[4] if row[4] else "Unknown",
                "full_name": row[5] if row[5] else (row[4] if row[4] else "Unknown"),
                "country": row[6] if row[6] else "Global", 
                "creation_date": row[7] if row[7] else "",
                "criticity": row[8] if row[8] else "N/A",
                "environment": row[9] if row[9] else "UNKNOWN",
                "id_regroupement": row[10] if row[10] else "No Regroupement"
            })
        return tickets, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_all_issues]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def get_my_profile(current_user):
    """Fetches true LIMS user profile details for the currently logged-in account."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        username = current_user.get("sub")
        
        qry = """
            SELECT user_name, full_name, email_addr, user_role, lab, location
            FROM lims_users
            WHERE TRIM(UPPER(user_name)) = TRIM(UPPER(%s))
        """
        cursor.execute(qry, (username,))
        row = cursor.fetchone()
        
        if not row:
            return {"error": "error.user_not_found"}, 404
            
        return {
            "user_name": row[0], "full_name": row[1], "user_email": row[2],
            "current_role": row[3], "lab": row[4], "location": row[5]
        }, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_my_profile]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def create_issue(request_json, current_user, client_ip):
    """Creates a new manual issue through the web platform and routes it straight to 'IN PROGRESS'."""
    try:
        issue_payload = IssueCreate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    username = current_user.get("sub") 
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        # 🚨 Retour à 'IN PROGRESS'
        insert_qry = """
            INSERT INTO c_issue (title, issue_type, criticity, frequency, description, status, user_name, created_on, changed_on) 
            VALUES (%s, %s, %s, %s, %s, 'IN PROGRESS', %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
            RETURNING id_issue
        """
        cursor.execute(insert_qry, (issue_payload.title, issue_payload.issue_type, issue_payload.criticity, issue_payload.frequency, issue_payload.description, username))
        
        next_id = cursor.fetchone()[0]
        connection.commit()

        log_user_action(user_name=username, action_type="CREATE_ISSUE", target_id=str(next_id), details=f"Manual web creation. Title: '{issue_payload.title}'", ip_address=client_ip)
        
        return {"id_issue": next_id, "message": "success.issue_created"}, 201
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - create_issue]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()

# =====================================================================
# 2. DYNAMIC ROUTES
# =====================================================================

def get_issue(issue_id, current_user):
    """Fetches detailed technical data and contextual information, including its attachments."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
    
    try:
        cursor = connection.cursor()
        
        # Champ sspticket supprimé de la requête
        qry = """
            SELECT i.id_issue, i.title, i.issue_type, i.description, i.user_name, i.ip_adress,
                   i.ip_config, i.ping, i.status, i.citrix_session, i.current_pc, i.frequency,
                   i.blocking_issue, i.criticity, i.workstation, i.working_dir,
                   i.current_active_role, i.current_project, i.current_batch, i.current_sample,
                   i.environment, i.current_analysis, i.current_analysis_variation, i.current_customer,
                   u.location as creator_location, u.full_name, u.lab as creator_lab, u.email_addr as user_email,
                   TO_CHAR(i.created_on, 'YYYY-MM-DD HH24:MI:SS') as created_on
            FROM c_issue i
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
            WHERE i.id_issue = %s
        """
        cursor.execute(qry, (issue_id,))
        columns = [col[0].lower() for col in cursor.description]
        row = cursor.fetchone()
        
        if not row:
            return {"error": "error.issue_not_found"}, 404
            
        issue_data = dict(zip(columns, row))
        
        ticket_location = issue_data.get("creator_location")
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_location).strip().upper() if ticket_location else "NONE"

        if user_role != "IT_TEAM" and safe_ticket_loc != safe_user_loc:
            return {"error": "error.access_denied"}, 403
            
        attachments_qry = """
            SELECT id_attachment, attachment_name, attachment_type, url_path
            FROM c_issue_attachment
            WHERE id_issue = %s AND (removed != 'T' OR removed IS NULL) AND id_comment IS NULL
        """
        cursor.execute(attachments_qry, (issue_id,))
        attach_cols = [col[0].lower() for col in cursor.description]
        attach_rows = cursor.fetchall()
        
        attachments_list = [dict(zip(attach_cols, r)) for r in attach_rows]
        
        # Apply signed URLs
        for att in attachments_list:
            att["url_path"] = make_signed_url(att["url_path"])
            
        issue_data["attachments"] = attachments_list
        
        return issue_data, 200
        
    except Exception as e:
        print(f"[DATABASE ERROR - get_issue]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def get_issue_comments(issue_id, current_user):
    """Fetches comments and their respective attachments for a specific issue."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        qry = """
            SELECT c.id_comment, c.user_name, u.full_name, c.comment_text, 
                   TO_CHAR(c.created_on, 'YYYY-MM-DD HH24:MI') as c_date
            FROM c_issue_comments c
            LEFT JOIN lims_users u ON TRIM(UPPER(c.user_name)) = TRIM(UPPER(u.user_name))
            WHERE c.id_issue = %s
            ORDER BY c.created_on ASC
        """
        cursor.execute(qry, (issue_id,))
        
        comments_dict = {}
        comments_list = []
        
        for row in cursor.fetchall():
            comment_str = row[3]
            
            c_id = row[0]
            comment_obj = {
                "id_comment": c_id,
                "user_name": row[1],
                "full_name": row[2] if row[2] else row[1],
                "comment_text": comment_str,
                "created_on": row[4],
                "attachments": [] 
            }
            comments_dict[c_id] = comment_obj
            comments_list.append(comment_obj)
            
        if comments_list:
            attach_qry = """
                SELECT id_comment, attachment_name, attachment_type, url_path
                FROM c_issue_attachment
                WHERE id_issue = %s AND id_comment IS NOT NULL AND (removed != 'T' OR removed IS NULL)
            """
            cursor.execute(attach_qry, (issue_id,))
            for att_row in cursor.fetchall():
                att_c_id = att_row[0]
                if att_c_id in comments_dict:
                    comments_dict[att_c_id]["attachments"].append({
                        "attachment_name": att_row[1],
                        "attachment_type": att_row[2],
                        "url_path": make_signed_url(att_row[3]) # Signed URL applied here
                    })
                    
        return comments_list, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_issue_comments]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def add_issue_comment(issue_id, payload_data, current_user, client_ip):
    """Adds a text comment to a specific issue."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    username = current_user.get("sub", "UNKNOWN")
    comment_text = payload_data.get("comment_text", "")
    
    try:
        cursor = connection.cursor()
        
        qry = """
            INSERT INTO c_issue_comments (id_issue, user_name, comment_text)
            VALUES (%s, %s, %s) RETURNING id_comment
        """
        cursor.execute(qry, (issue_id, username, comment_text))
        
        new_comment_id = cursor.fetchone()[0]
        connection.commit()
        
        preview = comment_text[:50] + "..." if len(comment_text) > 50 else comment_text
        log_user_action(
            user_name=username, action_type="ADD_COMMENT", target_id=str(issue_id),
            details=f"Added a comment: '{preview}'", ip_address=client_ip
        )
        
        return {"id_comment": new_comment_id, "message": "success.comment_added"}, 201
        
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - add_issue_comment]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def get_oracle_attachment_type(content_type: str, filename: str) -> str:
    """Evaluates the MIME type to return the legacy Oracle attachment type."""
    content_type = content_type.lower()
    if content_type.startswith('image/'): return 'IMAGE'
    elif content_type.startswith('video/'): return 'VIDEO'
    elif 'zip' in content_type or filename.lower().endswith('.zip'): return 'ZIP'
    else: return 'DOCUMENT'


def upload_comment_attachments(issue_id, comment_id, files_data, current_user):
    """Uploads comment attachments to Google Cloud Storage (Cloud Run standard)."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        
        cursor = connection.cursor()
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            unique_prefix = uuid.uuid4().hex[:8]
            safe_file_name = f"com_{unique_prefix}_{filename}"
            blob_path = f"tickets/ticket_{issue_id}/comments/{safe_file_name}"
            
            # Upload to GCS
            blob = bucket.blob(blob_path)
            blob.upload_from_string(file_bytes)
            public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"
            
            attach_type = get_oracle_attachment_type(content_type, filename)
            
            qry = """
                INSERT INTO c_issue_attachment (id_issue, id_comment, attachment_name, attachment_type, url_path) 
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(qry, (issue_id, comment_id, filename, attach_type, public_url))
            
        connection.commit()
        return {"message": "success.attachments_uploaded"}, 200
    except Exception as e:
        connection.rollback()
        print(f"[STORAGE/DB ERROR - upload_comment_attachments]: {str(e)}")
        return {"error": "error.storage_upload", "details": "An internal error occurred during file upload."}, 500
    finally:
        cursor.close()
        connection.close()


def validate_issue(issue_id, request_json, current_user, client_ip):
    """Validates data alterations and updates an issue payload to 'IN PROGRESS' status."""
    try:
        issue_payload = IssueUpdate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    user_email = current_user.get("email")
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    username = current_user.get("sub", "UNKNOWN")

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = %s"
        cursor.execute(check_qry, (issue_id,))
        issue_row = cursor.fetchone()
        
        if not issue_row:
            return {"error": "error.issue_not_found"}, 404
            
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_issue_email = str(issue_row[1]).strip().lower() if issue_row[1] else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_issue_loc = str(issue_row[0]).strip().upper() if issue_row[0] else "NONE"

        if user_role == "USER" and safe_issue_email != safe_user_email:
            return {"error": "error.forbidden_access"}, 403
        elif user_role == "LOCAL_ADMIN" and safe_issue_loc != safe_user_loc:
            return {"error": "error.forbidden_access"}, 403

        # 🚨 Retour à 'IN PROGRESS'
        update_qry = """
            UPDATE c_issue 
            SET title = %s, issue_type = %s, criticity = %s, frequency = %s, 
                blocking_issue = %s, description = %s,
                current_project = %s, current_batch = %s, current_sample = %s,
                current_analysis = %s, current_analysis_variation = %s,
                current_customer = %s, status = 'IN PROGRESS', 
                changed_on = CURRENT_TIMESTAMP, changed_by = %s
            WHERE id_issue = %s AND status NOT IN ('CANCELED', 'CLOSED')
        """
        cursor.execute(update_qry, (
            issue_payload.title, issue_payload.issue_type, issue_payload.criticity, issue_payload.frequency, 
            issue_payload.blocking_issue, issue_payload.description,
            issue_payload.current_project, issue_payload.current_batch, issue_payload.current_sample,
            issue_payload.current_analysis, issue_payload.current_analysis_variation,
            issue_payload.current_customer, username, issue_id
        ))
        connection.commit()
        
        if cursor.rowcount == 0:
            return {"error": "error.unable_to_modify_issue"}, 400

        log_user_action(user_name=username, action_type="UPDATE_ISSUE", target_id=str(issue_id), details=f"Issue updated/validated. New title: '{issue_payload.title}'", ip_address=client_ip)
            
        return {"message": "success.issue_validated"}, 200
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - validate_issue]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def cancel_issue(issue_id, current_user, client_ip):
    """Flags a target active ticket with the 'CANCELED' status."""
    user_email = current_user.get("email")
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    username = current_user.get("sub", "UNKNOWN")

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = %s"
        cursor.execute(check_qry, (issue_id,))
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            return {"error": "error.issue_not_found"}, 404
            
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            return {"error": "error.cancel_forbidden_ownership"}, 403
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            return {"error": "error.cancel_forbidden_jurisdiction"}, 403

        cursor.execute("UPDATE c_issue SET status = 'CANCELED', changed_on = CURRENT_TIMESTAMP WHERE id_issue = %s", (issue_id,))
        connection.commit()

        log_user_action(user_name=username, action_type="CANCEL_TICKET", target_id=str(issue_id), details="Ticket canceled by user.", ip_address=client_ip)
        return {"message": "success.ticket_canceled"}, 200
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - cancel_issue]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def download_file_path(ticket_id, file_type, current_user, client_ip):
    """
    On GCP, files are in Cloud Storage, not on the local disk.
    We MUST retrieve the exact URL (with the UUID hash) from the database!
    """
    if file_type == "working_dir":
        search_pattern = "%WorkingDir.zip"
        action_type = "DOWNLOAD_WORKING_DIR"
        details = "Downloaded contextual Working Directory."
    elif file_type == "logs":
        search_pattern = "%Logs.zip"
        action_type = "DOWNLOAD_LOGS"
        details = "Downloaded system Logs files."
    else:
        return {"error": "error.invalid_file_type"}, 400

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    try:
        cursor = connection.cursor()
        
        # Récupération de l'URL exacte générée lors de l'upload (avec le hash)
        qry = """
            SELECT url_path, attachment_name 
            FROM c_issue_attachment 
            WHERE id_issue = %s 
              AND attachment_name LIKE %s 
              AND (removed != 'T' OR removed IS NULL)
            LIMIT 1
        """
        cursor.execute(qry, (ticket_id, search_pattern))
        row = cursor.fetchone()

        if not row:
            return {"error": "error.file_not_found_in_db"}, 404

        public_url = row[0]
        file_name = row[1]
        
        # Sign this URL to allow secure downloading
        signed_url = make_signed_url(public_url)
        
        log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=str(ticket_id), details=details, ip_address=client_ip)
        
        return {"file_path": signed_url, "file_name": file_name}, 200

    except Exception as e:
        print(f"[DATABASE ERROR - download_file_path]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def close_ticket(issue_id, request_json, current_user, client_ip):
    """Transitions the resolution status lifecycle parameters to 'RESOLVED' or 'CLOSED'."""
    try:
        payload = StatusUpdate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    valid_statuses = ["CLOSED", "ACT KNOWLEDGE"]
    if payload.new_status not in valid_statuses:
        return {"error": "error.invalid_status_option"}, 400

    user_role = current_user.get("role")
    user_trigram = current_user.get("sub", "").lower()

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT user_name FROM c_issue WHERE id_issue = %s", (issue_id,))
        row = cursor.fetchone()
        if not row:
            return {"error": "error.issue_not_found"}, 404
            
        ticket_owner = row[0].lower() if row[0] else ""
        if user_role not in ["IT_TEAM", "LOCAL_ADMIN"] and user_trigram != ticket_owner:
            return {"error": "error.close_forbidden_permissions"}, 403

        cursor.execute("UPDATE c_issue SET status = %s, changed_on = CURRENT_TIMESTAMP WHERE id_issue = %s", (payload.new_status, issue_id))
        connection.commit()

        action_type = "RESOLVE_TICKET" if payload.new_status == "ACT KNOWLEDGE" else "CLOSE_TICKET"
        log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=str(issue_id), details=f"Status modification validated: {payload.new_status}", ip_address=client_ip)

        return {"message": "success.ticket_status_updated", "new_status": payload.new_status}, 200
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - close_ticket]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def create_preticket(request_json, current_user, client_ip):
    """
    Receives automated capture data from LabWare LIMS scripts.
    1. Extracts real LIMS username from payload/snapshot.
    2. Synchronizes/Ensures user exists in lims_users.
    3. Inserts a technical PRETICKET into c_issue.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    cursor = None
    try:
        cursor = connection.cursor()
        
        # --- 1. EXTRACTION DU VRAI USERNAME LIMS ---
        user_snapshot = request_json.get("user_snapshot") or {}
        
        # Priorité : user_name du snapshot > user_name du JSON principal > Fallback
        lims_username = (
            user_snapshot.get("user_name") or 
            request_json.get("user_name") or 
            "UNKNOWN"
        )

        # --- 2. SYNCHRONISATION / CREATION DANS LIMS_USERS ---
        fullname = user_snapshot.get("full_name", "")
        email = user_snapshot.get("email_addr", "")
        user_role = user_snapshot.get("user_role", "")
        lab = user_snapshot.get("lab", "")
        location = user_snapshot.get("location", "")

        # Vérification si l'utilisateur existe dans lims_users
        cursor.execute("SELECT user_name FROM lims_users WHERE TRIM(UPPER(user_name)) = TRIM(UPPER(%s))", (lims_username,))
        existing_user = cursor.fetchone()

        if existing_user:
            # Mise à jour si snapshot présent
            if user_snapshot:
                update_user_qry = """
                    UPDATE lims_users 
                    SET full_name = %s, email_addr = %s, user_role = %s, lab = %s, location = %s
                    WHERE TRIM(UPPER(user_name)) = TRIM(UPPER(%s))
                """
                cursor.execute(update_user_qry, (fullname, email, user_role, lab, location, lims_username))
        else:
            # Création automatique pour garantir la Clé Étrangère (fk_c_issue_user)
            insert_user_qry = """
                INSERT INTO lims_users (user_name, full_name, email_addr, user_role, lab, location)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(insert_user_qry, (lims_username, fullname, email, user_role, lab, location))
        
        connection.commit()

        # --- 3. CREATION DU PRETICKET ---
        title = request_json.get("title") or "Automated Preticket"
        
        # Formatage de la description avec l'heure client exacte
        client_time = request_json.get("client_time", "Unknown Time")
        raw_description = request_json.get("description", "")
        description = f"[LIMS Local Time: {client_time}]\n{raw_description}"
        
        workstation = request_json.get("workstation", "")
        ip_adress = request_json.get("ip_address", "")
        ip_config = request_json.get("ip_config", "")
        ping = request_json.get("ping", "")
        citrix = request_json.get("citrix_session", "")
        current_pc = request_json.get("current_pc", "")
        working_dir = request_json.get("working_dir", "")
        role = request_json.get("current_role", "")
        environment = request_json.get("environment", "UNKNOWN")

        insert_ticket_qry = """
            INSERT INTO c_issue (
                title, description, user_name, workstation, ip_adress, 
                ip_config, ping, citrix_session, current_pc, working_dir, 
                current_active_role, environment, status, created_on, changed_on
            ) 
            VALUES (
                %s, %s, %s, %s, %s, 
                %s, %s, %s, %s, %s, 
                %s, %s, 'PRETICKET', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) 
            RETURNING id_issue
        """
        cursor.execute(insert_ticket_qry, (
            title, description, lims_username, workstation, ip_adress, 
            ip_config, ping, citrix, current_pc, working_dir, 
            role, environment
        ))
        
        row = cursor.fetchone()
        next_id = row[0] if row else 0
        connection.commit()
        
        return {"id_issue": next_id, "message": "success.preticket_created"}, 201
        
    except Exception as e:
        if connection:
            connection.rollback()
        print(f"[DATABASE ERROR - create_preticket]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
            

def update_issue_environment(issue_id, request_json):
    """Updates only the contextual environment data of a preticket/ticket."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        project = request_json.get("current_project", "")
        batch = request_json.get("current_batch", "")
        analysis = request_json.get("current_analysis", "")
        variation = request_json.get("current_analysis_variation", "")
        customer = request_json.get("current_customer", "")
        
        # Sécurisation du champ Sample (PostgreSQL attend un numérique ou NULL)
        sample_str = request_json.get("current_sample", "").strip()
        sample = int(sample_str) if sample_str else None
        
        update_qry = """
            UPDATE c_issue 
            SET current_project = %s, current_batch = %s, current_sample = %s, 
                current_analysis = %s, current_analysis_variation = %s, current_customer = %s
            WHERE id_issue = %s
        """
        cursor.execute(update_qry, (project, batch, sample, analysis, variation, customer, issue_id))
        connection.commit()
        
        return {"message": "success.environment_updated"}, 200
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - update_issue_environment]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def trigger_ai_analysis(issue_id, current_user, client_ip):
    """
    Triggers the AI analysis for a specific ticket.
    Generates JSON and PDF reports and returns the download links.
    """
    from .reports import generate_ai_analysis
    # Call the logic isolated in reports.py
    result, status_code = generate_ai_analysis(issue_id, current_user, client_ip)
    
    # Log the action if successful
    username = current_user.get("sub", "UNKNOWN")
    if status_code == 200:
        log_user_action(
            user_name=username, 
            action_type="GENERATE_AI_ANALYSIS", 
            target_id=str(issue_id), 
            details="Generated AI Analysis report (JSON & PDF).", 
            ip_address=client_ip
        )
    
    return result, status_code


def sync_lims_user(request_json):
    """
    Reçoit les informations d'un utilisateur depuis LabWare LIMS.
    Crée l'utilisateur s'il n'existe pas, ou met à jour ses infos s'il existe déjà.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        # Récupération des données envoyées par le JSON LabWare
        user_name = request_json.get("user_name")
        
        if not user_name:
            return {"error": "error.missing_user_name"}, 400
            
        full_name = request_json.get("full_name", "")
        email_addr = request_json.get("email_addr", "")
        user_role = request_json.get("user_role", "USER")
        lab = request_json.get("lab", "")
        location = request_json.get("location", "")
        
        # Requête UPSERT (Insert or Update) spécifique à PostgreSQL
        # Nécessite que la colonne user_name soit une clé primaire (PRIMARY KEY) ou UNIQUE
        upsert_qry = """
            INSERT INTO lims_users (user_name, full_name, email_addr, user_role, lab, location)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_name) DO UPDATE 
            SET full_name = EXCLUDED.full_name,
                email_addr = EXCLUDED.email_addr,
                user_role = EXCLUDED.user_role,
                lab = EXCLUDED.lab,
                location = EXCLUDED.location;
        """
        
        cursor.execute(upsert_qry, (user_name, full_name, email_addr, user_role, lab, location))
        connection.commit()
        
        return {"message": f"success.user_synced", "user": user_name}, 200
        
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - sync_lims_user]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def system_cleanup():
    """
    Tâche de maintenance globale :
    1. Supprime les PRETICKETS (> 1h) ET leurs fichiers sur Cloud Storage.
    2. Supprime les logs d'audit (> 2 ans).
    3. Supprime les tickets CLOSED (> 6 mois) ET leurs fichiers sur Cloud Storage.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        # --- Fonction interne pour nettoyer un dossier GCS ---
        def delete_gcs_folder(issue_id):
            blobs = bucket.list_blobs(prefix=f"tickets/ticket_{issue_id}/")
            for blob in blobs:
                blob.delete()
            # Force la suppression du dossier visuel (créé manuellement ou IHM)
            for folder_path in [f"tickets/ticket_{issue_id}/", f"tickets/ticket_{issue_id}"]:
                folder_blob = bucket.blob(folder_path)
                if folder_blob.exists():
                    folder_blob.delete()

        # --- 1. NETTOYAGE DES PRETICKETS (> 1 heure) ---
        cursor.execute("SELECT id_issue FROM c_issue WHERE status = 'PRETICKET' AND created_on < CURRENT_TIMESTAMP - INTERVAL '1 hour'")
        expired_pretickets = [row[0] for row in cursor.fetchall()]
        deleted_pretickets_count = len(expired_pretickets)

        if deleted_pretickets_count > 0:
            for p_id in expired_pretickets:
                delete_gcs_folder(p_id)

            p_format = ','.join(['%s'] * deleted_pretickets_count)
            p_tuple = tuple(expired_pretickets)
            
            cursor.execute(f"DELETE FROM c_issue_attachment WHERE id_issue IN ({p_format})", p_tuple)
            cursor.execute(f"DELETE FROM c_issue_comments WHERE id_issue IN ({p_format})", p_tuple)
            cursor.execute(f"DELETE FROM c_issue WHERE id_issue IN ({p_format})", p_tuple)

        # --- 2. NETTOYAGE DES LOGS D'AUDIT (> 2 ans) ---
        cursor.execute("DELETE FROM c_issue_audit_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '2 years'")
        deleted_logs = cursor.rowcount

        # --- 3. NETTOYAGE DES TICKETS FERMÉS (> 6 mois) ---
        cursor.execute("SELECT id_issue FROM c_issue WHERE status = 'CLOSED' AND changed_on < CURRENT_TIMESTAMP - INTERVAL '6 months'")
        closed_issues = [row[0] for row in cursor.fetchall()]
        deleted_closed_count = len(closed_issues)

        if deleted_closed_count > 0:
            for c_id in closed_issues:
                delete_gcs_folder(c_id)

            c_format = ','.join(['%s'] * deleted_closed_count)
            c_tuple = tuple(closed_issues)
            
            cursor.execute(f"DELETE FROM c_issue_attachment WHERE id_issue IN ({c_format})", c_tuple)
            cursor.execute(f"DELETE FROM c_issue_comments WHERE id_issue IN ({c_format})", c_tuple)
            cursor.execute(f"DELETE FROM c_issue WHERE id_issue IN ({c_format})", c_tuple)

        connection.commit()
        
        return {
            "message": "success.system_cleanup_completed", 
            "details": {
                "deleted_pretickets": deleted_pretickets_count,
                "deleted_audit_logs": deleted_logs,
                "deleted_closed_issues": deleted_closed_count
            }
        }, 200
        
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE/STORAGE ERROR - system_cleanup]: {str(e)}")
        return {"error": "error.cleanup_failed", "details": "An internal error occurred during the cleanup process."}, 500
    finally:
        cursor.close()
        connection.close()