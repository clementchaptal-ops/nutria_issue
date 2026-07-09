from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks, Request, UploadFile, File, Form
import os
from fastapi.responses import FileResponse
from config.database import get_db_connection
from pydantic import BaseModel
from typing import Optional, List
import uuid

# --- LOCAL FILE IMPORTS ---
from .schemas import TicketCreate, TicketUpdate, StatusUpdate
from .security import get_current_user
from .audit import log_user_action, audit_router

# --- ROUTER CONFIGURATION ---
router = APIRouter(
    prefix="/api/issues",
    tags=["Issues"]
)

# Mounting the audit sub-router
router.include_router(audit_router)

# --- PYDANTIC SCHEMAS ---
class CommentCreate(BaseModel):
    comment_text: str

# =====================================================================
# 1. STATIC ROUTES (WITHOUT PATH VARIABLES {ID}) 
# =====================================================================

@router.get("")
def get_all_issues(current_user: dict = Depends(get_current_user)):
    """Fetches all tickets from the database, filtering them based on the user's role and site location code prefix."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
        
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
        return tickets
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

@router.get("/users/me")
def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Fetches true LIMS user profile details for the currently logged-in account."""
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
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
            raise HTTPException(status_code=404, detail="LIMS user account not found.")
            
        return {
            "user_name": row[0], "full_name": row[1], "user_email": row[2],
            "current_role": row[3], "lab": row[4], "location": row[5]
        }
    finally:
        cursor.close()
        connection.close()

