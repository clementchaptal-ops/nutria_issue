import logging
from config.database import get_db_connection

logger = logging.getLogger(__name__)

def log_user_action(user_name: str, action_type: str, target_id: str = None, details: str = None, ip_address: str = None):
    """Records a user action into the audit trail table (Synchronous on GCP)."""
    connection = get_db_connection()
    if not connection:
        logger.error("Audit Trail: Unable to connect to the database.")
        return
        
    try:
        cursor = connection.cursor()
        query = """
            INSERT INTO c_issue_audit_logs (user_name, action_type, target_id, details, ip_address)
            VALUES (:1, :2, :3, :4, :5)
        """
        cursor.execute(query, [user_name, action_type, target_id, details, ip_address])
        connection.commit()
    except Exception as e:
        logger.error(f"Audit Trail Error: {e}")
    finally:
        cursor.close()
        connection.close()


def get_audit_logs(current_user):
    """Fetches all audit trail logs (Restricted to administrators)."""
    user_role = current_user.get("role")

    # Vérification des droits d'accès
    if user_role not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "Access denied. Restricted to administrators."}, 403

    connection = get_db_connection()
    if not connection:
        return {"error": "Database connection error."}, 500

    try:
        cursor = connection.cursor()
        qry = """
            SELECT id_log, user_name, action_type, target_id, details, ip_address, 
                   TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as c_date
            FROM c_issue_audit_logs
            ORDER BY id_log DESC
        """
        cursor.execute(qry)
        rows = cursor.fetchall()

        logs = []
        for row in rows:
            # Special handling for Oracle CLOB 'details' column data streaming
            details_val = row[4]
            if details_val is not None and hasattr(details_val, 'read'):
                details_val = details_val.read()

            logs.append({
                "id_log": row[0],
                "user_name": row[1],
                "action_type": row[2],
                "target_id": row[3] or "-",
                "details": str(details_val) if details_val else "",
                "ip_address": row[5] or "Unknown",
                "created_at": row[6]
            })
            
        # Succès : on retourne la liste et le code 200
        return logs, 200
        
    except Exception as e:
        return {"error": f"Oracle Error: {str(e)}"}, 500
    finally:
        cursor.close()
        connection.close()