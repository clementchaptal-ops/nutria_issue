import io
import os
import zipfile
import vertexai
from vertexai.generative_models import GenerativeModel, Part, Tool, grounding
from google.cloud import storage

from config.database import get_db_connection

# --- CONFIGURATION GCP & VERTEX AI ---
BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")
PROJECT_ID = os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "nutria-issue"))

# Utilisation de la région par défaut GCP
LOCATION = os.environ.get("GCP_LOCATION", "europe-west1")
DATASTORE_ID = os.environ.get("DATASTORE_ID", "nutria-knowledge-base_1784796187534")

# Version exacte reconnue par Vertex AI
MODEL_NAME = "gemini-1.5-flash-002"

if PROJECT_ID:
    vertexai.init(project=PROJECT_ID, location=LOCATION)

storage_client = storage.Client()


def _clean_blob_name(public_url_or_path: str) -> str:
    """Extrait le chemin d'accès relatif du fichier dans le bucket GCS."""
    prefix = f"https://storage.googleapis.com/{BUCKET_NAME}/"
    if public_url_or_path.startswith(prefix):
        return public_url_or_path.replace(prefix, "")
    return public_url_or_path


def extract_text_from_zip(raw_blob_name: str) -> str:
    """Télécharge un ZIP depuis GCS et extrait les 50 000 derniers caractères des fichiers .log et .txt."""
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
                        if len(text) > 50000:
                            text = "[... TRONQUÉ ...] \n" + text[-50000:]
                        extracted_text += f"\n--- Fichier {filename} ---\n{text}\n"

        return extracted_text
    except Exception as e:
        print(f"[AI EXTRACTOR ZIP ERROR]: {str(e)}")
        return f"[Erreur lecture ZIP : {str(e)}]"


def analyze_issue_attachments_and_save(issue_id: int):
    """
    Extrait le contenu des pièces jointes d'une issue,
    consulte le Datastore Nutria Knowledge et sauvegarde le résumé dans c_issue.
    """
    connection = get_db_connection()
    if not connection:
        print("[AI EXTRACTOR ERROR]: Connexion BDD impossible")
        return

    cursor = None
    try:
        cursor = connection.cursor()

        # 1. Récupération du titre de l'issue
        cursor.execute("SELECT title FROM c_issue WHERE id_issue = %s", (issue_id,))
        issue_row = cursor.fetchone()
        issue_title = issue_row[0] if issue_row else f"Issue #{issue_id}"

        # 2. Récupération des pièces jointes actives (hors commentaires)
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

        # 3. Préparation des éléments multimédias
        for att_name, att_type, public_url in attachments:
            blob_name = _clean_blob_name(public_url)
            gcs_uri = f"gs://{BUCKET_NAME}/{blob_name}"

            if att_type == 'IMAGE':
                parts_for_gemini.append(Part.from_uri(uri=gcs_uri, mime_type="image/jpeg"))

            elif att_type == 'VIDEO':
                parts_for_gemini.append(Part.from_uri(uri=gcs_uri, mime_type="video/mp4"))

            elif att_type == 'ZIP':
                zip_logs = extract_text_from_zip(blob_name)
                if zip_logs.strip():
                    parts_for_gemini.append(Part.from_text(f"--- LOGS DU ZIP ({att_name}) ---\n{zip_logs}"))

            elif att_type == 'DOCUMENT':
                if att_name.lower().endswith('.pdf'):
                    parts_for_gemini.append(Part.from_uri(uri=gcs_uri, mime_type="application/pdf"))
                else:
                    blob = storage_client.bucket(BUCKET_NAME).blob(blob_name)
                    doc_text = blob.download_as_string().decode('utf-8', errors='ignore')
                    parts_for_gemini.append(Part.from_text(f"--- DOCUMENT ({att_name}) ---\n{doc_text[:20000]}"))

        if not parts_for_gemini:
            return

        # 4. Prompt synthétique pour l'IA
        prompt = f"""
        You are a LIMS AIOps expert. 
        Here are the files (images, videos, logs, documents) associated with support ticket #{issue_id} (Title: "{issue_title}").
        
        Analyze these attachments and generate a precise technical summary. 
        
        STRICT RULES:
        - The summary MUST be written in French.
        - Keep it concise: 3 to 4 sentences maximum.
        - You MUST explicitly mention any visible error codes or messages (e.g., ORA, HTTP, Citrix, LabWare).
        - State the probable root cause of the malfunction.
        - State if this error matches any known procedure or documented issue in the Nutria Knowledge base.
        - Do not include any introductions, pleasantries, or conversational filler. Output only the summary.
        """
        parts_for_gemini.append(Part.from_text(prompt))

        # 5. Ancrage Vertex AI Search (Nutria Knowledge Datastore)
        tools = []
        try:
            datastore_tool = Tool.from_retrieval(
                grounding.Retrieval(
                    grounding.VertexAISearch(
                        project=PROJECT_ID,
                        datastore=DATASTORE_ID,
                        location="global"
                    )
                )
            )
            tools.append(datastore_tool)
        except Exception as e:
            print(f"[WARNING]: Impossibilité d'attacher le datastore Nutria Knowledge : {e}")

        # 6. Génération via Gemini 1.5 Flash
        model = GenerativeModel(MODEL_NAME)
        response = model.generate_content(parts_for_gemini, tools=tools if tools else None)
        ai_summary = response.text.strip()

        # 7. Sauvegarde en base de données
        update_qry = "UPDATE c_issue SET ai_attachments_summary = %s WHERE id_issue = %s"
        cursor.execute(update_qry, (ai_summary, issue_id))
        connection.commit()
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