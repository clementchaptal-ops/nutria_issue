import time
import os
import json
import urllib.request

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

# URL de ton déploiement Apps Script
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh4FglO3vXZJKB-_WI42m8xsc5uCVH6VluFsGg0C8eBr5zVRorAlk-devE69Cf4125mw/exec"

def fetch_group_members_from_google():
    """
    Récupère les membres des groupes.
    Mode temporaire : fait appel au Web App Google Apps Script via urllib.
    """
    # -------------------------------------------------------------------------
    # OPTION A : MODE TEMPORAIRE (via Google Apps Script)
    # -------------------------------------------------------------------------
    try:
        print("--> [TEMPORAIRE] Lecture des groupes via Google Apps Script...")
        
        req = urllib.request.Request(APPS_SCRIPT_URL)
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                json_response = json.loads(body)
                
                # Récupère le dictionnaire {"nutria_core_it@mxns.com": [...], ...}
                data = json_response.get("data", {})
                
                cleaned_data = {}
                for group_email, members in data.items():
                    cleaned_data[group_email] = [m.strip().lower() for m in members]
                    
                return cleaned_data
            else:
                print(f"[APPS SCRIPT ERROR] Code HTTP: {response.status}")
                return None
                
    except Exception as e:
        print(f"[APPS SCRIPT ERROR] Impossible de contacter Apps Script: {e}")
        return None

    # -------------------------------------------------------------------------
    # OPTION B : MODE DÉFINITIF (via Service Account Google Directory API)
    # TODO: Décommenter le bloc ci-dessous et commenter le bloc OPTION A
    #       une fois la validation faite par David.
    # -------------------------------------------------------------------------
    """
    import google.auth
    from googleapiclient.discovery import build

    group_results = {}
    try:
        credentials, _ = google.auth.default(
            scopes=['https://www.googleapis.com/auth/admin.directory.group.readonly']
        )
        service = build('admin', 'directory_v1', credentials=credentials)

        for role_name, group_email in TARGET_GROUPS.items():
            try:
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
    """

def get_google_groups():
    """Gère le cache Python pour éviter de solliciter le réseau à chaque requête."""
    current_time = time.time()
    
    # 1. Utilisation du cache s'il est encore valide
    if cache["data"] is not None and (current_time - cache["last_updated"] < CACHE_DURATION):
        print("-> Fetching group roles from Python CACHE")
        return cache["data"]
    
    # 2. Rafraîchissement des données
    print("-> Refreshing group roles...")
    fresh_data = fetch_group_members_from_google()
    
    if fresh_data is not None:
        cache["data"] = fresh_data
        cache["last_updated"] = current_time
        print("-> Group cache successfully updated")
        return cache["data"]
    
    # Fallback sur le dernier cache en cas de problème réseau
    return cache["data"] or {}