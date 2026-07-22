# Utility script for translation generation (do not deploy).
import json
import os
from deep_translator import GoogleTranslator

# 1. Automatic ABSOLUTE path calculation
script_dir = os.path.dirname(os.path.abspath(__file__))
base_path = os.path.normpath(os.path.join(script_dir, '..', '..', 'frontend-react', 'public', 'translation'))

# English is now the source, so we add 'fr' to the target list
languages = ['es', 'pl', 'pt']

def complete_dictionary(en_dict, existing_dict, translator):
    final_dict = {}
    
    for key, value in en_dict.items():
        existing_value = existing_dict.get(key) if existing_dict else None
        
        if isinstance(value, dict):
            existing_sub_dict = existing_value if isinstance(existing_value, dict) else {}
            final_dict[key] = complete_dictionary(value, existing_sub_dict, translator)
            
        elif isinstance(value, str):
            # If the translation already exists and is not empty, keep it
            if existing_value and str(existing_value).strip() != "":
                final_dict[key] = existing_value
            else:
                print(f"   -> New translation generated for [{key}]")
                final_dict[key] = translator.translate(value)
        else:
            final_dict[key] = value
            
    return final_dict

print(f"Searching for English source file in: {base_path}")

# 2. Read the English source file (New Source of Truth)
en_path = os.path.join(base_path, 'en', 'translation.json')
try:
    with open(en_path, 'r', encoding='utf-8') as f:
        en_text = json.load(f)
except FileNotFoundError:
    print(f"ERROR: English source file not found at: {en_path}")
    print("Please make sure your reference JSON is placed in public/translation/en/translation.json")
    exit()

# 3. Loop through target languages to update files
for lang in languages:
    print(f"Updating language: {lang.upper()}...")
    
    dest_path = os.path.join(base_path, lang, 'translation.json')
    existing_text = {}
    if os.path.exists(dest_path):
        try:
            with open(dest_path, 'r', encoding='utf-8') as f:
                existing_text = json.load(f)
            print(f"   Existing {lang}.json file found. Checking for new keys...")
        except Exception:
            print(f"   Could not read existing {lang}.json. Full overwrite triggered.")

    # We now translate FROM English (source='en') TO the target language
    translator = GoogleTranslator(source='en', target=lang)
    
    final_text = complete_dictionary(en_text, existing_text, translator)
        
    # 4. Save the merged file
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, 'w', encoding='utf-8') as f:
        json.dump(final_text, f, ensure_ascii=False, indent=2)

print("Success: All languages have been updated based on the English reference!")