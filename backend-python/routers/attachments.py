import os
import threading
from config.database import get_db_connection
from .audit import log_user_action

from config.storage import upload_to_gcs, get_oracle_attachment_type, BUCKET_NAME
from services.state_manager import trigger_state_json_update

USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "True") == "True"

def upload_attachments(issue_id, files_data, current_user, client_ip):
    """
    Uploads multiple file attachments associated with a specific issue to Google Cloud Storage.

    Saves attachment metadata to the database and, if mock mode is disabled, 
    spawns an asynchronous background thread to analyze the documents using an AI extractor.

    Args:
        issue_id (int/str): The ID of the issue the attachments belong to.
        files_data (list): A list of dictionaries, each containing 'filename', 'content_type', and 'bytes'.
        current_user (dict): Context of the authenticated user.
        client_ip (str): The IP address of the client performing the action.

    Returns:
        tuple: A dictionary response payload and an HTTP status code integer.
    """
    uploaded_files_info = []
    file_names_list = []
    username = current_user.get("sub", "UNKNOWN")

    try:
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            file_names_list.append(filename)

            # Upload the file to GCS bucket and retrieve URI/URL details
            gcs_info = upload_to_gcs(file_bytes, filename, issue_id)
            attach_type = get_oracle_attachment_type(content_type, filename)

            uploaded_files_info.append({
                "original_name": filename,
                "type": attach_type,
                "url_path": gcs_info["public_url"], 
                "gs_uri": gcs_info["gs_uri"] 
            })

        files_count = len(file_names_list)
        files_str = ", ".join([f"'{name}'" for name in file_names_list])
        audit_details = f"Uploaded {files_count} attachment(s) to GCS. File list: [{files_str}]."

        if USE_MOCK_DATA:
            log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)
            return {"message": "success.attachments_uploaded_mock", "bucket": BUCKET_NAME, "files": uploaded_files_info}, 202

        else:
            connection = get_db_connection()
            if not connection: return {"error": "error.database_connection"}, 500
                
            cursor = connection.cursor()

            try:
                # Insert metadata record for each successfully uploaded file
                for file_data in uploaded_files_info:
                    qry = "INSERT INTO c_issue_attachment (id_issue, attachment_name, attachment_type, url_path) VALUES (%s, %s, %s, %s)"
                    cursor.execute(qry, (issue_id, file_data["original_name"], file_data["type"], file_data["url_path"]))

                connection.commit()
                log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)

                # Process document analysis asynchronously via background thread
                def run_ai_in_background(target_issue_id):
                    try:
                        from services.ai_extractor import analyze_issue_attachments_and_save
                        print(f"[ASYNC AI] Starting analysis for issue #{target_issue_id}...")
                        analyze_issue_attachments_and_save(target_issue_id)
                    except Exception as ai_error:
                        print(f"[WARNING] AI Background Analysis failed: {ai_error}")

                ai_thread = threading.Thread(target=run_ai_in_background, args=(issue_id,))
                ai_thread.daemon = True
                ai_thread.start()

                return {"message": "success.attachments_uploaded_processing_ai", "bucket": BUCKET_NAME, "files": uploaded_files_info}, 202

            except Exception as e:
                connection.rollback()
                raise e
            finally:
                cursor.close()
                connection.close()

    except Exception as e:
        print(f"[DATABASE/STORAGE ERROR - upload_attachments]: {str(e)}")
        return {"error": "error.storage_upload", "details": "error.internal_upload_process"}, 500

def get_attachment_file(issue_id, filename):
    """
    Constructs and returns the public GCS URL path for a specific file associated with an issue.

    Args:
        issue_id (int/str): The ID of the target issue.
        filename (str): The filename of the attachment.

    Returns:
        tuple: A dictionary containing the target URL path and an HTTP status code.
    """
    public_url = f"[https://storage.googleapis.com/](https://storage.googleapis.com/){BUCKET_NAME}/tickets/ticket_{issue_id}/{filename}"
    return {"public_url": public_url}, 200

def delete_attachment(issue_id, filename, current_user, client_ip):
    """
    Performs a soft delete on an attachment by updating its removed state in the database.

    Args:
        issue_id (int/str): The ID of the issue.
        filename (str): The filename of the attachment to mark as deleted.
        current_user (dict): Context of the authenticated user performing the deletion.
        client_ip (str): The IP address of the client machine.

    Returns:
        tuple: A dictionary response payload and an HTTP status code.
    """
    username = current_user.get("sub", "UNKNOWN")

    if USE_MOCK_DATA:
        return {"message": "Attachment removed (Mock)."}, 200

    else:
        connection = get_db_connection()
        if not connection: return {"error": "error.database_connection"}, 500

        try:
            cursor = connection.cursor()
            # Perform a logical soft-delete rather than physically deleting the record
            soft_delete_qry = "UPDATE c_issue_attachment SET removed = 'T' WHERE id_issue = %s AND url_path LIKE %s"
            cursor.execute(soft_delete_qry, (issue_id, f"%{filename}%"))
            connection.commit()
            
            trigger_state_json_update()
            return {"message": "Attachment flagged as removed in PostgreSQL."}, 200
        except Exception as e:
            connection.rollback()
            print(f"[DATABASE ERROR - delete_attachment]: {str(e)}")
            return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
        finally:
            cursor.close()
            connection.close()