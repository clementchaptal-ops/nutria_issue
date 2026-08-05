import time
import os
import json
import urllib.request

TARGET_GROUPS = {
    "IT_TEAM": "nutria_core_it@mxns.com",
    "LOCAL_ADMIN": "nutria-local_admin@mxns.com"
}

cache = {
    "data": None,
    "last_updated": 0
}
CACHE_DURATION = 3600

APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh4FglO3vXZJKB-_WI42m8xsc5uCVH6VluFsGg0C8eBr5zVRorAlk-devE69Cf4125mw/exec"

def fetch_group_members_from_google():
    """
    Fetch Google Group membership details via the configured external Web App.

    Queries the Google Apps Script endpoint using a standard HTTP request, 
    processes the JSON response, and normalizes membership emails to lowercase.

    Returns:
        dict: Mapping of group email addresses to lists of normalized member emails,
              or None if the fetch operation fails.
    """
    try:
        print("--> [TEMPORAIRE] Lecture des groupes via Google Apps Script...")
        
        req = urllib.request.Request(APPS_SCRIPT_URL)
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                json_response = json.loads(body)
                
                # Extract and normalize membership collections
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

def get_google_groups():
    """
    Retrieve Google Group rosters, implementing a TTL-based memory caching strategy.

    Maintains group rosters in-memory for the duration of CACHE_DURATION.
    Triggers an external refresh when the cache expires, and falls back to
    stale cached data if the external request fails.

    Returns:
        dict: Mapping of group email addresses to member email arrays.
    """
    current_time = time.time()
    
    # Retrieve rosters from memory if TTL has not expired
    if cache["data"] is not None and (current_time - cache["last_updated"] < CACHE_DURATION):
        print("-> Fetching group roles from Python CACHE")
        return cache["data"]
    
    # Retrieve fresh group membership rosters
    print("-> Refreshing group roles...")
    fresh_data = fetch_group_members_from_google()
    
    if fresh_data is not None:
        cache["data"] = fresh_data
        cache["last_updated"] = current_time
        print("-> Group cache successfully updated")
        return cache["data"]
    
    # Fallback to expired cache when external query fails
    return cache["data"] or {}