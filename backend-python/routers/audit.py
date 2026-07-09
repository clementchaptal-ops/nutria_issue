import logging
from fastapi import APIRouter, HTTPException, Depends
from config.database import get_db_connection
from .security import get_current_user

logger = logging.getLogger(__name__)

# Create a dedicated sub-router for audit operations
audit_router = APIRouter(prefix="/audit", tags=["Audit"])

def log_user_action(user_name: str, action_type: str, target_id: str = None, details: str = None, ip_address: str = None):
    """Asynchronously records a user action into the audit trail table."""
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


@audit_router.get("/logs")
def get_audit_logs(current_user: dict = Depends(get_current_user)):
    """Fetches all audit trail logs (Restricted to administrators)."""
    user_role = current_user.get("role")

    if user_role not in ["IT_TEAM", "LOCAL_ADMIN"]:
        raise HTTPException(status_code=403, detail="Access denied. Restricted to administrators.")

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")

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
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Error: {str(e)}")
    finally:
        cursor.close()
        connection.close()