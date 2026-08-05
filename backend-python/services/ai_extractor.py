import io
import os
import re  
import zipfile
from google import genai
from google.genai import types
from google.cloud import storage

from config.database import get_db_connection
from services.state_manager import trigger_state_json_update

BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")
PROJECT_ID = os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "nutria-issue"))

LOCATION_GEMINI = "us-central1"
DATASTORE_ID = os.environ.get("DATASTORE_ID", "nutria-knowledge-base_1784796187534")

MODEL_NAME = "gemini-2.5-flash"

client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION_GEMINI)
storage_client = storage.Client()


def _clean_blob_name(public_url_or_path: str) -> str:
    """
    Extracts the relative GCS object path (blob name) from a full GCS public URL or relative path.

    Args:
        public_url_or_path (str): The public HTTP URL or existing relative GCS path.

    Returns:
        str: The cleaned relative path inside the storage bucket.
    """
    prefix = f"https://storage.googleapis.com/{BUCKET_NAME}/"
    if public_url_or_path.startswith(prefix):
        return public_url_or_path.replace(prefix, "")
    return public_url_or_path


def extract_text_from_zip(raw_blob_name: str) -> str:
    """
    Downloads a ZIP archive from Google Cloud Storage and extracts contents of text and log files.

    Args:
        raw_blob_name (str): The raw blob name of the ZIP file in GCS.

    Returns:
        str: Combined text extracted from matching files, truncated if individual files exceed limit.
    """
    try:
        blob_path = _clean_blob_name(raw_blob_name)
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_path)
        zip_bytes = blob.download_as_bytes()

        extracted_text = ""
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for filename in z.namelist():
                if filename.lower().endswith(('.log', '.txt')):
                    with z.open(filename) as f:
                        text = f.read().decode('utf-8', errors='ignore')
                        # Truncate large files to prevent exceeding LLM context limits
                        if len(text) > 50000:
                            text = "[... TRONQUÉ ...] \n" + text[-50000:]
                        extracted_text += f"\n--- Fichier {filename} ---\n{text}\n"

        return extracted_text
    except Exception as e:
        print(f"[AI EXTRACTOR ZIP ERROR]: {str(e)}")
        return f"[Erreur lecture ZIP : {str(e)}]"


