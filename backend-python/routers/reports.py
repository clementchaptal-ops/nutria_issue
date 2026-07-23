import os
import json
import io
import zipfile
import tempfile
import vertexai
from vertexai.generative_models import GenerativeModel, Tool, Part, grounding
from fpdf import FPDF
from google.cloud import storage

from config.database import get_db_connection
from .issues import BUCKET_NAME, make_signed_url

DATASTORE_ID = "nutria-knowledge-base_1784796187534"


def extract_logs_from_zip(bucket, zip_blob_path: str) -> str:
    """Downloads a ZIP from GCS and extracts text from .log and .txt files in RAM."""
    try:
        blob = bucket.blob(zip_blob_path)
        if not blob.exists():
            return "No ZIP log file found in GCS for this ticket."

        zip_bytes = blob.download_as_bytes()
        extracted_logs = ""

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for file_info in z.infolist():
                if file_info.filename.lower().endswith(('.log', '.txt', '.json', '.xml')):
                    with z.open(file_info) as f:
                        content = f.read().decode('utf-8', errors='ignore')
                        extracted_logs += f"\n--- LOG FILE: {file_info.filename} ---\n"
                        extracted_logs += content[:10000] + "\n"

        return extracted_logs if extracted_logs else "ZIP file contained no readable log files."
    except Exception as e:
        return f"Error extracting ZIP logs: {str(e)}"


def get_ticket_media_parts(cursor, issue_id: int) -> list:
    """
    Fetches image and video attachments linked to the ticket
    and creates Vertex AI Part objects referencing GCS URIs.
    """
    media_parts = []
    try:
        qry = """
            SELECT attachment_name, attachment_type, url_path
            FROM c_issue_attachment
            WHERE id_issue = %s AND (removed != 'T' OR removed IS NULL)
        """
        cursor.execute(qry, (issue_id,))
        rows = cursor.fetchall()

        for row in rows:
            att_name, att_type, url_path = row
            att_type = (att_type or "").upper()
            
            # Map MIME types for Vertex AI
            mime_type = None
            if "IMAGE" in att_type or att_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                mime_type = "image/png" if att_name.lower().endswith('.png') else "image/jpeg"
            elif "VIDEO" in att_type or att_name.lower().endswith(('.mp4', '.webm')):
                mime_type = "video/mp4"

            if mime_type and url_path and "storage.googleapis.com" in url_path:
                # Convert public/signed HTTP URL to internal GCS URI (gs://bucket/path)
                parts = url_path.replace("https://storage.googleapis.com/", "").split("?", 1)[0]
                gcs_uri = f"gs://{parts}"
                
                # Add native multimodal reference for Gemini
                media_parts.append(
                    Part.from_uri(uri=gcs_uri, mime_type=mime_type)
                )
    except Exception as e:
        print(f"Warning: Could not load media attachments: {e}")
        
    return media_parts


