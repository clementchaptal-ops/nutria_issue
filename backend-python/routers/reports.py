from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import os
import json
from google import genai
from google.genai import types
from config.database import get_db_connection
from .security import get_current_user

router = APIRouter(
    prefix="/api/reports",
    tags=["AI & Reports"]
)

# Schéma Pydantic pour la sauvegarde
class ReportSave(BaseModel):
    report_data: dict

# =====================================================================
# ✨ 1. GÉNÉRATION DU RAPPORT VIA GEMINI (À LA VOLÉE)
# =====================================================================
@router.get("/{issue_id}/generate")
def generate_ai_report(issue_id: int, current_user: dict = Depends(get_current_user)):
    """Interroge Gemini pour créer un pré-remplissage structuré en JSON basé sur le ticket."""
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "TA_CLE_API_GEMINI_ICI")
    
    if not GEMINI_API_KEY or GEMINI_API_KEY == "TA_CLE_API_GEMINI_ICI":
        raise HTTPException(status_code=500, detail="Gemini API Key is missing.")

    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
    try:
        cursor = connection.cursor()
        
        # Collecte des données du ticket et du contexte LIMS
        ticket_qry = """
            SELECT title, issue_type, description, criticity, frequency,
                   current_project, current_batch, current_sample, 
                   current_analysis, current_analysis_variation, current_customer
            FROM c_issue 
            WHERE id_issue = :1
        """
        cursor.execute(ticket_qry, [issue_id])
        t_row = cursor.fetchone()
        if not t_row:
            raise HTTPException(status_code=404, detail="Ticket not found.")
            
        # Collecte de l'historique des commentaires
        cursor.execute("""
            SELECT user_name, comment_text 
            FROM c_issue_comments 
            WHERE id_issue = :1 
            ORDER BY created_on ASC
        """, [issue_id])
        discussion = "\n".join([f"{r[0]}: {r[1]}" for r in cursor.fetchall()])
            
        # Injection des variables dans le prompt
        context = f"""
        TICKET DETAILS:
        Title: {t_row[0]} | Type: {t_row[1]} | Criticity: {t_row[3]} | Frequency: {t_row[4]}
        Description: {t_row[2]}
        
        LIMS CONTEXT:
        Project: {t_row[5]} | Batch: {t_row[6]} | Sample: {t_row[7]}
        Analysis: {t_row[8]} | Variation: {t_row[9]} | Customer: {t_row[10]}
        
        DISCUSSION HISTORY:
        {discussion if discussion else 'Aucun message échangé.'}
        """

        client = genai.Client(api_key=GEMINI_API_KEY)
        system_instruction = """
        Tu es un ingénieur support informatique expert de l'application LabWare LIMS. Ton rôle est d'analyser les données du ticket industriel fourni et de rédiger un rapport de diagnostic clair et concis.
        Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans aucun bloc de code Markdown autour (pas de ```json ... ```), en utilisant très exactement ces trois clés et rédigé en français :
        {
          "synthesis": "Résumé clair et pro du problème rencontré par l'utilisateur.",
          "technical_analysis": "Analyse technique de la cause probable (liée au contexte LIMS ou à l'infrastructure s'il y a des indices).",
          "action_plan": "Plan d'action précis avec les prochaines étapes de résolution."
        }
        """
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=context,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        
        # Nettoyage de sécurité
        clean_json = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_json)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")
    finally:
        cursor.close()
        connection.close()

# =====================================================================
# 💾 2. SAUVEGARDE DU RAPPORT MODIFIÉ EN BASE
# =====================================================================
@router.put("/{issue_id}")
def save_diagnostic_report(issue_id: int, payload: ReportSave, current_user: dict = Depends(get_current_user)):
    """Enregistre le JSON du rapport modifié par l'utilisateur dans le CLOB de la table c_issue."""
    connection = get_db_connection()
    if not connection:
        raise HTTPException(status_code=500, detail="Database connection error.")
        
    try:
        cursor = connection.cursor()
        json_string = json.dumps(payload.report_data)
        
        cursor.execute("UPDATE c_issue SET diagnostic_report = :1 WHERE id_issue = :2", [json_string, issue_id])
        connection.commit()
        return {"message": "Report successfully saved."}
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        connection.close()