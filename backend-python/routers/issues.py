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
    except Exception:
        # Exception caught silently to avoid log pollution, returning fallback URL
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
        base_qry = """
            SELECT i.id_issue, i.title, i.issue_type, i.status, i.user_name,
                   u.full_name, u.location, TO_CHAR(i.created_on, 'YYYY-MM-DD HH24:MI') as c_date,
                   i.criticity
            FROM c_issue i
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
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
                "criticity": row[8] if row[8] else "N/A"
            })
        return tickets, 200
    except Exception as e:
        return {"error": "error.database_query", "details": str(e)}, 500
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
    finally:
        cursor.close()
        connection.close()


def create_issue(request_json, current_user, client_ip):
    """Creates a new manual ticket through the web platform and routes it straight to 'IN PROGRESS'."""
    try:
        ticket = TicketCreate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    username = current_user.get("sub") 
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        # PostgreSQL: RETURNING id_issue and %s variables (CURRENT_TIMESTAMP replaces SYSDATE)
        insert_qry = """
            INSERT INTO c_issue (title, issue_type, criticity, frequency, description, status, user_name, created_on, changed_on) 
            VALUES (%s, %s, %s, %s, %s, 'IN PROGRESS', %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
            RETURNING id_issue
        """
        cursor.execute(insert_qry, (ticket.title, ticket.issue_type, ticket.criticity, ticket.frequency, ticket.description, username))
        
        # Retrieve generated primary key
        next_id = cursor.fetchone()[0]
        connection.commit()

        log_user_action(user_name=username, action_type="CREATE_TICKET", target_id=str(next_id), details=f"Manual web creation. Title: '{ticket.title}'", ip_address=client_ip)
        
        return {"id_issue": next_id, "message": "success.ticket_created"}, 201
    except Exception as e:
        connection.rollback()
        return {"error": "error.database_query", "details": str(e)}, 500
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
        
        qry = """
            SELECT i.id_issue, i.title, i.issue_type, i.description, i.user_name, i.ip_adress,
                   i.ip_config, i.ping, i.status, i.citrix_session, i.current_pc, i.frequency,
                   i.blocking_issue, i.criticity, i.sspticket, i.workstation, i.working_dir,
                   i.current_active_role, i.current_project, i.current_batch, i.current_sample,
                   i.current_analysis, i.current_analysis_variation, i.current_customer,
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
        return {"error": "error.database_query", "details": str(e)}, 500
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
        return {"error": "error.database_query", "details": str(e)}, 500
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
        return {"error": "error.database_query", "details": str(e)}, 500
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
        return {"error": "error.storage_upload", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()


def validate_issue(issue_id, request_json, current_user, client_ip):
    """Validates data alterations and updates an issue payload to 'IN PROGRESS' status."""
    try:
        ticket = TicketUpdate(**request_json)
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
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            return {"error": "error.issue_not_found"}, 404
            
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            return {"error": "error.forbidden_access"}, 403
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            return {"error": "error.forbidden_access"}, 403

        # PostgreSQL update query
        update_qry = """
            UPDATE c_issue 
            SET title = %s, issue_type = %s, criticity = %s, frequency = %s, 
                blocking_issue = %s, description = %s, sspticket = %s,
                current_project = %s, current_batch = %s, current_sample = %s,
                current_analysis = %s, current_analysis_variation = %s,
                current_customer = %s, status = 'IN PROGRESS', 
                changed_on = CURRENT_TIMESTAMP, changed_by = %s
            WHERE id_issue = %s AND status NOT IN ('CANCELED', 'CLOSED')
        """
        cursor.execute(update_qry, (
            ticket.title, ticket.issue_type, ticket.criticity, ticket.frequency, 
            ticket.blocking_issue, ticket.description, ticket.sspticket,
            ticket.current_project, ticket.current_batch, ticket.current_sample,
            ticket.current_analysis, ticket.current_analysis_variation,
            ticket.current_customer, username, issue_id
        ))
        connection.commit()
        
        if cursor.rowcount == 0:
            return {"error": "error.unable_to_modify_ticket"}, 400

        log_user_action(user_name=username, action_type="UPDATE_TICKET", target_id=str(issue_id), details=f"Ticket updated/validated. New title: '{ticket.title}'", ip_address=client_ip)
            
        return {"message": "success.issue_validated"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.database_query", "details": str(e)}, 500
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
        return {"error": "error.database_query", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()


def download_file_path(ticket_id, file_type, current_user, client_ip):
    """
    On GCP, files are in Cloud Storage, not on the local disk.
    This route redirects to the GCS URL using the Storage API.
    """
    if file_type == "working_dir":
        file_name = f"Issue_{ticket_id}_WorkingDir.zip"
        action_type = "DOWNLOAD_WORKING_DIR"
        details = "Downloaded contextual Working Directory."
    elif file_type == "logs":
        file_name = f"Issue_{ticket_id}_Logs.zip"
        action_type = "DOWNLOAD_LOGS"
        details = "Downloaded system Logs files."
    else:
        return {"error": "error.invalid_file_type"}, 400

    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/tickets/ticket_{ticket_id}/{file_name}"
    
    # Sign this URL to allow secure downloading
    signed_url = make_signed_url(public_url)
    
    log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=ticket_id, details=details, ip_address=client_ip)
    
    return {"file_path": signed_url, "file_name": file_name}, 200


def close_ticket(issue_id, request_json, current_user, client_ip):
    """Transitions the resolution status lifecycle parameters to 'RESOLVED' or 'CLOSED'."""
    try:
        payload = StatusUpdate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    valid_statuses = ["CLOSED", "RESOLVED"]
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

        action_type = "RESOLVE_TICKET" if payload.new_status == "RESOLVED" else "CLOSE_TICKET"
        log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=str(issue_id), details=f"Status modification validated: {payload.new_status}", ip_address=client_ip)

        return {"message": "success.ticket_status_updated", "new_status": payload.new_status}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.database_query", "details": str(e)}, 500
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

def cleanup_pretickets():
    """
    Deletes tickets with 'PRETICKET' status that are older than 1 hour.
    Intended to be triggered automatically by Google Cloud Scheduler.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        # PostgreSQL syntax: CURRENT_TIMESTAMP - INTERVAL '1 hour'
        qry = """
            DELETE FROM c_issue 
            WHERE status = 'PRETICKET' 
            AND created_on < CURRENT_TIMESTAMP - INTERVAL '1 hour'
        """
        cursor.execute(qry)
        deleted_count = cursor.rowcount
        
        connection.commit()
        
        return {
            "message": "success.cleanup_completed", 
            "deleted_tickets": deleted_count
        }, 200
        
    except Exception as e:
        connection.rollback()
        return {"error": "error.database_query", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()