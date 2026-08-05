import os
import functions_framework
from flask import jsonify

from routers.security import verify_token
from routers.auth import google_auth
from routers.issues import get_all_issues

@functions_framework.http
def nutria_api(request):
    """
    HTTP Cloud Function serving as the unified API routing controller.

    This function handles CORS negotiation, verifies system-to-system and 
    user tokens, applies scope boundaries for machine clients, routes 
    dynamic URL parameters to specific sub-routers, and implements robust 
    global exception handling.

    Args:
        request (flask.Request): The incoming Flask request payload.

    Returns:
        tuple: (flask.Response, int, dict) containing JSON data, HTTP status code, 
               and response headers.
    """
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }

    path = request.path.strip('/')
    
    try:
        if path in ("", "/"):
            return jsonify({"message": "success.api_operational"}), 200, headers
            
        elif path.startswith("auth"):
            request_json = request.get_json(silent=True) or {}
            data, http_code = google_auth(request_json)
            return jsonify(data), http_code, headers
            
        elif path.startswith("issues"):
            auth_header = request.headers.get("Authorization")
            expected_labware_token = os.environ.get("LABWARE_API_TOKEN")

            # Fall back to external OAuth if LabWare direct authorization check fails
            if expected_labware_token and auth_header == f"Bearer {expected_labware_token}":
                real_lims_user = request.headers.get("X-LIMS-User") or request.headers.get("X-User-Name") or "LABWARE_LIMS"
                
                current_user = {
                    "role": "SYSTEM",
                    "location": "GLOBAL",
                    "sub": real_lims_user.strip(), 
                    "email": f"{real_lims_user.strip().lower()}@lims.internal"
                }
                error_msg = None
            else:
                current_user, error_msg = verify_token(auth_header)

            if error_msg:
                return jsonify({"error": "error.unauthorized_access", "details": error_msg}), 401, headers
            
            client_ip = request.remote_addr or "Unknown"
            parts = path.split("/")

            # Enforce access restrictions on automation endpoints for machine-to-machine integration
            if current_user.get("sub") == "LABWARE_LIMS":
                is_preticket = (path == "issues/preticket" and request.method == "POST")
                is_attachment = (len(parts) == 3 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "POST")
                is_environment = (len(parts) == 3 and parts[1].isdigit() and parts[2] == "environment" and request.method == "PUT")
                is_cleanup = (path == "issues/cleanup" and request.method == "POST")  
                is_audit_log = (path == "issues/audit/logs" and request.method == "POST")
                
                if not (is_preticket or is_attachment or is_environment or is_cleanup or is_audit_log):
                    print(f"[SECURITY ALERT] Attempt to use LIMS token for unauthorized route: {request.method} {path} from IP {client_ip}")
                    return jsonify({"error": "error.forbidden", "details": "error.lims_token_restricted"}), 403, headers
            
            if path == "issues" and request.method == "GET":
                data, http_code = get_all_issues(current_user)
                return jsonify({"status": "success.data_retrieved", "data": data}), http_code, headers
                
            elif path == "issues/audit/logs" and request.method == "GET":
                from routers.audit import get_audit_logs
                data, http_code = get_audit_logs(current_user)
                return jsonify(data), http_code, headers
                
            elif path == "issues/audit/logs" and request.method == "POST":
                from routers.audit import add_audit_log
                request_json = request.get_json(silent=True) or {}
                data, http_code = add_audit_log(request_json)
                return jsonify(data), http_code, headers
                
            elif path == "issues/users/me" and request.method == "GET":
                from routers.issues import get_my_profile
                data, http_code = get_my_profile(current_user)
                return jsonify(data), http_code, headers
                
            elif path == "issues/create" and request.method == "POST":
                from routers.issues import create_issue
                request_json = request.get_json(silent=True) or {}
                data, http_code = create_issue(request_json, current_user, client_ip)
                return jsonify(data), http_code, headers
                
            elif len(parts) == 2 and parts[1].isdigit() and request.method == "GET":
                from routers.issues import get_issue
                data, http_code = get_issue(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "validate" and request.method == "PUT":
                from routers.issues import validate_issue
                request_json = request.get_json(silent=True) or {}
                data, http_code = validate_issue(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "cancel" and request.method == "PUT":
                from routers.issues import cancel_issue
                data, http_code = cancel_issue(int(parts[1]), current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "close" and request.method == "PUT":
                from routers.issues import close_ticket
                request_json = request.get_json(silent=True) or {}
                data, http_code = close_ticket(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "GET":
                from routers.issues import get_issue_comments
                data, http_code = get_issue_comments(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "POST":
                from routers.issues import add_issue_comment
                request_json = request.get_json(silent=True) or {}
                data, http_code = add_issue_comment(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 5 and parts[1].isdigit() and parts[2] == "comments" and parts[3].isdigit() and parts[4] == "attachments" and request.method == "POST":
                from routers.issues import upload_comment_attachments
                issue_id, comment_id = int(parts[1]), int(parts[3])
                # Flatten file properties from multipart forms into a structured, byte-serialized array
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_comment_attachments(issue_id, comment_id, files_data, current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "POST":
                from routers.attachments import upload_attachments
                # Flatten file properties from multipart forms into a structured, byte-serialized array
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_attachments(int(parts[1]), files_data, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "GET":
                from routers.attachments import get_attachment_file
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                data, http_code = get_attachment_file(issue_id, filename)
                
                if http_code == 200 and "public_url" in data:
                    headers_redirect = headers.copy()
                    headers_redirect["Location"] = data["public_url"]
                    return ('', 302, headers_redirect)
                return jsonify(data), http_code, headers

            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "DELETE":
                from routers.attachments import delete_attachment
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                data, http_code = delete_attachment(issue_id, filename, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 4 and parts[1].isdigit() and parts[2] == "download" and request.method == "GET":
                from routers.issues import download_file_path
                data, http_code = download_file_path(int(parts[1]), parts[3], current_user, client_ip)
                return jsonify(data), http_code, headers
            
            elif path == "issues/preticket" and request.method == "POST":
                from routers.issues import create_preticket
                request_json = request.get_json(silent=True) or {}
                data, http_code = create_preticket(request_json, current_user, client_ip)
                return jsonify(data), http_code, headers
            
            elif path == "issues/cleanup" and request.method == "POST":
                from routers.issues import system_cleanup
                data, http_code = system_cleanup()
                return jsonify(data), http_code, headers
            
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "environment" and request.method == "PUT":
                from routers.issues import update_issue_environment
                request_json = request.get_json(silent=True) or {}
                data, http_code = update_issue_environment(int(parts[1]), request_json)
                return jsonify(data), http_code, headers
            
            else:
                return jsonify({"error": "error.route_not_found"}), 404, headers

        elif path.startswith("regroupements"):
            auth_header = request.headers.get("Authorization")
            current_user, error_msg = verify_token(auth_header)

            if error_msg:
                return jsonify({"error": "error.unauthorized_access", "details": error_msg}), 401, headers
            
            client_ip = request.remote_addr or "Unknown"
            parts = path.split("/")

            if path == "regroupements" and request.method == "GET":
                from routers.regroupement import get_all_regroupements
                data, http_code = get_all_regroupements(current_user)
                return jsonify(data), http_code, headers
                
            elif path == "regroupements" and request.method == "POST":
                from routers.regroupement import create_regroupement
                request_json = request.get_json(silent=True) or {}
                data, http_code = create_regroupement(request_json, current_user, client_ip)
                return jsonify(data), http_code, headers
                
            elif len(parts) == 2 and parts[1].isdigit() and request.method == "GET":
                from routers.regroupement import get_regroupement
                data, http_code = get_regroupement(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 2 and parts[1].isdigit() and request.method == "PUT":
                from routers.regroupement import update_regroupement
                request_json = request.get_json(silent=True) or {}
                data, http_code = update_regroupement(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "close" and request.method == "PUT":
                from routers.regroupement import close_regroupement
                data, http_code = close_regroupement(int(parts[1]), current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "GET":
                from routers.regroupement import get_regroupement_comments
                data, http_code = get_regroupement_comments(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "POST":
                from routers.regroupement import add_regroupement_comment
                request_json = request.get_json(silent=True) or {}
                data, http_code = add_regroupement_comment(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 5 and parts[1].isdigit() and parts[2] == "comments" and parts[3].isdigit() and parts[4] == "attachments" and request.method == "POST":
                from routers.regroupement import upload_regroupement_comment_attachments
                reg_id, comment_id = int(parts[1]), int(parts[3])
                # Flatten file properties from multipart forms into a structured, byte-serialized array
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_regroupement_comment_attachments(reg_id, comment_id, files_data, current_user)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "POST":
                from routers.regroupement import upload_regroupement_attachments
                # Flatten file properties from multipart forms into a structured, byte-serialized array
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_regroupement_attachments(int(parts[1]), files_data, current_user)
                return jsonify(data), http_code, headers

            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "DELETE":
                from routers.regroupement import delete_regroupement_attachment
                reg_id = int(parts[1])
                filename = "/".join(parts[3:])
                data, http_code = delete_regroupement_attachment(reg_id, filename, current_user, client_ip)
                return jsonify(data), http_code, headers
            
            elif path == "regroupements/suggest-ai" and request.method == "POST":
                from services.ai_clustering import generate_suggested_regroupements
                data, http_code = generate_suggested_regroupements(current_user.get("sub"))
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "validate-suggestion" and request.method == "PUT":
                from routers.regroupement import validate_ai_suggestion
                data, http_code = validate_ai_suggestion(int(parts[1]), current_user, client_ip)
                return jsonify(data), http_code, headers

            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "reject-suggestion" and request.method == "PUT":
                from routers.regroupement import reject_ai_suggestion
                data, http_code = reject_ai_suggestion(int(parts[1]), current_user, client_ip)
                return jsonify(data), http_code, headers

            else:
                return jsonify({"error": "error.route_not_found"}), 404, headers
            
        else:
            return jsonify({"error": "error.route_not_found"}), 404, headers

    except Exception as e:
        print(f"[FATAL SERVER ERROR] Route: {path} | Error: {str(e)}")
        return jsonify({
            "error": "error.internal_server", 
            "details": "error.unexpected_contact_admin"
        }), 500, headers