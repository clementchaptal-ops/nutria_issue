import os
import json
import tempfile
import vertexai
from vertexai.generative_models import GenerativeModel
from fpdf import FPDF
from google.cloud import storage

from config.database import get_db_connection
# Adjust the import path below based on where you place this file
from routers.issues import BUCKET_NAME, make_signed_url

def generate_ai_analysis(issue_id: int, current_user: dict, client_ip: str) -> tuple:
    """
    Analyzes ticket logs and database context via Google Gemini (Vertex AI),
    generates a JSON and a PDF report, and stores them securely in GCS.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    try:
        cursor = connection.cursor()
        
        # Fetch contextual data from Oracle
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

        # Initialize Vertex AI
        project_id = os.environ.get("GCP_PROJECT_ID", "your-gcp-project-id")
        vertexai.init(project=project_id, location="europe-west1")
        
        # Using Gemini 1.5 Flash for fast and cost-effective text analysis
        model = GenerativeModel("gemini-1.5-flash")

        # The prompt forces Gemini to act as an IT expert and return a pure JSON string
        prompt = f"""
        You are an expert IT Support AI for a LIMS application called LabWare.
        Analyze the following ticket data and provide a strict JSON response.
        
        Ticket Title: {title}
        Reported Type: {issue_type}
        Description: {description}
        Citrix Session: {citrix_session}
        Network Diagnostics: {network_info}
        
        Respond STRICTLY in valid JSON format with the following keys:
        - "category": A short technical category (e.g., "NETWORK_TIMEOUT", "DB_LOCK", "CITRIX_CRASH").
        - "confidence": A percentage (e.g., "95%").
        - "summary": A clear, professional summary explaining the probable root cause.
        - "similar_tickets": An array of random integer IDs (mock data for now, e.g., [102, 108]).
        """

        response = model.generate_content(prompt)
        
        # Clean the response to ensure it is valid JSON 
        raw_json = response.text.replace("```json", "").replace("```", "").strip()
        ai_result = json.loads(raw_json)

        # Generate the PDF Report
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
        
        # Use a temporary file to save the PDF before uploading to GCS
        temp_pdf_fd, temp_pdf_path = tempfile.mkstemp(suffix=".pdf")
        os.close(temp_pdf_fd)
        pdf.output(temp_pdf_path)

        # Upload JSON and PDF to Google Cloud Storage
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        # Upload JSON
        json_blob_path = f"tickets/ticket_{issue_id}/ai/ai_analysis.json"
        json_blob = bucket.blob(json_blob_path)
        json_blob.upload_from_string(json.dumps(ai_result), content_type="application/json")

        # Upload PDF
        pdf_blob_path = f"tickets/ticket_{issue_id}/ai/ai_analysis.pdf"
        pdf_blob = bucket.blob(pdf_blob_path)
        pdf_blob.upload_from_filename(temp_pdf_path, content_type="application/pdf")

        # Cleanup local temp file
        os.remove(temp_pdf_path)

        # Generate a signed URL for the newly created PDF
        public_pdf_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{pdf_blob_path}"
        signed_pdf_url = make_signed_url(public_pdf_url)
        
        # Add the signed URL into the response payload
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