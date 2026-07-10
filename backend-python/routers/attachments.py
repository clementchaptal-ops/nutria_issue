import os
import uuid
import logging

# Database configuration import
from config.database import get_db_connection

# Local module imports
from .audit import log_user_action

logger = logging.getLogger(__name__)

# Local storage folder
UPLOAD_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "stored_attachments"))

def get_oracle_attachment_type(content_type: str, filename: str) -> str:
    content_type = content_type.lower()
    if content_type.startswith('image/'):
        return 'IMAGE'
    elif content_type.startswith('video/'):
        return 'VIDEO'
    elif 'zip' in content_type or filename.lower().endswith('.zip'):
        return 'ZIP'
    else:
        return 'DOCUMENT'

# =====================================================================
# ROUTES MÉTIER
# =====================================================================

def upload_attachments(issue_id, files_data, current_user, client_ip):
    """
    files_data doit être une liste de dictionnaires fournis par Flask (main.py) :
    [{"filename": "...", "content_type": "...", "bytes": b"..."}]
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
    
    ticket_folder = os.path.join(UPLOAD_DIR, f"ticket_{issue_id}.0")
    os.makedirs(ticket_folder, exist_ok=True)
    
    uploaded_files_info = []
    file_names_list = []
    cursor = connection.cursor()
    
    try:
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            unique_prefix = uuid.uuid4().hex[:8]
            safe_file_name = f"{unique_prefix}_{filename}"
            file_destination_path = os.path.join(ticket_folder, safe_file_name)
            
            # Store the raw original filename for the audit string
            file_names_list.append(filename)
            
            with open(file_destination_path, "wb") as buffer:
                buffer.write(file_bytes)
            
            attach_type = get_oracle_attachment_type(content_type, filename)
            
            qry = """
                INSERT INTO c_issue_attachment (
                    id_issue, attachment_name, attachment_type, url_path
                ) VALUES (:1, :2, :3, :4)
            """
            cursor.execute(qry, [issue_id, filename, attach_type, file_destination_path])
            
            uploaded_files_info.append({
                "original_name": filename,
                "type": attach_type,
                "saved_path": file_destination_path
            })
        
        # Commit the database rows for all metadata rows added
        connection.commit()
        
        # AUDIT TRAIL RECORDING
        username = current_user.get("sub", "UNKNOWN")
        files_count = len(file_names_list)
        files_str = ", ".join([f"'{name}'" for name in file_names_list])
        
        audit_details = f"Uploaded {files_count} attachment(s). File list: [{files_str}]."
        log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)
        
        return {
            "message": "Attachments successfully uploaded.", 
            "server_upload_directory": UPLOAD_DIR,
            "files": uploaded_files_info
        }, 200
    except Exception as e:
        connection.rollback()
        return {"error": f"Upload error: {str(e)}"}, 500
    finally:
        cursor.close()
        connection.close()


def get_attachment_file(issue_id, filename):
    """
    Returns the absolute path of the attachment so main.py can stream it to the browser.
    """
    ticket_folder = os.path.join(UPLOAD_DIR, f"ticket_{issue_id}.0")
    file_path = os.path.join(ticket_folder, filename)
    
    # Check if the requested file actually exists on the disk
    if not os.path.exists(file_path):
        return {"error": "Attachment file not found on server."}, 404
        
    # On renvoie le chemin au main.py, qui utilisera send_file() de Flask
    return {"file_path": file_path}, 200


def delete_attachment(issue_id, filename, current_user, client_ip):
    """Performs a Soft Delete on a specific attachment from the database."""
    connection = get_db_connection()
    if not connection:
        return {"error": "Oracle Database connection error."}, 500
        
    ticket_folder = os.path.join(UPLOAD_DIR, f"ticket_{issue_id}.0")
    file_path = os.path.join(ticket_folder, filename)
    
    try:
        cursor = connection.cursor()
        
        # 1. Soft Delete in Database (Flagging as removed='T')
        soft_delete_qry = """
            UPDATE c_issue_attachment 
            SET removed = 'T'
            WHERE id_issue = :1 AND url_path LIKE :2
        """
        cursor.execute(soft_delete_qry, [issue_id, f"%{filename}%"])
        connection.commit()
        
        # 2. Remove from actual Server Disk
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            logger.warning(f"File {filename} was already missing from physical disk storage.")
            
        # 3. AUDIT TRAIL RECORDING
        username = current_user.get("sub", "UNKNOWN")
        log_user_action(user_name=username, action_type="DELETE_ATTACHMENT", target_id=str(issue_id), details=f"Soft deleted attachment file: '{filename}'.", ip_address=client_ip)
            
        return {"message": "Attachment successfully flagged as removed."}, 200
        
    except Exception as e:
        connection.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        connection.close()