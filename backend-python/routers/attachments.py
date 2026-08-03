import os
import uuid
import json  # <-- NOUVEL IMPORT
import threading
from google.cloud import storage

# Database configuration import
from config.database import get_db_connection

# Local module imports
from .audit import log_user_action

# --- CONFIGURATION ---
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "True") == "True"
BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")
STATE_FILE_PATH = "system/active_issues_state.json"  # <-- CHEMIN DU FICHIER JSON GLOBAL


# =====================================================================
# STATE MANAGER (JSON GLOBAL SUR GCS)
# =====================================================================

def _generate_and_upload_state_json():
    """Génère le JSON des tickets actifs depuis la BDD et l'écrase sur GCS."""
    connection = get_db_connection()
    if not connection:
        return
        
    cursor = None
    try:
        cursor = connection.cursor()
        
        # 🚀 AJOUT DU LEFT JOIN pour récupérer le Labo et la Location de l'utilisateur
        qry = """
            SELECT i.id_issue, i.title, i.issue_type, i.description, i.status,
                   i.current_project, i.current_batch, i.current_sample, i.current_analysis,
                   i.current_analysis_variation, i.current_customer, i.current_pc,
                   i.citrix_session, i.environment, i.ai_attachments_summary,
                   i.ip_adress, i.ping, i.workstation, i.user_name, i.criticity,
                   u.full_name, u.lab, u.location
            FROM c_issue i
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
            WHERE i.status IN ('IN PROGRESS', 'ACT KNOWLEDGE')
            ORDER BY i.id_issue DESC
        """
        cursor.execute(qry)
        rows = cursor.fetchall()

        global_issues = []
        for r in rows:
            global_issues.append({
                "id_issue": r[0],
                "title": r[1] or "",
                "issue_type": r[2] or "",
                "description": r[3] or "",
                "status": r[4],
                "project": r[5] or "",
                "batch": r[6] or "",
                "sample": r[7],
                "analysis": r[8] or "",
                "variation": r[9] or "",
                "customer": r[10] or "",
                "pc": r[11] or "",
                "citrix": r[12] or "",
                "environment": r[13] or "",
                "ai_attachments_summary": r[14] or "Aucune analyse.",
                "ip_adress": r[15] or "",
                "ping": r[16] or "",
                "workstation": r[17] or "",
                "user_name": r[18] or "",
                "criticity": r[19] or "",
                "full_name": r[20] or "",
                "lab": r[21] or "",       # <-- Info Site/Labo
                "location": r[22] or ""   # <-- Info Géographique
            })

        json_data = json.dumps(global_issues, ensure_ascii=False, indent=2, default=str)

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(STATE_FILE_PATH)
        
        # Application du content_type pour Vertex AI
        blob.upload_from_string(json_data, content_type="application/json")
        print(f"[STATE MANAGER] Fichier {STATE_FILE_PATH} mis à jour avec {len(global_issues)} tickets.")

    except Exception as e:
        print(f"[STATE MANAGER ERROR]: {str(e)}")
    finally:
        if cursor: 
            cursor.close()
        if connection: 
            connection.close()

def trigger_state_json_update():
    """Lance la mise à jour du JSON en arrière-plan (sans bloquer l'API)."""
    thread = threading.Thread(target=_generate_and_upload_state_json)
    thread.daemon = True
    thread.start()
# =====================================================================
# UTILS
# =====================================================================

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
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        unique_prefix = uuid.uuid4().hex[:8]
        blob_path = f"tickets/ticket_{issue_id}/{unique_prefix}_{filename}"

        blob = bucket.blob(blob_path)
        blob.upload_from_string(file_bytes)

        gs_uri = f"gs://{BUCKET_NAME}/{blob_path}"
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"

        return {
            "blob_path": blob_path,
            "gs_uri": gs_uri,
            "public_url": public_url
        }
    except Exception as e:
        print(f"[STORAGE ERROR - upload_to_gcs]: {str(e)}")
        raise e


# =====================================================================
# BUSINESS ROUTES
# =====================================================================

def upload_attachments(issue_id, files_data, current_user, client_ip):
    uploaded_files_info = []
    file_names_list = []
    username = current_user.get("sub", "UNKNOWN")

    try:
        for file_info in files_data:
            filename = file_info["filename"]
            content_type = file_info["content_type"]
            file_bytes = file_info["bytes"]

            file_names_list.append(filename)

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
            return {
                "message": "success.attachments_uploaded_mock",
                "bucket": BUCKET_NAME,
                "files": uploaded_files_info
            }, 202

        else:
            connection = get_db_connection()
            if not connection:
                return {"error": "error.database_connection"}, 500
                
            cursor = connection.cursor()

            try:
                for file_data in uploaded_files_info:
                    qry = """
                        INSERT INTO c_issue_attachment (
                            id_issue, attachment_name, attachment_type, url_path
                        ) VALUES (%s, %s, %s, %s)
                    """
                    cursor.execute(qry, (issue_id, file_data["original_name"], file_data["type"], file_data["url_path"]))

                connection.commit()
                log_user_action(user_name=username, action_type="UPLOAD_ATTACHMENTS", target_id=str(issue_id), details=audit_details, ip_address=client_ip)

                def run_ai_in_background(target_issue_id):
                    try:
                        from routers.ai_extractor import analyze_issue_attachments_and_save
                        print(f"[ASYNC AI] Starting analysis for issue #{target_issue_id}...")
                        analyze_issue_attachments_and_save(target_issue_id)
                        print(f"[ASYNC AI] Successfully processed issue #{target_issue_id}")
                    except Exception as ai_error:
                        print(f"[WARNING] AI Background Analysis failed for issue {target_issue_id}: {ai_error}")

                ai_thread = threading.Thread(target=run_ai_in_background, args=(issue_id,))
                ai_thread.daemon = True
                ai_thread.start()

                return {
                    "message": "success.attachments_uploaded_processing_ai",
                    "bucket": BUCKET_NAME,
                    "files": uploaded_files_info
                }, 202

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
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/tickets/ticket_{issue_id}/{filename}"
    return {"public_url": public_url}, 200


def delete_attachment(issue_id, filename, current_user, client_ip):
    username = current_user.get("sub", "UNKNOWN")

    if USE_MOCK_DATA:
        return {"message": "Attachment removed (Mock)."}, 200

    else:
        connection = get_db_connection()
        if not connection:
            return {"error": "error.database_connection"}, 500

        try:
            cursor = connection.cursor()
            soft_delete_qry = """
                UPDATE c_issue_attachment 
                SET removed = 'T'
                WHERE id_issue = %s AND url_path LIKE %s
            """
            cursor.execute(soft_delete_qry, (issue_id, f"%{filename}%"))
            connection.commit()
            
            # 🚀 L'attachement est supprimé, on met à jour le JSON global
            trigger_state_json_update()
            
            return {"message": "Attachment flagged as removed in PostgreSQL."}, 200
        except Exception as e:
            connection.rollback()
            print(f"[DATABASE ERROR - delete_attachment]: {str(e)}")
            return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
        finally:
            cursor.close()
            connection.close()