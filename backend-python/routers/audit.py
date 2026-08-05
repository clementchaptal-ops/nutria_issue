from config.database import get_db_connection


def log_user_action(user_name: str, action_type: str, target_id: str = None, details: str = None, ip_address: str = None):
    """
    Synchronously records a user action into the audit trail database table.

    Args:
        user_name (str): The username of the operator.
        action_type (str): The category of transaction/action.
        target_id (str, optional): The identifier of the modified entity.
        details (str, optional): Contextual JSON or text details of the action.
        ip_address (str, optional): The originating client IP address.
    """
    connection = get_db_connection()
    if not connection:
        return
        
    try:
        cursor = connection.cursor()
        query = """
            INSERT INTO c_issue_audit_logs (user_name, action_type, target_id, details, ip_address)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (user_name, action_type, target_id, details, ip_address))
        connection.commit()
    except Exception as e:
        if connection:
            connection.rollback()
        # Log to standard output to guarantee visibility in GCP environments
        print(f"[AUDIT ERROR - log_user_action]: {str(e)}")
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        connection.close()


def get_audit_logs(current_user):
    """
    Retrieves all audit trail records, sorted in descending chronological order.

    Access is restricted to specific administrative roles.

    Args:
        current_user (dict): User context extracted from the active session or token.

    Returns:
        tuple: Structured logs and HTTP 200, or error payload and corresponding HTTP code.
    """
    user_role = current_user.get("role")

    if user_role not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Access denied. Restricted to administrators."}, 403

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

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
            # Transform database sequence elements to key-value maps with default fallbacks
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
        print(f"[DATABASE ERROR - get_audit_logs]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        connection.close()

def add_audit_log(payload):
    """
    Exposes an entry point to register logs generated from external systems.

    Args:
        payload (dict): Parsed JSON body containing execution parameters.

    Returns:
        tuple: Operation confirmation status and HTTP code.
    """
    user_name = payload.get("user_name", "UNKNOWN")
    action_type = payload.get("action_type", "UNKNOWN")
    target_id = payload.get("target_id", "")
    details = payload.get("details", "")
    ip_address = payload.get("ip_address", "Unknown")

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    try:
        cursor = connection.cursor()
        query = """
            INSERT INTO c_issue_audit_logs (user_name, action_type, target_id, details, ip_address)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (user_name, action_type, target_id, details, ip_address))
        connection.commit()
        return {"message": "success.audit_log_inserted"}, 201
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - add_audit_log]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        connection.close()