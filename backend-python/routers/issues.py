import os
import uuid
from config.database import get_db_connection
from pydantic import ValidationError

# --- LOCAL FILE IMPORTS ---
from .schemas import TicketCreate, TicketUpdate, StatusUpdate
from .audit import log_user_action

# =====================================================================
# 1. ROUTES STATIQUES
# =====================================================================

def get_all_issues(current_user):
    """Fetches all tickets from the database, filtering them based on the user's role and site location code prefix."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")

    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
        
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

            qry = base_qry + """
                WHERE TRIM(UPPER(u.location)) LIKE TRIM(UPPER(:1)) || '%' 
                ORDER BY i.id_issue DESC
            """
            cursor.execute(qry, [site_root])
            
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
        return {"error": f"Oracle Error: {str(e)}"}, 500
    finally:
        cursor.close()
        connection.close()

def get_my_profile(current_user):
    """Fetches true LIMS user profile details for the currently logged-in account."""
    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500
        
    try:
        cursor = connection.cursor()
        username = current_user.get("sub")
        
        qry = """
            SELECT user_name, full_name, email_addr, user_role, lab, location
            FROM lims_users
            WHERE TRIM(UPPER(user_name)) = TRIM(UPPER(:1))
        """
        cursor.execute(qry, [username])
        row = cursor.fetchone()
        
        if not row:
            return {"error": "LIMS user account not found."}, 404
            
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
        # Validation Pydantic manuelle
        ticket = TicketCreate(**request_json)
    except ValidationError as e:
        return {"error": "Format des donnees invalide", "details": e.errors()}, 400

    username = current_user.get("sub") 
    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
        
    try:
        cursor = connection.cursor()
        insert_qry = """
            INSERT INTO c_issue (title, issue_type, criticity, frequency, description, status, user_name, created_on, changed_on) 
            VALUES (:1, :2, :3, :4, :5, 'IN PROGRESS', :6, SYSDATE, SYSDATE) RETURNING id_issue INTO :7
        """
        new_id_var = cursor.var(int)
        cursor.execute(insert_qry, [ticket.title, ticket.issue_type, ticket.criticity, ticket.frequency, ticket.description, username, new_id_var])
        connection.commit()
        next_id = new_id_var.getvalue()[0]

        # Remplacement de BackgroundTasks par un appel direct (synchrone et très rapide)
        log_user_action(user_name=username, action_type="CREATE_TICKET", target_id=str(next_id), details=f"Manual web creation. Title: '{ticket.title}'", ip_address=client_ip)
        
        return {"id_issue": next_id, "message": "Ticket successfully created."}, 201
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()

# =====================================================================
# 2. ROUTES DYNAMIQUES
# =====================================================================

def get_issue(issue_id, current_user):
    """Fetches detailed technical data and contextual information, including its attachments."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
    
    try:
        cursor = connection.cursor()
        
        qry = """
            SELECT i.id_issue, i.title, i.issue_type, i.description, i.user_name, i.ip_adress,
                   i.ip_config, i.ping, i.status, i.citrix_session, i.current_pc, i.frequency,
                   i.blocking_issue, i.criticity, i.sspticket, i.workstation, i.working_dir,
                   i.current_role, i.current_project, i.current_batch, i.current_sample,
                   i.current_analysis, i.current_analysis_variation, i.current_customer,
                   u.location as creator_location, u.full_name, u.lab as creator_lab, u.email_addr as user_email,
                   TO_CHAR(i.created_on, 'YYYY-MM-DD HH24:MI:SS') as created_on
            FROM c_issue i
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
            WHERE i.id_issue = :1
        """
        cursor.execute(qry, [issue_id])
        columns = [col[0].lower() for col in cursor.description]
        row = cursor.fetchone()
        
        if not row:
            return {"error": "Issue not found."}, 404
            
        issue_data = dict(zip(columns, row))
        
        ticket_location = issue_data.get("creator_location")
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_location).strip().upper() if ticket_location else "NONE"

        if user_role != "IT_TEAM" and safe_ticket_loc != safe_user_loc:
            return {"error": "Access denied."}, 403
            
        attachments_qry = """
            SELECT id_attachment, attachment_name, attachment_type, url_path
            FROM c_issue_attachment
            WHERE id_issue = :1 AND REMOVED = 'F' AND id_comment IS NULL
        """
        cursor.execute(attachments_qry, [issue_id])
        attach_cols = [col[0].lower() for col in cursor.description]
        attach_rows = cursor.fetchall()
        
        attachments_list = [dict(zip(attach_cols, r)) for r in attach_rows]
        issue_data["attachments"] = attachments_list
        
        return issue_data, 200
        
    except Exception as e:
        return {"error": f"Database query error: {str(e)}"}, 500
    finally:
        cursor.close()
        connection.close()

