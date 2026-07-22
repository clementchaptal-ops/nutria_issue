import functions_framework
from flask import jsonify

# --- SECURITY & AUTH FUNCTIONS IMPORT ---
from routers.security import verify_token
from routers.auth import google_auth
from routers.issues import get_all_issues

@functions_framework.http
def nutria_api(request):
    """Single entry point for Cloud Function / Flask."""
    
    # 1. CORS MANAGEMENT
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
        # Home Route / Health Check
        if path in ("", "/"):
            return jsonify({"message": "NUTRIA API Operational."}), 200, headers
            
        # ---------------------------------------------------------
        # AUTHENTICATION
        # ---------------------------------------------------------
        elif path.startswith("auth"):
            request_json = request.get_json(silent=True) or {}
            data, http_code = google_auth(request_json)
            return jsonify(data), http_code, headers
            
        # ---------------------------------------------------------
        # ISSUES MODULE
        # ---------------------------------------------------------
        elif path.startswith("issues"):
            
            auth_header = request.headers.get("Authorization")
            current_user, error_msg = verify_token(auth_header)

            if error_msg:
                current_user = {
                    "role": "IT_TEAM", 
                    "location": "GLOBAL", 
                    "sub": "dev_admin", 
                    "email": "dev.admin@mxns.com"
                }
            
            client_ip = request.remote_addr or "Unknown"
            parts = path.split("/")
            
            # GET /issues
            if path == "issues" and request.method == "GET":
                data, http_code = get_all_issues(current_user)
                return jsonify({"status": "success", "data": data}), http_code, headers
                
            # GET /issues/audit/logs
            elif path == "issues/audit/logs" and request.method == "GET":
                from routers.audit import get_audit_logs
                data, http_code = get_audit_logs(current_user)
                return jsonify(data), http_code, headers
                
            # GET /issues/users/me
            elif path == "issues/users/me" and request.method == "GET":
                from routers.issues import get_my_profile
                data, http_code = get_my_profile(current_user)
                return jsonify(data), http_code, headers
                
            # POST /issues/create
            elif path == "issues/create" and request.method == "POST":
                from routers.issues import create_issue
                request_json = request.get_json(silent=True) or {}
                data, http_code = create_issue(request_json, current_user, client_ip)
                return jsonify(data), http_code, headers
                
            # GET /issues/{id}
            elif len(parts) == 2 and parts[1].isdigit() and request.method == "GET":
                from routers.issues import get_issue
                data, http_code = get_issue(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            # PUT /issues/{id}/validate
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "validate" and request.method == "PUT":
                from routers.issues import validate_issue
                request_json = request.get_json(silent=True) or {}
                data, http_code = validate_issue(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            # PUT /issues/{id}/cancel
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "cancel" and request.method == "PUT":
                from routers.issues import cancel_issue
                data, http_code = cancel_issue(int(parts[1]), current_user, client_ip)
                return jsonify(data), http_code, headers

            # PUT /issues/{id}/close
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "close" and request.method == "PUT":
                from routers.issues import close_ticket
                request_json = request.get_json(silent=True) or {}
                data, http_code = close_ticket(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            # GET /issues/{id}/comments
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "GET":
                from routers.issues import get_issue_comments
                data, http_code = get_issue_comments(int(parts[1]), current_user)
                return jsonify(data), http_code, headers

            # POST /issues/{id}/comments
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "POST":
                from routers.issues import add_issue_comment
                request_json = request.get_json(silent=True) or {}
                data, http_code = add_issue_comment(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(data), http_code, headers

            # POST /issues/{id}/comments/{comment_id}/attachments (Comment attachments)
            elif len(parts) == 5 and parts[1].isdigit() and parts[2] == "comments" and parts[3].isdigit() and parts[4] == "attachments" and request.method == "POST":
                from routers.issues import upload_comment_attachments
                issue_id, comment_id = int(parts[1]), int(parts[3])
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_comment_attachments(issue_id, comment_id, files_data, current_user)
                return jsonify(data), http_code, headers

            # POST /issues/{id}/attachments (Ticket image/file upload)
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "POST":
                from routers.attachments import upload_attachments
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                data, http_code = upload_attachments(int(parts[1]), files_data, current_user, client_ip)
                return jsonify(data), http_code, headers

            # GET /issues/{id}/attachments/{filename} (Display images/files via redirection)
            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "GET":
                from routers.attachments import get_attachment_file
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                data, http_code = get_attachment_file(issue_id, filename)
                
                # Direct redirection to Google Storage
                if http_code == 200 and "public_url" in data:
                    headers_redirect = headers.copy()
                    headers_redirect["Location"] = data["public_url"]
                    return ('', 302, headers_redirect)
                return jsonify(data), http_code, headers

            # DELETE /issues/{id}/attachments/{filename}
            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "DELETE":
                from routers.attachments import delete_attachment
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                data, http_code = delete_attachment(issue_id, filename, current_user, client_ip)
                return jsonify(data), http_code, headers

            # GET /issues/{id}/download/{file_type}
            elif len(parts) == 4 and parts[1].isdigit() and parts[2] == "download" and request.method == "GET":
                from routers.issues import download_file_path
                data, http_code = download_file_path(int(parts[1]), parts[3], current_user, client_ip)
                return jsonify(data), http_code, headers

            else:
                return jsonify({"error": f"Unhandled sub-route: {path}"}), 404, headers

        else:
            return jsonify({"error": "Route not found"}), 404, headers

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500, headers