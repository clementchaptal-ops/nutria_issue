import os
import uuid
from google.cloud import storage
from config.database import get_db_connection
from pydantic import ValidationError

from .schemas import RegroupementCreate
from .audit import log_user_action
from config.storage import make_signed_url, BUCKET_NAME
from services.state_manager import trigger_state_json_update

# =====================================================================
# REGROUPEMENTS MODULE
# =====================================================================

def get_all_regroupements(current_user):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    cursor = connection.cursor()
    regroupements = []
    
    try:
        qry = """
            SELECT r.id_regroupment, r.title, r.ssp_ticket, r.description,
                   u.full_name, r.created_by,
                   TO_CHAR(r.created_on, 'YYYY-MM-DD HH24:MI') as created_on,
                   (SELECT COUNT(*) FROM c_link_issue_regroupment l WHERE l.id_regroupment = r.id_regroupment) as ticket_count,
                   r.status
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
                "ticket_count": row[7],
                "status": row[8] if row[8] else "OPEN"
            })
            
        return regroupements, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_all_regroupements]: {str(e)}")
        return {"error": "error.database_query", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()


def get_regroupement(regroupement_id, current_user):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500
        
    try:
        cursor = connection.cursor()
        
        # 1. Groupe details
        qry_group = """
            SELECT r.id_regroupment, r.title, r.description, r.ssp_ticket,
                   u.full_name, TO_CHAR(r.created_on, 'YYYY-MM-DD HH24:MI') as created_on, r.status
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
            "status": row[6] if row[6] else "OPEN",
            "linked_issues": [],
            "attachments": []
        }
        
        # 2. Tickets liés
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
        for i_row in cursor.fetchall():
            group_data["linked_issues"].append({
                "id_issue": i_row[0],
                "title": i_row[1],
                "status": i_row[2],
                "issue_type": i_row[3],
                "user_name": i_row[4],
                "created_on": i_row[5]
            })

        # 3. Pièces jointes du regroupement
        qry_attachments = """
            SELECT id_attachment, attachment_name, attachment_type, url_path
            FROM c_issue_attachment
            WHERE id_regroupment = %s AND id_comment IS NULL
        """
        cursor.execute(qry_attachments, (regroupement_id,))
        for att in cursor.fetchall():
            group_data["attachments"].append({
                "id_attachment": att[0],
                "attachment_name": att[1],
                "attachment_type": att[2],
                "url_path": make_signed_url(att[3]) 
            })
            
        return group_data, 200
    except Exception as e:
        print(f"[DATABASE ERROR - get_regroupement]: {str(e)}")
        return {"error": "error.database_query", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()


def create_regroupement(request_json, current_user, client_ip):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

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
            INSERT INTO c_issue_regroupment (title, description, ssp_ticket, created_by, status) 
            VALUES (%s, %s, %s, %s, 'OPEN') 
            RETURNING id_regroupment
        """
        cursor.execute(insert_qry, (data.title, data.description, data.ssp_ticket, username))
        next_id = cursor.fetchone()[0]
        
        if hasattr(data, 'issue_ids') and data.issue_ids:
            for issue_id in data.issue_ids:
                cursor.execute(
                    "INSERT INTO c_link_issue_regroupment (id_regroupment, id_issue) VALUES (%s, %s) ON CONFLICT DO NOTHING", 
                    (next_id, issue_id)
                )

        connection.commit()

        # 🚀 UPDATE DU JSON GLOBAL
        trigger_state_json_update()

        log_user_action(
            user_name=username, action_type="CREATE_REGROUPEMENT", target_id=str(next_id), 
            details=f"Created regroupement: '{data.title}'", ip_address=client_ip
        )
        
        return {"id_regroupment": next_id, "message": "success.regroupement_created"}, 201
    except Exception as e:
        connection.rollback()
        return {"error": "error.database_query", "details": str(e)}, 500
    finally:
        cursor.close()
        connection.close()


def close_regroupement(regroupement_id, current_user, client_ip):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    username = current_user.get("sub", "UNKNOWN")
    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        cursor = connection.cursor()
        cursor.execute("""
            UPDATE c_issue_regroupment 
            SET status = 'CLOSED', changed_on = CURRENT_TIMESTAMP, changed_by = %s 
            WHERE id_regroupment = %s
        """, (username, regroupement_id))
        connection.commit()
        
        # 🚀 UPDATE DU JSON GLOBAL
        trigger_state_json_update()

        log_user_action(
            user_name=username, action_type="CLOSE_REGROUPEMENT", target_id=str(regroupement_id), 
            details="Regroupement closed.", ip_address=client_ip
        )
        return {"message": "success.regroupement_closed"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.database", "details": str(e)}, 500
    finally:
        connection.close()


def get_regroupement_comments(regroupement_id, current_user):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        cursor = connection.cursor()
        qry = """
            SELECT c.id_comment, c.comment_text, u.full_name, c.user_name,
                   TO_CHAR(c.created_on, 'YYYY-MM-DD HH24:MI') as created_on
            FROM c_issue_comments c
            LEFT JOIN lims_users u ON TRIM(UPPER(c.user_name)) = TRIM(UPPER(u.user_name))
            WHERE c.id_regroupment = %s
            ORDER BY c.id_comment ASC
        """
        cursor.execute(qry, (regroupement_id,))
        comments = []
        rows = cursor.fetchall()
        for r in rows:
            comment_id = r[0]
            cursor.execute("SELECT attachment_name, attachment_type, url_path FROM c_issue_attachment WHERE id_comment = %s", (comment_id,))
            atts = [{"attachment_name": a[0], "attachment_type": a[1], "url_path": make_signed_url(a[2])} for a in cursor.fetchall()]
            comments.append({
                "id_comment": comment_id,
                "comment_text": r[1],
                "full_name": r[2] if r[2] else r[3],
                "created_on": r[4],
                "attachments": atts
            })
        return comments, 200
    except Exception as e:
        return {"error": "error.database", "details": str(e)}, 500
    finally:
        connection.close()


def add_regroupement_comment(regroupement_id, request_json, current_user, client_ip):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    comment_text = request_json.get("comment_text")
    if not comment_text: return {"error": "error.missing_text"}, 400
    
    username = current_user.get("sub", "UNKNOWN")
    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO c_issue_comments (id_regroupment, comment_text, user_name)
            VALUES (%s, %s, %s) RETURNING id_comment
        """, (regroupement_id, comment_text, username))
        new_comment_id = cursor.fetchone()[0]
        connection.commit()
        return {"id_comment": new_comment_id, "message": "success.comment_added"}, 201
    except Exception as e:
        connection.rollback()
        return {"error": "error.database", "details": str(e)}, 500
    finally:
        connection.close()


