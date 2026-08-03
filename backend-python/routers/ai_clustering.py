import json
import os
import vertexai
from vertexai.generative_models import GenerativeModel
from config.database import get_db_connection

# --- CONFIGURATION GCP & VERTEX AI ---
BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")
PROJECT_ID = os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "nutria-issue"))

# 💡 FORCER us-central1 pour éviter les erreurs 404 sur les modèles Gemini Vertex AI
LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
MODEL_NAME = "gemini-1.5-flash"

# Initialisation unique du SDK Vertex AI
if PROJECT_ID:
    vertexai.init(project=PROJECT_ID, location=LOCATION)


def generate_suggested_regroupements():
    """
    1. Sélectionne toutes les issues IN PROGRESS et ACT KNOWLEDGE.
    2. Construit le JSON Global (Métadonnées + ai_attachments_summary).
    3. Gemini détecte les anomalies communes et crée les regroupements suggérés.
    """
    connection = get_db_connection()
    if not connection:
        return {"error": "error.database_connection"}, 500

    cursor = None
    try:
        cursor = connection.cursor()

        # 1. Sélection des issues actives
        qry = """
            SELECT id_issue, title, issue_type, description, status,
                   current_project, current_batch, current_sample, current_analysis,
                   current_analysis_variation, current_customer, current_pc,
                   citrix_session, environment, ai_attachments_summary
            FROM c_issue
            WHERE status IN ('IN PROGRESS', 'ACT KNOWLEDGE')
            ORDER BY id_issue DESC
        """
        cursor.execute(qry)
        rows = cursor.fetchall()

        if not rows:
            return {"message": "Aucune issue active à analyser."}, 200

        # 2. Construction du JSON Global
        global_issues = []
        for r in rows:
            global_issues.append({
                "id_issue": r[0],
                "title": r[1] or "",
                "issue_type": r[2] or "",
                "description": r[3] or "",
                "status": r[4],
                "project": r[5] or "",
                "batch": r[6] or "",
                "sample": r[7],
                "analysis": r[8] or "",
                "variation": r[9] or "",
                "customer": r[10] or "",
                "pc": r[11] or "",
                "citrix": r[12] or "",
                "environment": r[13] or "",
                "ai_attachments_summary": r[14] or "Aucune analyse de fichier."
            })

        # 3. Prompt pour Gemini
        prompt = f"""
        You are an AIOps incident correlation engine for a LIMS / Citrix platform.
        Here is the complete Global JSON export of currently open support tickets:
        {json.dumps(global_issues, ensure_ascii=False, indent=2)}

        ANALYSIS AND CLUSTERING INSTRUCTIONS:
        1. Analyze all provided data across the tickets (title, description, ip_adress, ip_config, ping, citrix_session, current_pc, current_batch, current_analysis, ai_attachments_summary).
        2. Detect strong technical correlations, such as:
           - Same Citrix server / Workstation (`current_pc`, `citrix_session`)
           - Same subnet or IP/ping issues (`ip_adress`, `ping`)
           - Same analysis batch (`current_batch`, `current_analysis`)
           - Same root cause extracted from attachments (`ai_attachments_summary`)
        
        STRICT RULES:
        - A group MUST contain AT LEAST 2 tickets.
        - Only create a group if the technical correlation is strong and highly probable.
        - The generated text for "title" and "reasoning" MUST be written in French.
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

        # Utilisation de la variable MODEL_NAME ("gemini-1.5-flash")
        model = GenerativeModel(MODEL_NAME)
        response = model.generate_content(prompt)

        raw_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(raw_text)

        created_groups_count = 0

        # 4. Insertion des suggestions en base de données
        for group in data.get("suggested_groups", []):
            issue_ids = group.get("issue_ids", [])
            if len(issue_ids) < 2:
                continue

            # Création du regroupement avec status = 'SUGGESTED'
            insert_reg_qry = """
                INSERT INTO c_issue_regroupment (title, description, ai_reasoning, status, created_by, created_on, changed_on)
                VALUES (%s, %s, %s, 'SUGGESTED', 'SYSTEM_AI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id_regroupment
            """
            cursor.execute(insert_reg_qry, (group.get("title"), group.get("reasoning"), group.get("reasoning")))
            reg_id = cursor.fetchone()[0]

            # Liaisons avec link_status = 'AI_SUGGESTION'
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