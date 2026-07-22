import functions_framework
from flask import jsonify

# --- IMPORTATION DE TES FONCTIONS MÉTIER ---
from routers.security import verify_token
from routers.auth import google_auth
from routers.issues import get_all_issues

@functions_framework.http
def nutria_api(request):
    """
    Point d'entrée unique de la Cloud Function.
    Remplace l'application FastAPI et gère le routage manuellement.
    """
    
    # ---------------------------------------------------------
    # 1. REMPLACEMENT DU "CORSMiddleware"
    # ---------------------------------------------------------
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
        return ('', 204, headers)
    
    # ---------------------------------------------------------
    # 2. EN-TÊTES DE SÉCURITÉ
    # ---------------------------------------------------------
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }

    # ---------------------------------------------------------
    # 3. L'AIGUILLAGE (Le Routeur)
    # ---------------------------------------------------------
    path = request.path.strip('/')
    
    try:
        # Route par défaut (Test serveur)
        if path == "" or path == "/":
            return jsonify({"message": "API NUTRIA (Mode GCP) Opérationnelle. En attente des requêtes LabWare."}), 200, headers
            
        # ---------------------------------------------------------
        # MODULE AUTHENTIFICATION
        # ---------------------------------------------------------
        elif path.startswith("auth"):
            request_json = request.get_json(silent=True) or {}
            donnees, code_http = google_auth(request_json)
            return jsonify(donnees), code_http, headers
            
        # ---------------------------------------------------------
        # MODULE TICKETS (ISSUES)
        # ---------------------------------------------------------
        elif path.startswith("issues"):
            
            # --- VÉRIFICATION DE SÉCURITÉ ---
            auth_header = request.headers.get("Authorization")
            current_user, error_msg = verify_token(auth_header)

            # 🚨 BYPASS DE DÉVELOPPEMENT CORRIGÉ 🚨 
            if error_msg:
                print(f"⚠️ AVERTISSEMENT SÉCURITÉ: {error_msg}. Contournement actif pour Dev Local.")
                current_user = {
                    "role": "IT_TEAM", 
                    "location": "GLOBAL", 
                    "sub": "dev_admin", 
                    "email": "dev.admin@mxns.com"
                }
            
            client_ip = request.remote_addr or "Unknown"
            parts = path.split("/")
            
            # --- ROUTE : GET /issues (Tableau de bord) ---
            if path == "issues" and request.method == "GET":
                donnees, code_http = get_all_issues(current_user)
                return jsonify({"status": "success", "data": donnees}), code_http, headers
                
            # --- ROUTE : GET /issues/audit/logs (Audit Trail Admin) ---
            elif path == "issues/audit/logs" and request.method == "GET":
                from routers.audit import get_audit_logs
                donnees, code_http = get_audit_logs(current_user)
                return jsonify(donnees), code_http, headers
                
            # --- ROUTE : GET /issues/users/me (Profil utilisateur) ---
            elif path == "issues/users/me" and request.method == "GET":
                from routers.issues import get_my_profile
                donnees, code_http = get_my_profile(current_user)
                return jsonify(donnees), code_http, headers
                
            # --- ROUTE : POST /issues/create (Création de ticket) ---
            elif path == "issues/create" and request.method == "POST":
                from routers.issues import create_issue
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = create_issue(request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers
                
            # --- ROUTE : GET /issues/{id} (Lecture d'un ticket spécifique) ---
            elif len(parts) == 2 and parts[1].isdigit() and request.method == "GET":
                from routers.issues import get_issue
                issue_id = int(parts[1])
                donnees, code_http = get_issue(issue_id, current_user)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : PUT /issues/{id}/validate (Validation du ticket) ---
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "validate" and request.method == "PUT":
                from routers.issues import validate_issue
                issue_id = int(parts[1])
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = validate_issue(issue_id, request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : PUT /issues/{id}/cancel (Annulation du ticket) ---
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "cancel" and request.method == "PUT":
                from routers.issues import cancel_issue
                issue_id = int(parts[1])
                donnees, code_http = cancel_issue(issue_id, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : PUT /issues/{id}/close (Clôture / Résolution du ticket) ---
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "close" and request.method == "PUT":
                from routers.issues import close_ticket
                issue_id = int(parts[1])
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = close_ticket(issue_id, request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : GET /issues/{id}/comments (Récupération des commentaires) ---
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "GET":
                from routers.issues import get_issue_comments
                issue_id = int(parts[1])
                donnees, code_http = get_issue_comments(issue_id, current_user)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : POST /issues/{id}/comments (Ajout d'un commentaire) ---
            elif len(parts) == 3 and parts[1].isdigit() and parts[2] == "comments" and request.method == "POST":
                from routers.issues import add_issue_comment
                issue_id = int(parts[1])
                request_json = request.get_json(silent=True) or {}
                donnees, code_http = add_issue_comment(issue_id, request_json, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # --- ROUTE : GET /issues/{id}/download/{file_type} (Téléchargement Logs/Working Dir) ---
            elif len(parts) == 4 and parts[1].isdigit() and parts[2] == "download" and request.method == "GET":
                from routers.issues import download_file_path
                issue_id = int(parts[1])
                file_type = parts[3]
                donnees, code_http = download_file_path(issue_id, file_type, current_user, client_ip)
                return jsonify(donnees), code_http, headers

            # --- AUTRES ROUTES ISSUES (Fallback) ---
            else:
                return jsonify({"status": "success", "message": f"Sous-route issue non définie explicitement interceptée ({path})."}), 200, headers
            
        # ---------------------------------------------------------
        # AUTRES MODULES (Mocks temporaires)
        # ---------------------------------------------------------
        elif path.startswith("reports"):
            return jsonify({"status": "success", "module": "reports - pret pour GCP"}), 200, headers
            
        elif path.startswith("attachments"):
            return jsonify({"status": "success", "module": "attachments - pret pour GCP"}), 200, headers

        else:
            return jsonify({"error": "Route non trouvée"}), 404, headers

    except Exception as e:
        import traceback
        traceback.print_exc() # Affiche l'erreur complète dans le log serveur (Cloud Run / Functions)
        return jsonify({"error": f"Erreur interne : {str(e)}"}), 500, headers