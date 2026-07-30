import os
from config.database import get_db_connection
from pydantic import ValidationError

from .schemas import RegroupementCreate
from .audit import log_user_action

# =====================================================================
# REGROUPEMENTS ROUTES
# =====================================================================

def get_all_regroupements(current_user):
    """Fetches all regroupements with the count of linked tickets."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    cursor = connection.cursor()
    regroupements = []
    
    try:
        # On récupère les groupes + le nom complet du créateur + le nombre de tickets liés
        qry = """
            SELECT r.id_regroupment, r.title, r.ssp_ticket, r.description,
                   u.full_name, r.created_by,
                   TO_CHAR(r.created_on, 'YYYY-MM-DD HH24:MI') as created_on,
                   (SELECT COUNT(*) FROM c_link_issue_regroupment l WHERE l.id_regroupment = r.id_regroupment) as ticket_count
            FROM c_issue_regroupment r
            LEFT JOIN lims_users u ON TRIM(UPPER(r.created_by)) = TRIM(UPPER(u.user_name))
            ORDER BY r.id_regroupment DESC
        """
        cursor.execute(qry)
        rows = cursor.fetchall()
        
        for row in rows:
            regroupements.append({
                "id_regroupment": row[0],
                "title": row[1] if row[1] else "Untitled",
                "ssp_ticket": row[2],
                "description": row[3],
                "created_by": row[4] if row[4] else (row[5] if row[5] else "Unknown"),
                "created_on": row[6],
                "ticket_count": row[7]
            })
            
        return regroupements, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_all_regroupements]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def get_regroupement(regroupement_id, current_user):
    """Fetches a specific regroupement and all its linked issues."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        # 1. Infos du regroupement
        qry_group = """
            SELECT r.id_regroupment, r.title, r.description, r.ssp_ticket,
                   u.full_name, TO_CHAR(r.created_on, 'YYYY-MM-DD HH24:MI') as created_on
            FROM c_issue_regroupment r
            LEFT JOIN lims_users u ON TRIM(UPPER(r.created_by)) = TRIM(UPPER(u.user_name))
            WHERE r.id_regroupment = %s
        """
        cursor.execute(qry_group, (regroupement_id,))
        row = cursor.fetchone()
        
        if not row:
            return {"error": "error.regroupement_not_found"}, 404
            
        group_data = {
            "id_regroupment": row[0],
            "title": row[1],
            "description": row[2],
            "ssp_ticket": row[3],
            "created_by": row[4],
            "created_on": row[5],
            "linked_issues": []
        }
        
        # 2. Récupérer les tickets liés
        qry_issues = """
            SELECT i.id_issue, i.title, i.status, i.issue_type, 
                   u.full_name, TO_CHAR(i.created_on, 'YYYY-MM-DD HH24:MI') as created_on
            FROM c_issue i
            JOIN c_link_issue_regroupment l ON i.id_issue = l.id_issue
            LEFT JOIN lims_users u ON TRIM(UPPER(i.user_name)) = TRIM(UPPER(u.user_name))
            WHERE l.id_regroupment = %s
            ORDER BY i.id_issue DESC
        """
        cursor.execute(qry_issues, (regroupement_id,))
        issue_rows = cursor.fetchall()
        
        for i_row in issue_rows:
            group_data["linked_issues"].append({
                "id_issue": i_row[0],
                "title": i_row[1],
                "status": i_row[2],
                "issue_type": i_row[3],
                "user_name": i_row[4],
                "created_on": i_row[5]
            })
            
        return group_data, 200
        
    except Exception as e:
        print(f"[DATABASE ERROR - get_regroupement]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def create_regroupement(request_json, current_user, client_ip):
    """Creates a new regroupement in the database."""
    try:
        data = RegroupementCreate(**request_json)
    except ValidationError as e:
        return {"error": "error.invalid_data_format", "details": e.errors()}, 400

    username = current_user.get("sub", "UNKNOWN")
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        insert_qry = """
            INSERT INTO c_issue_regroupment (title, description, ssp_ticket, created_by) 
            VALUES (%s, %s, %s, %s) 
            RETURNING id_regroupment
        """
        cursor.execute(insert_qry, (data.title, data.description, data.ssp_ticket, username))
        
        next_id = cursor.fetchone()[0]
        connection.commit()

        log_user_action(
            user_name=username, 
            action_type="CREATE_REGROUPEMENT", 
            target_id=str(next_id), 
            details=f"Created regroupement: '{data.title}'", 
            ip_address=client_ip
        )
        
        return {"id_regroupment": next_id, "message": "success.regroupement_created"}, 201
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - create_regroupement]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()


def link_issue_to_regroupement(regroupement_id, request_json, current_user, client_ip):
    """Links an existing issue to a regroupement."""
    issue_id = request_json.get("id_issue")
    if not issue_id:
        return {"error": "error.missing_issue_id"}, 400

    username = current_user.get("sub", "UNKNOWN")
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        # Insert or ignore (ON CONFLICT DO NOTHING pour éviter les doublons si on relie le même)
        insert_qry = """
            INSERT INTO c_link_issue_regroupment (id_regroupment, id_issue) 
            VALUES (%s, %s)
            ON CONFLICT ON CONSTRAINT pk_c_link_issue_regroupment DO NOTHING
        """
        cursor.execute(insert_qry, (regroupement_id, issue_id))
        connection.commit()

        log_user_action(
            user_name=username, 
            action_type="LINK_ISSUE", 
            target_id=str(regroupement_id), 
            details=f"Linked issue #{issue_id} to regroupement #{regroupement_id}", 
            ip_address=client_ip
        )
        
        return {"message": "success.issue_linked"}, 200
    except Exception as e:
        connection.rollback()
        print(f"[DATABASE ERROR - link_issue]: {str(e)}")
        return {"error": "error.database_query", "details": "An internal database error occurred."}, 500
    finally:
        cursor.close()
        connection.close()