def get_issue_comments(issue_id, current_user):
    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500
        
    try:
        cursor = connection.cursor()
        
        qry = """
            SELECT c.id_comment, c.user_name, u.full_name, c.comment_text, 
                   TO_CHAR(c.created_on, 'YYYY-MM-DD HH24:MI') as c_date
            FROM c_issue_comments c
            LEFT JOIN lims_users u ON TRIM(UPPER(c.user_name)) = TRIM(UPPER(u.user_name))
            WHERE c.id_issue = :1
            ORDER BY c.created_on ASC
        """
        cursor.execute(qry, [issue_id])
        
        comments_dict = {}
        comments_list = []
        
        for row in cursor.fetchall():
            raw_text = row[3]
            comment_str = raw_text.read() if hasattr(raw_text, 'read') else raw_text
            
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
                WHERE id_issue = :1 AND id_comment IS NOT NULL AND removed = 'F'
            """
            cursor.execute(attach_qry, [issue_id])
            for att_row in cursor.fetchall():
                att_c_id = att_row[0]
                if att_c_id in comments_dict:
                    comments_dict[att_c_id]["attachments"].append({
                        "attachment_name": att_row[1],
                        "attachment_type": att_row[2],
                        "url_path": att_row[3]
                    })
                    
        return comments_list, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()
        
def add_issue_comment(issue_id, payload_data, current_user, client_ip):
    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500
        
    username = current_user.get("sub", "UNKNOWN")
    comment_text = payload_data.get("comment_text", "")
    
    try:
        cursor = connection.cursor()
        
        qry = """
            INSERT INTO c_issue_comments (id_issue, user_name, comment_text)
            VALUES (:1, :2, :3) RETURNING id_comment INTO :4
        """
        new_id_var = cursor.var(int)
        cursor.execute(qry, [issue_id, username, comment_text, new_id_var])
        connection.commit()
        
        new_comment_id = new_id_var.getvalue()[0]
        
        preview = comment_text[:50] + "..." if len(comment_text) > 50 else comment_text
        log_user_action(
            user_name=username, action_type="ADD_COMMENT", target_id=str(issue_id),
            details=f"Added a comment: '{preview}'", ip_address=client_ip
        )
        
        return {"id_comment": new_comment_id, "message": "Comment successfully added."}, 201
        
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()

def get_oracle_attachment_type(content_type: str, filename: str) -> str:
    content_type = content_type.lower()
    if content_type.startswith('image/'): return 'IMAGE'
    elif content_type.startswith('video/'): return 'VIDEO'
    elif 'zip' in content_type or filename.lower().endswith('.zip'): return 'ZIP'
    else: return 'DOCUMENT'

def upload_comment_attachments(issue_id, comment_id, files_data, current_user):
    """Note: files_data doit être une liste de tuples (filename, content_type, file_content_bytes) fournis par Flask"""
    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500
        
    folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "stored_attachments", f"ticket_{issue_id}.0"))
    os.makedirs(folder_path, exist_ok=True)
    
    cursor = connection.cursor()
    try:
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            unique_prefix = uuid.uuid4().hex[:8]
            safe_file_name = f"com_{unique_prefix}_{filename}"
            file_destination_path = os.path.join(folder_path, safe_file_name)
            
            with open(file_destination_path, "wb") as buffer:
                buffer.write(file_bytes)
            
            attach_type = get_oracle_attachment_type(content_type, filename)
            
            qry = """
                INSERT INTO c_issue_attachment (id_issue, id_comment, attachment_name, attachment_type, url_path) 
                VALUES (:1, :2, :3, :4, :5)
            """
            cursor.execute(qry, [issue_id, comment_id, filename, attach_type, file_destination_path])
            
        connection.commit()
        return {"message": "Comment attachments uploaded."}, 200
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()

def validate_issue(issue_id, request_json, current_user, client_ip):
    """Validates data alterations and updates an issue payload to 'IN PROGRESS' status."""
    try:
        ticket = TicketUpdate(**request_json)
    except ValidationError as e:
        return {"error": "Donnees invalides", "details": e.errors()}, 400

    user_email = current_user.get("email")
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    username = current_user.get("sub", "UNKNOWN")

    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = :1"
        cursor.execute(check_qry, [issue_id])
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            return {"error": "Issue not found."}, 404
            
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            return {"error": "Forbidden."}, 403
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            return {"error": "Forbidden."}, 403

        update_qry = """
            UPDATE c_issue 
            SET title = :1, issue_type = :2, criticity = :3, frequency = :4, 
                blocking_issue = :5, description = :6, sspticket = :7,
                current_project = :8, current_batch = :9, current_sample = :10,
                current_analysis = :11, current_analysis_variation = :12,
                current_customer = :13, status = 'IN PROGRESS', 
                changed_on = SYSDATE, changed_by = :14
            WHERE id_issue = :15 AND status NOT IN ('CANCELED', 'CLOSED')
        """
        cursor.execute(update_qry, [
            ticket.title, ticket.issue_type, ticket.criticity, ticket.frequency, 
            ticket.blocking_issue, ticket.description, ticket.sspticket,
            ticket.current_project, ticket.current_batch, ticket.current_sample,
            ticket.current_analysis, ticket.current_analysis_variation,
            ticket.current_customer, username, issue_id
        ])
        connection.commit()
        
        if cursor.rowcount == 0:
            return {"error": "Unable to modify this specific ticket."}, 400

        log_user_action(user_name=username, action_type="UPDATE_TICKET", target_id=str(issue_id), details=f"Ticket updated/validated. New title: '{ticket.title}'", ip_address=client_ip)
            
        return {"message": "Issue validated successfully."}, 200
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
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
        return {"error": "Oracle Database connection error."}, 500
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = :1"
        cursor.execute(check_qry, [issue_id])
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            return {"error": "Issue not found."}, 404
            
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            return {"error": "You can only cancel your own tickets."}, 403
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            return {"error": "This ticket falls outside your local jurisdiction."}, 403

        cursor.execute("UPDATE c_issue SET status = 'CANCELED', changed_on = SYSDATE WHERE id_issue = :1", [issue_id])
        connection.commit()

        log_user_action(user_name=username, action_type="CANCEL_TICKET", target_id=str(issue_id), details="Ticket canceled by user.", ip_address=client_ip)
        return {"message": "Ticket successfully canceled."}, 200
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()

def download_file_path(ticket_id, file_type, current_user, client_ip):
    """Returns the absolute path of the requested file (logs or working_dir) so main.py can send it."""
    folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "stored_attachments", f"ticket_{ticket_id}.0"))
    
    if file_type == "working_dir":
        file_name = f"Issue_{ticket_id}_WorkingDir.zip"
        action_type = "DOWNLOAD_WORKING_DIR"
        details = "Downloaded contextual Working Directory."
    elif file_type == "logs":
        file_name = f"Issue_{ticket_id}_Logs.zip"
        action_type = "DOWNLOAD_LOGS"
        details = "Downloaded system Logs files."
    else:
        return {"error": "Type de fichier invalide."}, 400

    file_path = os.path.join(folder_path, file_name) 
    
    if not os.path.exists(file_path):
        return {"error": f"File {file_name} not found."}, 404

    log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=ticket_id, details=details, ip_address=client_ip)
    
    return {"file_path": file_path, "file_name": file_name}, 200

def close_ticket(issue_id, request_json, current_user, client_ip):
    """Transitions the resolution status lifecycle parameters to 'RESOLVED' or 'CLOSED'."""
    try:
        payload = StatusUpdate(**request_json)
    except ValidationError as e:
        return {"error": "Format invalide", "details": e.errors()}, 400

    valid_statuses = ["CLOSED", "RESOLVED"]
    if payload.new_status not in valid_statuses:
        return {"error": "Invalid status option. Please choose CLOSED or RESOLVED."}, 400

    user_role = current_user.get("role")
    user_trigram = current_user.get("sub", "").lower()

    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT user_name FROM c_issue WHERE id_issue = :1", [issue_id])
        row = cursor.fetchone()
        if not row:
            return {"error": "Ticket not found."}, 404
            
        ticket_owner = row[0].lower() if row[0] else ""
        if user_role not in ["IT_TEAM", "LOCAL_ADMIN"] and user_trigram != ticket_owner:
            return {"error": "You do not possess the required permissions to finalize and close this ticket."}, 403

        cursor.execute("UPDATE c_issue SET status = :1, changed_on = SYSDATE WHERE id_issue = :2", [payload.new_status, issue_id])
        connection.commit()

        action_type = "RESOLVE_TICKET" if payload.new_status == "RESOLVED" else "CLOSE_TICKET"
        log_user_action(user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=str(issue_id), details=f"Status modification validated: {payload.new_status}", ip_address=client_ip)

        return {"message": f"Ticket status successfully set to {payload.new_status}."}, 200
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()