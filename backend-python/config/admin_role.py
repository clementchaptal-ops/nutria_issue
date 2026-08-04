import time
import google.auth
from googleapiclient.discovery import build

# Configuration des groupes
TARGET_GROUPS = {
    "IT_TEAM": "nutria_core_it@mxns.com",
    "LOCAL_ADMIN": "nutria-local_admin@mxns.com"
}

# Cache en mémoire (1 heure)
cache = {
    "data": None,
    "last_updated": 0
}
CACHE_DURATION = 3600

def fetch_group_members_from_google():
    """
    Interroge directement l'API Directory de Google Workspace 
    via les identifiants natifs du Service Account GCP.
    """
    group_results = {}
    
    try:
        # Récupère automatiquement les identifiants GCP du Cloud Run / Cloud Function
        credentials, _ = google.auth.default(
            scopes=['https://www.googleapis.com/auth/admin.directory.group.readonly']
        )
        service = build('admin', 'directory_v1', credentials=credentials)

        for role_name, group_email in TARGET_GROUPS.items():
            try:
                # CORRECTION : Utiliser groupKey au lieu de groupUniqueId
                response = service.members().list(groupKey=group_email).execute()
                members = response.get('members', [])
                group_results[group_email] = [m['email'].strip().lower() for m in members if 'email' in m]
            except Exception as group_err:
                print(f"[GOOGLE DIRECTORY ERROR] Impossible de lire {group_email}: {group_err}")
                group_results[group_email] = []

        return group_results

    except Exception as e:
        print(f"[FATAL DIRECTORY ERROR]: {e}")
        return None

def get_google_groups():
    """Gère le cache Python pour éviter de requêter Google à chaque milliseconde."""
    current_time = time.time()
    
    # 1. Utilisation du cache s'il est valide
    if cache["data"] is not None and (current_time - cache["last_updated"] < CACHE_DURATION):
        print("-> Fetching group roles from Python CACHE")
        return cache["data"]
    
    # 2. Rafraîchissement depuis Google Directory API
    print("-> Refreshing group roles from Google Directory API...")
    fresh_data = fetch_group_members_from_google()
    
    if fresh_data is not None:
        cache["data"] = fresh_data
        cache["last_updated"] = current_time
        print("-> Group cache successfully updated")
        return cache["data"]
    
    # Fallback sur l'ancien cache en cas de panne
    return cache["data"] or {}