def upload_regroupement_attachments(regroupement_id, files_data, current_user):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        cursor = connection.cursor()
        
        for file_info in files_data:
            filename = file_info["filename"]
            safe_file_name = f"reg_{uuid.uuid4().hex[:8]}_{filename}"
            blob_path = f"regroupements/reg_{regroupement_id}/{safe_file_name}"
            
            blob = bucket.blob(blob_path)
            blob.upload_from_string(file_info["bytes"])
            public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"
            
            ext = filename.split('.')[-1].lower() if '.' in filename else ''
            att_type = 'IMAGE' if ext in ['png', 'jpg', 'jpeg', 'gif', 'webp'] else ('VIDEO' if ext in ['mp4', 'webm', 'mov'] else 'DOCUMENT')

            cursor.execute("""
                INSERT INTO c_issue_attachment (id_regroupment, attachment_name, attachment_type, url_path) 
                VALUES (%s, %s, %s, %s)
            """, (regroupement_id, filename, att_type, public_url))
            
        connection.commit()
        return {"message": "success.attachments_uploaded"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.storage", "details": str(e)}, 500
    finally:
        connection.close()


def upload_regroupement_comment_attachments(regroupement_id, comment_id, files_data, current_user):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        cursor = connection.cursor()
        
        for file_info in files_data:
            filename = file_info["filename"]
            safe_file_name = f"comment_{uuid.uuid4().hex[:8]}_{filename}"
            blob_path = f"regroupements/reg_{regroupement_id}/comments/{safe_file_name}"
            
            blob = bucket.blob(blob_path)
            blob.upload_from_string(file_info["bytes"])
            public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"
            
            ext = filename.split('.')[-1].lower() if '.' in filename else ''
            att_type = 'IMAGE' if ext in ['png', 'jpg', 'jpeg', 'gif', 'webp'] else ('VIDEO' if ext in ['mp4', 'webm', 'mov'] else 'DOCUMENT')

            cursor.execute("""
                INSERT INTO c_issue_attachment (id_regroupment, id_comment, attachment_name, attachment_type, url_path) 
                VALUES (%s, %s, %s, %s, %s)
            """, (regroupement_id, comment_id, filename, att_type, public_url))
            
        connection.commit()
        return {"message": "success.comment_attachments_uploaded"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.storage", "details": str(e)}, 500
    finally:
        connection.close()


def delete_regroupement_attachment(regroupement_id, filename, current_user, client_ip):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM c_issue_attachment WHERE id_regroupment = %s AND attachment_name = %s", (regroupement_id, filename))
        connection.commit()
        return {"message": "success.attachment_deleted"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.database", "details": str(e)}, 500
    finally:
        connection.close()


def update_regroupement(regroupement_id, request_json, current_user, client_ip):
    if current_user.get("role", "USER") not in ["IT_TEAM", "LOCAL_ADMIN"]:
        return {"error": "error.forbidden_access", "details": "Restricted area."}, 403

    title = request_json.get("title")
    description = request_json.get("description")
    ssp_ticket = request_json.get("ssp_ticket")
    
    username = current_user.get("sub", "UNKNOWN")
    connection = get_db_connection()
    if not connection: return {"error": "error.database_connection"}, 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("""
            UPDATE c_issue_regroupment 
            SET title = %s, description = %s, ssp_ticket = %s, changed_on = CURRENT_TIMESTAMP, changed_by = %s
            WHERE id_regroupment = %s
        """, (title, description, ssp_ticket, username, regroupement_id))
        connection.commit()
        
        log_user_action(
            user_name=username, action_type="UPDATE_REGROUPEMENT", target_id=str(regroupement_id), 
            details="Regroupement details updated.", ip_address=client_ip
        )
        return {"message": "success.regroupement_updated"}, 200
    except Exception as e:
        connection.rollback()
        return {"error": "error.database", "details": str(e)}, 500
    finally:
        connection.close()

def validate_ai_suggestion(reg_id, current_user, client_ip):
    """Transforms an AI-suggested (or previously rejected) regroupement into an official OPEN regroupement."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    username = current_user.get("sub", "UNKNOWN")
    cursor = None
    try:
        cursor = connection.cursor()

        # 1. Promote regroupement to 'OPEN'. On accepte SUGGESTED ou REJECTED.
        update_reg_qry = """
            UPDATE c_issue_regroupment 
            SET status = 'OPEN', changed_by = %s, changed_on = CURRENT_TIMESTAMP
            WHERE id_regroupment = %s AND status IN ('SUGGESTED', 'REJECTED')
        """
        cursor.execute(update_reg_qry, (username, reg_id))

        if cursor.rowcount == 0:
            return {"error": "error.suggestion_not_found"}, 404

        # 2. Validate all AI-linked tickets
        update_links_qry = """
            UPDATE c_link_issue_regroupment 
            SET link_status = 'VALIDATED' 
            WHERE id_regroupment = %s AND link_status = 'AI_SUGGESTION'
        """
        cursor.execute(update_links_qry, (reg_id,))

        connection.commit()

        # 🚀 UPDATE DU JSON GLOBAL
        trigger_state_json_update()

        log_user_action(user_name=username, action_type="VALIDATE_AI_REGROUPEMENT", target_id=str(reg_id), details="Validated AI suggested regroupement.", ip_address=client_ip)

        return {"message": "success.suggestion_validated"}, 200
    except Exception as e:
        if connection:
            connection.rollback()
        print(f"[DATABASE ERROR - validate_ai_suggestion]: {str(e)}")
        return {"error": "error.database_query", "details": "error.internal_db_error"}, 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def reject_ai_suggestion(reg_id, current_user, client_ip):
    """Marks an AI-suggested regroupement as REJECTED instead of deleting it."""
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    username = current_user.get("sub", "UNKNOWN")
    cursor = None
    try:
        cursor = connection.cursor()

        # Remplacement du DELETE par un UPDATE vers le statut REJECTED
        update_qry = """
            UPDATE c_issue_regroupment 
            SET status = 'REJECTED', changed_by = %s, changed_on = CURRENT_TIMESTAMP 
            WHERE id_regroupment = %s AND status = 'SUGGESTED'
        """
        cursor.execute(update_qry, (username, reg_id))

        if cursor.rowcount == 0:
            return {"error": "error.suggestion_not_found"}, 404

        connection.commit()

        # 🚀 UPDATE DU JSON GLOBAL
        trigger_state_json_update()

        log_user_action(user_name=username, action_type="REJECT_AI_REGROUPEMENT", target_id=str(reg_id), details="Rejected AI suggested regroupement.", ip_address=client_ip)

        return {"message": "success.suggestion_rejected"}, 200
    except Exception as e:
        if connection:
            connection.rollback()
        print(f"[DATABASE ERROR - reject_ai_suggestion]: {str(e)}")
        return {"error": "error.database_query", "details": "error.internal_db_error"}, 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()