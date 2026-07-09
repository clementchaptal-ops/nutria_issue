import os
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import FileResponse
from typing import List, Optional
# Database configuration import
from config.database import get_db_connection

# Local module imports from your flat routers/ file hierarchy
from .security import get_current_user
from .audit import log_user_action

logger = logging.getLogger(__name__)

# Dedicated sub-router for handling file attachments
# The prefix ensures we don't have to repeat "/api/issues" for every route
router = APIRouter(
    prefix="/api/issues",
    tags=["Attachments"]
)

# Local storage folder (Mock S3 location)
# Moving up one directory (..) since this file resides inside the 'routers' folder
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

# The dynamic route maps directly to "/{issue_id}/attachments" due to the router prefix
@router.post("/{issue_id}/attachments")
def upload_attachments(
    issue_id: int, 
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
    
    ticket_folder = os.path.join(UPLOAD_DIR, f"ticket_{issue_id}.0")
    os.makedirs(ticket_folder, exist_ok=True)
    
    uploaded_files_info = []
    file_names_list = []
    cursor = connection.cursor()
    
    try:
        for file in files:
            unique_prefix = uuid.uuid4().hex[:8]
            safe_file_name = f"{unique_prefix}_{file.filename}"
            file_destination_path = os.path.join(ticket_folder, safe_file_name)
            
            # Store the raw original filename for the audit string
            file_names_list.append(file.filename)
            
            file.file.seek(0)
            # Streaming the file upload block by block to preserve server memory
            with open(file_destination_path, "wb") as buffer:
                while chunk := file.file.read(1024 * 1024):
                    buffer.write(chunk)
            
            attach_type = get_oracle_attachment_type(file.content_type, file.filename)
            
            qry = """
                INSERT INTO c_issue_attachment (
                    id_issue, 
                    attachment_name, 
                    attachment_type, 
                    url_path
                ) VALUES (:1, :2, :3, :4)
            """
            
            cursor.execute(qry, [issue_id, file.filename, attach_type, file_destination_path])
            
            uploaded_files_info.append({
                "original_name": file.filename,
                "type": attach_type,
                "saved_path": file_destination_path
            })
        
        # Commit the database rows for all metadata rows added
        connection.commit()
        
        # AUDIT TRAIL RECORDING (Placed safely outside the loop payload lifecycle)
        username = current_user.get("sub", "UNKNOWN")
        files_count = len(file_names_list)
        files_str = ", ".join([f"'{name}'" for name in file_names_list])
        
        audit_details = f"Uploaded {files_count} attachment(s). File list: [{files_str}]."
        client_ip = request.client.host if request.client else "Unknown"
        
        log_user_action(
            user_name=username,
            action_type="UPLOAD_ATTACHMENTS",
            target_id=str(issue_id),
            details=audit_details,
            ip_address=client_ip
        )
        
        return {
            "message": "Attachments successfully uploaded.", 
            "server_upload_directory": UPLOAD_DIR,
            "files": uploaded_files_info
        }
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


# =====================================================================
# 🚨 NEW ROUTE: SERVE / STREAM ATTACHMENTS DIRECTLY TO BROWSER
# =====================================================================
@router.get("/{issue_id}/attachments/{filename}")
def get_attachment_file(
    issue_id: int, 
    filename: str, 
    token: Optional[str] = None, 
    request: Request = None
):
    """
    Serves a specific attachment file directly to the browser.
    Maintains folder format consistency using 'ticket_{issue_id}.0'.
    """
    ticket_folder = os.path.join(UPLOAD_DIR, f"ticket_{issue_id}.0")
    file_path = os.path.join(ticket_folder, filename)
    
    # Check if the requested file actually exists on the disk
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Attachment file not found on server.")
        
    # FileResponse automatically handles media types (images, video streams, etc.)
    # and allows inline viewing without forcing a download prompt.
    return FileResponse(path=file_path)

@router.delete("/{issue_id}/attachments/{filename}")
def delete_attachment(
    issue_id: int, 
    filename: str, 
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Performs a Soft Delete on a specific attachment from the database."""
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Oracle Database connection error.")
        
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
        
        # 2. Remove from actual Server Disk (Safe check to avoid missing file errors)
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            logger.warning(f"File {filename} was already missing from physical disk storage.")
            
        # 3. AUDIT TRAIL RECORDING
        client_ip = request.client.host if request.client else "Unknown"
        username = current_user.get("sub", "UNKNOWN")
        
        log_user_action(
            user_name=username,
            action_type="DELETE_ATTACHMENT",
            target_id=str(issue_id),
            details=f"Soft deleted attachment file: '{filename}'.",
            ip_address=client_ip
        )
            
        return {"message": "Attachment successfully flagged as removed."}
        
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()