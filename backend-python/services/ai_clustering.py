import json
import os
from google import genai
from google.genai import types
from config.database import get_db_connection

BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")
PROJECT_ID = os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "nutria-issue"))

LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
MODEL_NAME = "gemini-2.5-flash"
STATE_FILE_PATH = "system/active_issues_state.json"

client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


def generate_suggested_regroupements(creator_id: str):
    """
    Fetch active issues from GCS, analyze correlations using Gemini, and store
    suggested clusters in the PostgreSQL database.

    Args:
        creator_id (str): The identifier of the creator initiating the clustering process.

    Returns:
        tuple: A dictionary response with status message/data and an HTTP status code.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    cursor = None
    try:
        cursor = connection.cursor()

        # Build GCS URI pointing to the active issues JSON state file
        gcs_uri = f"gs://{BUCKET_NAME}/{STATE_FILE_PATH}"

        prompt = f"""
        You are an AIOps incident correlation engine for a LIMS / Citrix platform.
        Analyze the attached JSON file containing the complete export of currently open support tickets.

        ANALYSIS AND CLUSTERING INSTRUCTIONS:
        1. Analyze all provided data across the tickets (title, description, ip_adress, ip_config, ping, citrix_session, current_pc, current_batch, current_analysis, ai_attachments_summary).
        2. Detect strong technical correlations, such as:.
           - Same Citrix server / Workstation (`current_pc`, `citrix_session`)
           - Same physical laboratory or geographic site (`lab`, `location`)
           - Same subnet or IP/ping issues (`ip_adress`, `ping`)
           - Same analysis batch (`current_batch`, `current_analysis`)
           - Same root cause extracted from attachments (`ai_attachments_summary`)
           
        
        STRICT RULES:
        - A group MUST contain AT LEAST 2 tickets.
        - Only create a group if the technical correlation is strong and highly probable.
        - The "title" and "reasoning" MUST be in English.
        - Do not output any markdown formatting (e.g., do not use ```json). Output RAW JSON only.

        MANDATORY RESPONSE FORMAT (Strict JSON):
        {{
          "suggested_groups": [
            {{
              "title": "Explanatory title of the issue (e.g., Crash Citrix sur AWPEUCTXVDRAA03)",
              "reasoning": "Detailed explanation of the correlation (e.g., Les tickets 1 et 8 partagent le même batch BR_2JMAM et plantent sur la méthode 13C-12C-RATIO)",
              "issue_ids": [1, 8]
            }}
          ]
        }}
        """

        # Prepare GenAI payload with GCS file reference and analysis instructions
        parts_for_gemini = [
            types.Part.from_uri(file_uri=gcs_uri, mime_type="text/plain"), 
            types.Part.from_text(text=prompt)
        ]

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=parts_for_gemini,
            config=types.GenerateContentConfig(
                temperature=0.1,  
                response_mime_type="application/json" 
            )
        )

        # Clean markdown wrappers from LLM response before parsing JSON
        raw_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(raw_text)

        created_groups_count = 0

        for group in data.get("suggested_groups", []):
            issue_ids = group.get("issue_ids", [])
            if len(issue_ids) < 2:
                continue

            # Insert suggested cluster into the regroupment table
            insert_reg_qry = """
                INSERT INTO c_issue_regroupment (title, description, ai_reasoning, status, created_by, created_on, changed_on)
                VALUES (%s, %s, %s, 'SUGGESTED', %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id_regroupment
            """
            cursor.execute(insert_reg_qry, (group.get("title"), group.get("reasoning"), group.get("reasoning"), creator_id))
            reg_id = cursor.fetchone()[0]

            # Associate related issues to the newly created regroupment group
            for i_id in issue_ids:
                insert_link_qry = """
                    INSERT INTO c_link_issue_regroupment (id_regroupment, id_issue, link_status)
                    VALUES (%s, %s, 'AI_SUGGESTION')
                    ON CONFLICT (id_regroupment, id_issue) DO NOTHING
                """
                cursor.execute(insert_link_qry, (reg_id, i_id))

            created_groups_count += 1

        connection.commit()
        return {
            "message": "success.ai_clustering_completed",
            "suggested_groups_created": created_groups_count
        }, 200

    except Exception as e:
        if connection:
            connection.rollback()
        print(f"[AI CLUSTERING ERROR]: {str(e)}")
        return {"error": "error.ai_clustering_failed", "details": str(e)}, 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()