@router.post("/create", status_code=status.HTTP_201_CREATED)
def create_issue(ticket: TicketCreate, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Creates a new manual ticket through the web platform and routes it straight to 'IN PROGRESS'."""
    username = current_user.get("sub") 
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
        
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

        client_ip = request.client.host if request.client else "Unknown"
        background_tasks.add_task(log_user_action, user_name=username, action_type="CREATE_TICKET", target_id=str(next_id), details=f"Manual web creation. Title: '{ticket.title}'", ip_address=client_ip)
        
        return {"id_issue": next_id, "message": "Ticket successfully created."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()

# =====================================================================
# 2. DYNAMIC ROUTES (WITH PATH VARIABLES {issue_id})
# =====================================================================

@router.get("/{issue_id}")
def get_issue(issue_id: int, current_user: dict = Depends(get_current_user)):
    """Fetches detailed technical data and contextual information, including its attachments."""
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
    
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
            raise HTTPException(status_code=404, detail="Issue not found.")
            
        issue_data = dict(zip(columns, row))
        
        ticket_location = issue_data.get("creator_location")
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_location).strip().upper() if ticket_location else "NONE"

        if user_role != "IT_TEAM" and safe_ticket_loc != safe_user_loc:
            raise HTTPException(status_code=403, detail="Access denied.")
            
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
        
        return issue_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

@router.get("/{issue_id}/comments")
def get_issue_comments(issue_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
    try:
        cursor = connection.cursor()
        
        # 1. On récupère les commentaires
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
                "attachments": [] # 👈 On prépare une liste vide pour les fichiers
            }
            comments_dict[c_id] = comment_obj
            comments_list.append(comment_obj)
            
        # 2. On récupère TOUTES les pièces jointes liées aux commentaires de ce ticket
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
                    
        return comments_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()
        
@router.post("/{issue_id}/comments")
def add_issue_comment(
    issue_id: int, 
    payload: CommentCreate, 
    request: Request, 
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
    username = current_user.get("sub", "UNKNOWN")
    client_ip = request.client.host if request.client else "Unknown"
    
    try:
        cursor = connection.cursor()
        
        # On utilise RETURNING pour récupérer l'ID du nouveau commentaire
        qry = """
            INSERT INTO c_issue_comments (id_issue, user_name, comment_text)
            VALUES (:1, :2, :3) RETURNING id_comment INTO :4
        """
        new_id_var = cursor.var(int)
        cursor.execute(qry, [issue_id, username, payload.comment_text, new_id_var])
        connection.commit()
        
        new_comment_id = new_id_var.getvalue()[0]
        
        preview = payload.comment_text[:50] + "..." if len(payload.comment_text) > 50 else payload.comment_text
        log_user_action(
            user_name=username, action_type="ADD_COMMENT", target_id=str(issue_id),
            details=f"Added a comment: '{preview}'", ip_address=client_ip
        )
        
        # 👈 On renvoie l'ID au frontend pour qu'il puisse y attacher les fichiers
        return {"id_comment": new_comment_id, "message": "Comment successfully added."}
        
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()

# 🚀 NOUVELLE ROUTE : UPLOAD DE FICHIERS SUR UN COMMENTAIRE
def get_oracle_attachment_type(content_type: str, filename: str) -> str:
    content_type = content_type.lower()
    if content_type.startswith('image/'): return 'IMAGE'
    elif content_type.startswith('video/'): return 'VIDEO'
    elif 'zip' in content_type or filename.lower().endswith('.zip'): return 'ZIP'
    else: return 'DOCUMENT'

@router.post("/{issue_id}/comments/{comment_id}/attachments")
def upload_comment_attachments(
    issue_id: int, 
    comment_id: int,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
    folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "stored_attachments", f"ticket_{issue_id}.0"))
    os.makedirs(folder_path, exist_ok=True)
    
    cursor = connection.cursor()
    try:
        for file in files:
            unique_prefix = uuid.uuid4().hex[:8]
            safe_file_name = f"com_{unique_prefix}_{file.filename}"
            file_destination_path = os.path.join(folder_path, safe_file_name)
            
            file.file.seek(0)
            with open(file_destination_path, "wb") as buffer:
                while chunk := file.file.read(1024 * 1024):
                    buffer.write(chunk)
            
            attach_type = get_oracle_attachment_type(file.content_type, file.filename)
            
            # On insère avec l'id_comment !
            qry = """
                INSERT INTO c_issue_attachment (id_issue, id_comment, attachment_name, attachment_type, url_path) 
                VALUES (:1, :2, :3, :4, :5)
            """
            cursor.execute(qry, [issue_id, comment_id, file.filename, attach_type, file_destination_path])
            
        connection.commit()
        return {"message": "Comment attachments uploaded."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()

@router.put("/{issue_id}/validate")
def validate_issue(issue_id: int, ticket: TicketUpdate, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Validates data alterations and updates an issue payload to 'IN PROGRESS' status."""
    user_email = current_user.get("email")
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    username = current_user.get("sub", "UNKNOWN")

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = :1"
        cursor.execute(check_qry, [issue_id])
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            raise HTTPException(status_code=404, detail="Issue not found.")
            
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            raise HTTPException(status_code=403, detail="Forbidden.")
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            raise HTTPException(status_code=403, detail="Forbidden.")

        update_qry = """
            UPDATE c_issue 
            SET title = :1, 
                issue_type = :2, 
                criticity = :3, 
                frequency = :4, 
                blocking_issue = :5, 
                description = :6, 
                sspticket = :7,
                current_project = :8,
                current_batch = :9,
                current_sample = :10,
                current_analysis = :11,
                current_analysis_variation = :12,
                current_customer = :13,
                status = 'IN PROGRESS', 
                changed_on = SYSDATE, 
                changed_by = :14
            WHERE id_issue = :15 AND status NOT IN ('CANCELED', 'CLOSED')
        """
        cursor.execute(update_qry, [
            ticket.title, 
            ticket.issue_type, 
            ticket.criticity, 
            ticket.frequency, 
            ticket.blocking_issue, 
            ticket.description, 
            ticket.sspticket,
            ticket.current_project,
            ticket.current_batch,
            ticket.current_sample,
            ticket.current_analysis,
            ticket.current_analysis_variation,
            ticket.current_customer,
            username,
            issue_id
        ])
        connection.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=400, detail="Unable to modify this specific ticket.")

        client_ip = request.client.host if request.client else "Unknown"
        background_tasks.add_task(log_user_action, user_name=username, action_type="UPDATE_TICKET", target_id=str(issue_id), details=f"Ticket updated/validated. New title: '{ticket.title}'", ip_address=client_ip)
            
        return {"message": "Issue validated successfully."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()

@router.put("/{issue_id}/cancel")
def cancel_issue(issue_id: int, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Flags a target active ticket with the 'CANCELED' status."""
    user_email = current_user.get("email")
    user_role = current_user.get("role")
    user_location = current_user.get("location")
    username = current_user.get("sub", "UNKNOWN")

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
        
    try:
        cursor = connection.cursor()
        check_qry = "SELECT u.location, u.email_addr FROM c_issue i LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name)) WHERE i.id_issue = :1"
        cursor.execute(check_qry, [issue_id])
        ticket_row = cursor.fetchone()
        
        if not ticket_row:
            raise HTTPException(status_code=404, detail="Issue not found.")
            
        safe_ticket_loc = str(ticket_row[0]).strip().upper() if ticket_row[0] else "NONE"
        safe_ticket_email = str(ticket_row[1]).strip().lower() if ticket_row[1] else "NONE"
        safe_user_email = str(user_email).strip().lower() if user_email else "NONE"
        safe_user_loc = str(user_location).strip().upper() if user_location else "NONE"

        if user_role == "USER" and safe_ticket_email != safe_user_email:
            raise HTTPException(status_code=403, detail="You can only cancel your own tickets.")
        elif user_role == "LOCAL_ADMIN" and safe_ticket_loc != safe_user_loc:
            raise HTTPException(status_code=403, detail="This ticket falls outside your local jurisdiction.")

        cursor.execute("UPDATE c_issue SET status = 'CANCELED', changed_on = SYSDATE WHERE id_issue = :1", [issue_id])
        connection.commit()

        client_ip = request.client.host if request.client else "Unknown"
        background_tasks.add_task(log_user_action, user_name=username, action_type="CANCEL_TICKET", target_id=str(issue_id), details="Ticket canceled by user.", ip_address=client_ip)
        return {"message": "Ticket successfully canceled."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()

@router.get("/{ticket_id}/download/working_dir")
def download_working_dir(ticket_id: str, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Serves the automated LabWare system local working directory setup zip archive."""
    folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "stored_attachments", f"ticket_{ticket_id}.0"))
    file_name = f"Issue_{ticket_id}_WorkingDir.zip"
    file_path = os.path.join(folder_path, file_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File {file_name} not found.")

    client_ip = request.client.host if request.client else "Unknown"
    background_tasks.add_task(log_user_action, user_name=current_user.get("sub", "UNKNOWN"), action_type="DOWNLOAD_WORKING_DIR", target_id=ticket_id, details="Downloaded contextual Working Directory.", ip_address=client_ip)
    return FileResponse(path=file_path, filename=file_name, media_type="application/zip")

@router.get("/{ticket_id}/download/logs")
def download_logs(ticket_id: str, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Serves the system diagnostic environmental log file dump zip archive."""
    folder_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "stored_attachments", f"ticket_{ticket_id}.0"))
    file_name = f"Issue_{ticket_id}_Logs.zip"
    file_path = os.path.join(folder_path, file_name) 
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File {file_name} not found.")

    client_ip = request.client.host if request.client else "Unknown"
    background_tasks.add_task(log_user_action, user_name=current_user.get("sub", "UNKNOWN"), action_type="DOWNLOAD_LOGS", target_id=ticket_id, details="Downloaded system Logs files.", ip_address=client_ip)
    return FileResponse(path=file_path, filename=file_name, media_type="application/zip")

@router.put("/{issue_id}/close")
def close_ticket(issue_id: int, payload: StatusUpdate, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Transitions the resolution status lifecycle parameters to 'RESOLVED' or 'CLOSED'."""
    valid_statuses = ["CLOSED", "RESOLVED"]
    if payload.new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status option. Please choose CLOSED or RESOLVED.")

    user_role = current_user.get("role")
    user_trigram = current_user.get("sub", "").lower()

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT user_name FROM c_issue WHERE id_issue = :1", [issue_id])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found.")
            
        ticket_owner = row[0].lower() if row[0] else ""
        if user_role not in ["IT_TEAM", "LOCAL_ADMIN"] and user_trigram != ticket_owner:
            raise HTTPException(status_code=403, detail="You do not possess the required permissions to finalize and close this ticket.")

        cursor.execute("UPDATE c_issue SET status = :1, changed_on = SYSDATE WHERE id_issue = :2", [payload.new_status, issue_id])
        connection.commit()

        client_ip = request.client.host if request.client else "Unknown"
        action_type = "RESOLVE_TICKET" if payload.new_status == "RESOLVED" else "CLOSE_TICKET"
        background_tasks.add_task(log_user_action, user_name=current_user.get("sub", "UNKNOWN"), action_type=action_type, target_id=str(issue_id), details=f"Status modification validated: {payload.new_status}", ip_address=client_ip)

        return {"message": f"Ticket status successfully set to {payload.new_status}."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()