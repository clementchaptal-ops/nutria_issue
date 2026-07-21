import os
import uuid
import logging
from google.cloud import storage

# Database configuration import
from config.database import get_db_connection

# Local module imports
from .audit import log_user_action

logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "True") == "True"
BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")


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


def upload_to_gcs(file_bytes: bytes, filename: str, issue_id) -> dict:
    """
    Uploads file bytes directly to the Google Cloud Storage bucket.
    This is ALWAYS used, regardless of USE_MOCK_DATA, because Cloud Run has no persistent disk.
    """
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        unique_prefix = uuid.uuid4().hex[:8]
        blob_path = f"tickets/ticket_{issue_id}/{unique_prefix}_{filename}"

        blob = bucket.blob(blob_path)
        blob.upload_from_string(file_bytes)

        gs_uri = f"gs://{BUCKET_NAME}/{blob_path}"
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"

        logger.info(f"=== GCS UPLOAD SUCCESS === Saved at: {gs_uri}")

        return {
            "blob_path": blob_path,
            "gs_uri": gs_uri,
            "public_url": public_url
        }
    except Exception as e:
        logger.error(f"=== GCS UPLOAD ERROR === {str(e)}")
        raise e


# =====================================================================
# ROUTES MÉTIER
# =====================================================================

def upload_attachments(issue_id, files_data, current_user, client_ip):
    uploaded_files_info = []
    file_names_list = []
    username = current_user.get("sub", "UNKNOWN")

    try:
        # 1. ALWAYS UPLOAD TO GOOGLE CLOUD STORAGE FIRST
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            file_names_list.append(filename)

            # Upload to GCS
            gcs_info = upload_to_gcs(file_bytes, filename, issue_id)
            attach_type = get_oracle_attachment_type(content_type, filename)

            uploaded_files_info.append({
                "original_name": filename,
                "type": attach_type,
                "url_path": gcs_info["public_url"],  # We save the GCS URL, not a local path
                "gs_uri": gcs_info["gs_uri"] 
            })

        files_count = len(file_names_list)
        files_str = ", ".join([f"'{name}'" for name in file_names_list])
        audit_details = f"Uploaded {files_count} attachment(s) to GCS. File list: [{files_str}]."

        # 2. SAVE METADATA (Mock vs Oracle)
        if USE_MOCK_DATA:
            logger.info(f"=== MOCK MODE === Skipping Oracle DB insert for attachments")
            
            log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)
            
            return {
                "message": "Attachments uploaded to GCS (Mock DB).",
                "bucket": BUCKET_NAME,
                "files": uploaded_files_info
            }, 200

        else:
            logger.info(f"=== PRODUCTION MODE === Saving GCS URLs to Oracle DB")
            connection = get_db_connection()
            if not connection:
                return {"error": "Oracle Database connection error."}, 500
                
            cursor = connection.cursor()

            try:
                for file_data in uploaded_files_info:
                    qry = """
                        INSERT INTO c_issue_attachment (
                            id_issue, attachment_name, attachment_type, url_path
                        ) VALUES (:1, :2, :3, :4)
                    """
                    # We save the Google Cloud Storage URL directly in Oracle
                    cursor.execute(qry, [issue_id, file_data["original_name"], file_data["type"], file_data["url_path"]])

                connection.commit()
                
                log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)

                return {
                    "message": "Attachments uploaded to GCS and saved in Oracle.",
                    "bucket": BUCKET_NAME,
                    "files": uploaded_files_info
                }, 200

            except Exception as e:
                connection.rollback()
                raise e
            finally:
                cursor.close()
                connection.close()

    except Exception as e:
        return {"error": f"Upload process error: {str(e)}"}, 500


def get_attachment_file(issue_id, filename):
    # Files are always on GCS now, just return the public URL
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/tickets/ticket_{issue_id}/{filename}"
    return {"public_url": public_url}, 200


def delete_attachment(issue_id, filename, current_user, client_ip):
    # Only the database soft-delete changes between Mock and Oracle. 
    # In a real scenario, you might also delete the blob from GCS here using `blob.delete()`
    username = current_user.get("sub", "UNKNOWN")

    if USE_MOCK_DATA:
        logger.info(f"=== MOCK MODE === Mocking soft-delete for {filename}")
        return {"message": "Attachment removed (Mock)."}, 200

    else:
        connection = get_db_connection()
        if not connection:
            return {"error": "Oracle Database connection error."}, 500

        try:
            cursor = connection.cursor()
            soft_delete_qry = """
                UPDATE c_issue_attachment 
                SET removed = 'T'
                WHERE id_issue = :1 AND url_path LIKE :2
            """
            cursor.execute(soft_delete_qry, [issue_id, f"%{filename}%"])
            connection.commit()
            
            return {"message": "Attachment flagged as removed in Oracle."}, 200
        except Exception as e:
            connection.rollback()
            return {"error": str(e)}, 500
        finally:
            cursor.close()
            connection.close()