def generate_ai_analysis(issue_id: int, current_user: dict, client_ip: str) -> tuple:
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    try:
        cursor = connection.cursor()
        
        # 1. Fetch contextual data from Oracle / DB
        qry = """
            SELECT title, issue_type, description, network_info, citrix_session, working_dir 
            FROM c_issue 
            WHERE id_issue = %s
        """
        cursor.execute(qry, (issue_id,))
        row = cursor.fetchone()
        
        if not row:
            return {"error": "error.issue_not_found"}, 404
            
        title, issue_type, description, network_info, citrix_session, working_dir = row

        # 2. Extract logs from ZIP in RAM
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        logs_zip_path = f"tickets/ticket_{issue_id}/Issue_{issue_id}_Logs.zip"
        raw_logs_text = extract_logs_from_zip(bucket, logs_zip_path)

        # 3. Retrieve attached Photos and Videos as multimodal Parts
        media_parts = get_ticket_media_parts(cursor, issue_id)

        # 4. Initialize Vertex AI and RAG Tool (Data Store)
        project_id = os.environ.get("GCP_PROJECT_ID", "nutria-issue")
        vertexai.init(project=project_id, location="europe-west1")

        datastore_path = f"projects/{project_id}/locations/global/collections/default_collection/dataStores/{DATASTORE_ID}"
        
        retrieval_tool = Tool.from_retrieval(
            retrieval=grounding.Retrieval(
                source=grounding.VertexAISearch(datastore=datastore_path)
            )
        )

        model = GenerativeModel(
            model_name="gemini-1.5-flash",
            tools=[retrieval_tool]
        )

        # 5. Construct Prompt
        prompt_text = f"""
        You are an expert IT Support AI for a LIMS application called LabWare.
        Use the provided Vertex AI Search tool to find relevant troubleshooting procedures from our knowledge base if needed.
        
        Analyze the following ticket data, raw logs, and attached media (screenshots/videos if provided) to determine the root cause:
        
        Ticket Title: {title}
        Reported Type: {issue_type}
        Description: {description}
        Citrix Session: {citrix_session}
        Network Diagnostics: {network_info}
        
        RAW SYSTEM LOGS EXTRACTED FROM ZIP:
        {raw_logs_text}
        
        Respond STRICTLY in valid JSON format with the following keys:
        - "category": A short technical category (e.g., "NETWORK_TIMEOUT", "DB_LOCK", "CITRIX_CRASH").
        - "confidence": A percentage (e.g., "95%").
        - "summary": A clear, professional summary explaining the probable root cause based on logs, screenshots/videos, and reference manuals.
        - "similar_tickets": An array of random integer IDs (mock data for now, e.g., [102, 108]).
        """

        # Combine text prompt with image and video parts!
        contents = [prompt_text] + media_parts

        response = model.generate_content(contents)
        
        # Clean response string to ensure valid JSON
        raw_json = response.text.replace("```json", "").replace("```", "").strip()
        ai_result = json.loads(raw_json)

        # 6. Generate PDF Report
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", style="B", size=16)
        pdf.cell(0, 10, txt=f"NUTRIA AI Analysis Report - Ticket #{issue_id}", ln=True, align='C')
        
        pdf.set_font("Helvetica", size=12)
        pdf.ln(10)
        pdf.cell(0, 10, txt=f"Category: {ai_result.get('category')} (Confidence: {ai_result.get('confidence')})", ln=True)
        pdf.ln(5)
        
        pdf.set_font("Helvetica", style="B", size=12)
        pdf.cell(0, 10, txt="Root Cause Summary:", ln=True)
        pdf.set_font("Helvetica", size=11)
        pdf.multi_cell(0, 8, txt=ai_result.get('summary'))
        
        # Save temp PDF
        temp_pdf_fd, temp_pdf_path = tempfile.mkstemp(suffix=".pdf")
        os.close(temp_pdf_fd)
        pdf.output(temp_pdf_path)

        # 7. Upload JSON and PDF to GCS
        json_blob_path = f"tickets/ticket_{issue_id}/ai/ai_analysis.json"
        json_blob = bucket.blob(json_blob_path)
        json_blob.upload_from_string(json.dumps(ai_result), content_type="application/json")

        pdf_blob_path = f"tickets/ticket_{issue_id}/ai/ai_analysis.pdf"
        pdf_blob = bucket.blob(pdf_blob_path)
        pdf_blob.upload_from_filename(temp_pdf_path, content_type="application/pdf")

        os.remove(temp_pdf_path)

        # 8. Generate Signed URL for PDF download
        public_pdf_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{pdf_blob_path}"
        signed_pdf_url = make_signed_url(public_pdf_url)
        
        ai_result["pdf_download_url"] = signed_pdf_url

        return {
            "message": "success.ai_analysis_generated",
            "data": ai_result
        }, 200

    except json.JSONDecodeError:
        return {"error": "error.invalid_json_format_from_ai"}, 500
    except Exception as e:
        return {"error": "error.ai_generation_failed", "details": str(e)}, 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()