def analyze_issue_attachments_and_save(issue_id: int):
    """
    Analyzes all valid attachments for a given issue using Gemini with Vertex AI Search grounding.

    Retrieves issue attachments (images, videos, ZIP logs, documents) from the database,
    downloads and formats them, queries the Gemini model with a LIMS expert system prompt,
    cleans up any inline search citations, updates the database with the generated summary,
    and triggers a state update.

    Args:
        issue_id (int): The unique identifier of the issue to analyze.
    """
    connection = get_db_connection()
    if not connection:
        print("[AI EXTRACTOR ERROR]: Connexion BDD impossible")
        return

    cursor = None
    try:
        cursor = connection.cursor()

        # Retrieve issue title for prompt context
        cursor.execute("SELECT title FROM c_issue WHERE id_issue = %s", (issue_id,))
        issue_row = cursor.fetchone()
        issue_title = issue_row[0] if issue_row else f"Issue #{issue_id}"

        # Fetch active root-level attachments
        qry = """
            SELECT attachment_name, attachment_type, url_path 
            FROM c_issue_attachment 
            WHERE id_issue = %s 
              AND id_comment IS NULL 
              AND (removed != 'T' OR removed IS NULL)
        """
        cursor.execute(qry, (issue_id,))
        attachments = cursor.fetchall()

        if not attachments:
            return

        parts_for_gemini = []

        # Process each attachment dynamically based on its designated type
        for att_name, att_type, public_url in attachments:
            blob_name = _clean_blob_name(public_url)
            gcs_uri = f"gs://{BUCKET_NAME}/{blob_name}"

            if att_type == 'IMAGE':
                parts_for_gemini.append(types.Part.from_uri(file_uri=gcs_uri, mime_type="image/jpeg"))

            elif att_type == 'VIDEO':
                parts_for_gemini.append(types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4"))

            elif att_type == 'ZIP':
                zip_logs = extract_text_from_zip(blob_name)
                if zip_logs.strip():
                    parts_for_gemini.append(types.Part.from_text(text=f"--- LOGS DU ZIP ({att_name}) ---\n{zip_logs}"))

            elif att_type == 'DOCUMENT':
                if att_name.lower().endswith('.pdf'):
                    parts_for_gemini.append(types.Part.from_uri(file_uri=gcs_uri, mime_type="application/pdf"))
                else:
                    blob = storage_client.bucket(BUCKET_NAME).blob(blob_name)
                    doc_text = blob.download_as_string().decode('utf-8', errors='ignore')
                    parts_for_gemini.append(types.Part.from_text(text=f"--- DOCUMENT ({att_name}) ---\n{doc_text[:20000]}"))

        if not parts_for_gemini:
            return

        prompt = f"""
        You are a LIMS AIOps expert. 
        Here are the files (images, videos, logs, documents) associated with support ticket #{issue_id} (Title: "{issue_title}").
        You are an expert log analyzer. Analyze the ENTIRE provided log file thoroughly to identify root causes, cascading errors, and key failure points.
        Analyze these attachments and generate a precise technical summary. 
        
        STRICT RULES:
        - Keep it concise: 3 to 4 sentences maximum.
        - You MUST explicitly mention any visible error codes or messages (e.g., ORA, HTTP, Citrix, LabWare).
        - State the probable root cause of the malfunction.
        - State if this error matches any known procedure or documented issue in the Nutria Knowledge base.
        - Do not include any introductions, pleasantries, or conversational filler. Output only the summary.

        CRITICAL INSTRUCTIONS:
        1. Output language: ENGLISH ONLY.
        2. Citation/Reference format: DO NOT include any line numbers, citations, or brackets like or [X] under any circumstances.
        3. Summary scope: Synthesize all major anomalies (cURL errors, Oracle ORA codes, OS errors, memory access violations ...) found across the entire log file into a clear, concise executive summary.
        """
        parts_for_gemini.append(types.Part.from_text(text=prompt))

        # Setup Vertex AI Search grounding tools using the specified datastore resource path
        tools = []
        try:
            datastore_resource_path = f"projects/{PROJECT_ID}/locations/global/collections/default_collection/dataStores/{DATASTORE_ID}"
            datastore_tool = types.Tool(
                retrieval=types.Retrieval(
                    vertex_ai_search=types.VertexAISearch(
                        datastore=datastore_resource_path
                    )
                )
            )
            tools.append(datastore_tool)
        except Exception as e:
            print(f"[WARNING]: Impossibilité d'attacher le datastore : {e}")

        # Execute multimodal content generation request via official client SDK
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=parts_for_gemini,
            config=types.GenerateContentConfig(
                tools=tools if tools else None,
                temperature=0.2
            )
        )
        
        raw_ai_summary = response.text.strip()

        # Sanitize and strip out grounding search citations from the raw model response
        cleaned_summary = re.sub(r'\[(?:cite:\s*)?\d+(?:,\s*\d+)*\]', '', raw_ai_summary)
        cleaned_summary = re.sub(r'\[\d+\]', '', cleaned_summary)
        cleaned_summary = " ".join(cleaned_summary.split()) 

        # Persist generated summary, commit database changes, and trigger global state notification
        update_qry = "UPDATE c_issue SET ai_attachments_summary = %s WHERE id_issue = %s"
        cursor.execute(update_qry, (cleaned_summary, issue_id))
        connection.commit()
        
        trigger_state_json_update()
        
        print(f"[AI EXTRACTOR SUCCESS]: Résumé généré pour l'issue #{issue_id}")

    except Exception as e:
        if connection:
            connection.rollback()
        print(f"[AI EXTRACTOR ERROR - Issue #{issue_id}]: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()