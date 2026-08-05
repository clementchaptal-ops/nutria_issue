import json
import threading
from google.cloud import storage
from config.database import get_db_connection
from config.storage import BUCKET_NAME

STATE_FILE_PATH = "system/active_issues_state.json"

def _generate_and_upload_state_json():
    """Génère le JSON des tickets actifs depuis la BDD et l'écrase sur GCS."""
    connection = get_db_connection()
    if not connection:
        return
        
    cursor = None
    try:
        cursor = connection.cursor()
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
                "id_issue": r[0], "title": r[1] or "", "issue_type": r[2] or "",
                "description": r[3] or "", "status": r[4], "project": r[5] or "",
                "batch": r[6] or "", "sample": r[7], "analysis": r[8] or "",
                "variation": r[9] or "", "customer": r[10] or "", "pc": r[11] or "",
                "citrix": r[12] or "", "environment": r[13] or "",
                "ai_attachments_summary": r[14] or "Aucune analyse.",
                "ip_adress": r[15] or "", "ping": r[16] or "", "workstation": r[17] or "",
                "user_name": r[18] or "", "criticity": r[19] or "", "full_name": r[20] or "",
                "lab": r[21] or "", "location": r[22] or ""
            })

        json_data = json.dumps(global_issues, ensure_ascii=False, indent=2, default=str)
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(STATE_FILE_PATH)
        blob.upload_from_string(json_data, content_type="application/json")
        print(f"[STATE MANAGER] Fichier {STATE_FILE_PATH} mis à jour avec {len(global_issues)} tickets.")

    except Exception as e:
        print(f"[STATE MANAGER ERROR]: {str(e)}")
    finally:
        if cursor: cursor.close()
        if connection: connection.close()

def trigger_state_json_update():
    """Lance la mise à jour du JSON en arrière-plan."""
    thread = threading.Thread(target=_generate_and_upload_state_json)
    thread.daemon = True
    thread.start()