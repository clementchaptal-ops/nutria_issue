import requests
import time

# Configuration
GOOGLE_APP_URL = "https://script.google.com/macros/s/AKfycbwh4FglO3vXZJKB-_WI42m8xsc5uCVH6VluFsGg0C8eBr5zVRorAlk-devE69Cf4125mw/exec"

# Système de cache en mémoire
cache = {
    "data": None,
    "last_updated": 0
}
CACHE_DURATION = 3600  # Durée de vie du cache en secondes (ici 1 heure)

def get_google_groups():
    current_time = time.time()
    
    # 1. Vérifier si le cache est valide (données présentes ET moins de 1h)
    if cache["data"] and (current_time - cache["last_updated"] < CACHE_DURATION):
        print("-> Récupération des données depuis le CACHE Python")
        return cache["data"]
    
    # 2. Si le cache est vide ou expiré, on interroge Google
    print("-> Cache expiré. Interrogation de Google Apps Script...")
    try:
        # Appel simple sans paramètre de sécurité
        response = requests.get(GOOGLE_APP_URL)
        response.raise_for_status() 
        
        result = response.json()
        
        # Si Google répond avec succès, on met à jour le cache
        if result.get("status") in ["success", "partial_or_error"]:
            cache["data"] = result
            cache["last_updated"] = current_time
            print("-> Cache mis à jour avec succès")
            return cache["data"]
        else:
            print("Erreur renvoyée par l'API :", result)
            return None
            
    except Exception as e:
        print("Erreur critique lors de la requête Python :", e)
        # En cas de panne, on renvoie l'ancien cache s'il existe
        return cache["data"]

# Test rapide
if __name__ == "__main__":
    donnees = get_google_groups()
    print(donnees)