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
        # ✅ Syntaxe PostgreSQL : %s au lieu de :1
        query = """
            INSERT INTO c_issue_audit_logs (user_name, action_type, target_id, details, ip_address)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (user_name, action_type, target_id, details, ip_address))
        connection.commit()
    except Exception as e:
        logger.error(f"Audit Trail Error: {e}")
    finally:
        cursor.close()
        connection.close()


def get_audit_logs(current_user):
    user_role = current_user.get("role")

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
            details_val = row[4]
            logs.append({
                "id_log": row[0],
                "user_name": row[1] if row[1] else "UNKNOWN",
                "action_type": row[2] if row[2] else "N/A",
                "target_id": row[3] if row[3] else "-",
                "details": str(details_val) if details_val is not None else "",
                "ip_address": row[5] if row[5] else "Unknown",
                "created_at": row[6] if row[6] else ""
            })
            
        return logs, 200
        
    except Exception as e:
        return {"error": f"PostgreSQL Error: {str(e)}"}, 500
    finally:
        cursor.close()
        connection.close()