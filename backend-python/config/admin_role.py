import requests
import time

# Configuration
GOOGLE_APP_URL = "https://script.google.com/macros/s/AKfycbwh4FglO3vXZJKB-_WI42m8xsc5uCVH6VluFsGg0C8eBr5zVRorAlk-devE69Cf4125mw/exec"

# In-memory caching system
cache = {
    "data": None,
    "last_updated": 0
}
CACHE_DURATION = 3600  # Cache lifetime in seconds (1 hour here)

def get_google_groups():
    current_time = time.time()
    
    # 1. Check if the cache is valid (data present AND less than 1 hour old)
    if cache["data"] and (current_time - cache["last_updated"] < CACHE_DURATION):
        print("-> Fetching data from Python CACHE")
        return cache["data"]
    
    # 2. If the cache is empty or expired, query Google
    print("-> Cache expired. Querying Google Apps Script...")
    try:
        # Simple request without security parameters
        response = requests.get(GOOGLE_APP_URL)
        response.raise_for_status() 
        
        result = response.json()
        
        # If Google responds successfully, update the cache
        if result.get("status") in ["success", "partial_or_error"]:
            cache["data"] = result
            cache["last_updated"] = current_time
            print("-> Cache successfully updated")
            return cache["data"]
        else:
            print("Error returned by the API:", result)
            return None
            
    except Exception as e:
        print("Critical error during Python request:", e)
        # In case of failure, return the old cache if it exists
        return cache["data"]

# Quick test
if __name__ == "__main__":
    data = get_google_groups()
    print(data)