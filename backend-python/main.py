import functions_framework
from flask import jsonify

# --- IMPORTATION DES FONCTIONS SÉCURITÉ & AUTH ---
from routers.security import verify_token
from routers.auth import google_auth
from routers.issues import get_all_issues

@functions_framework.http
def nutria_api(request):
    """Point d'entrée unique Cloud Function / Flask."""
    
    # 1. GESTION CORS
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
        # Route Accueil / Health Check
        if path in ("", "/"):
            return jsonify({"message": "API NUTRIA Opérationnelle."}), 200, headers
            
        # ---------------------------------------------------------
        # AUTHENTIFICATION
        # ---------------------------------------------------------
        elif path.startswith("auth"):
            request_json = request.get_json(silent=True) or {}
            donnees, code_http = google_auth(request_json)
            return jsonify(donnees), code_http, headers
            
        # ---------------------------------------------------------
        # MODULE ISSUES
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
                donnees, code_http = get_all_issues(current_user)
                return jsonify({"status": "success", "data": donnees}), code_http, headers
                
            # GET /issues/audit/logs
            elif path == "issues/audit/logs" and request.method == "GET":
                from routers.audit import get_audit_logs
                donnees, code_http = get_audit_logs(current_user)
                return jsonify(donnees), code_http, headers
                
            # GET /issues/users/me
            elif path == "issues/users/me" and request.method == "GET":
                from routers.issues import get_my_profile
                donnees, code_http = get_my_profile(current_user)
                return jsonify(donnees), code_http, headers
                
            # POST /issues/create
            elif path == "issues/create" and request.method == "POST":
                from routers.issues import create_issue
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = create_issue(request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers
                
            # GET /issues/{id}
            elif len(parts) == 2 and parts[1].isdigit() and request.method == "GET":
                from routers.issues import get_issue
                donnees, code_http = get_issue(int(parts[1]), current_user)
                return jsonify(donnees), code_http, headers

            # PUT /issues/{id}/validate
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "validate" and request.method == "PUT":
                from routers.issues import validate_issue
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = validate_issue(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # PUT /issues/{id}/cancel
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "cancel" and request.method == "PUT":
                from routers.issues import cancel_issue
                donnees, code_http = cancel_issue(int(parts[1]), current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # PUT /issues/{id}/close
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "close" and request.method == "PUT":
                from routers.issues import close_ticket
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = close_ticket(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # GET /issues/{id}/comments
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "GET":
                from routers.issues import get_issue_comments
                donnees, code_http = get_issue_comments(int(parts[1]), current_user)
                return jsonify(donnees), code_http, headers

            # POST /issues/{id}/comments
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "POST":
                from routers.issues import add_issue_comment
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = add_issue_comment(int(parts[1]), request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # POST /issues/{id}/comments/{comment_id}/attachments (Fichiers du commentaire)
            elif len(parts) == 5 and parts[1].isdigit() and parts[2] == "comments" and parts[3].isdigit() and parts[4] == "attachments" and request.method == "POST":
                from routers.issues import upload_comment_attachments
                issue_id, comment_id = int(parts[1]), int(parts[3])
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                donnees, code_http = upload_comment_attachments(issue_id, comment_id, files_data, current_user)
                return jsonify(donnees), code_http, headers

            # POST /issues/{id}/attachments (Upload d'images/fichiers sur ticket)
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "POST":
                from routers.attachments import upload_attachments
                files_data = [{"filename": f.filename, "content_type": f.content_type, "bytes": f.read()} for k in request.files for f in request.files.getlist(k)]
                donnees, code_http = upload_attachments(int(parts[1]), files_data, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # GET /issues/{id}/attachments/{filename} (Affichage d'images/fichiers via Redirection)
            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "GET":
                from routers.attachments import get_attachment_file
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                donnees, code_http = get_attachment_file(issue_id, filename)
                
                # Redirection directe vers le Storage Google
                if code_http == 200 and "public_url" in donnees:
                    headers_redirect = headers.copy()
                    headers_redirect["Location"] = donnees["public_url"]
                    return ('', 302, headers_redirect)
                return jsonify(donnees), code_http, headers

            # DELETE /issues/{id}/attachments/{filename}
            elif len(parts) >= 4 and parts[1].isdigit() and parts[2] == "attachments" and request.method == "DELETE":
                from routers.attachments import delete_attachment
                issue_id = int(parts[1])
                filename = "/".join(parts[3:])
                donnees, code_http = delete_attachment(issue_id, filename, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # GET /issues/{id}/download/{file_type}
            elif len(parts) == 4 and parts[1].isdigit() and parts[2] == "download" and request.method == "GET":
                from routers.issues import download_file_path
                donnees, code_http = download_file_path(int(parts[1]), parts[3], current_user, client_ip)
                return jsonify(donnees), code_http, headers

            else:
                return jsonify({"error": f"Sous-route non gérée: {path}"}), 404, headers

        else:
            return jsonify({"error": "Route non trouvée"}), 404, headers

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Erreur serveur : {str(e)}"}), 500, headers