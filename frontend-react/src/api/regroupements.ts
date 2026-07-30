import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api'

const getAuthHeaders = () => {
  const token = localStorage.getItem('nutria_token')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

// 1. Récupérer tous les regroupements
export const fetchAllRegroupements = async () => {
  return await axios.get(`${API_BASE_URL}/regroupements`, { headers: getAuthHeaders() })
}

// 2. Récupérer un regroupement par ID (Alias pour compatibilité avec RegroupementDetail.tsx)
export const fetchRegroupement = async (id: number) => {
  return await axios.get(`${API_BASE_URL}/regroupements/${id}`, { headers: getAuthHeaders() })
}
export const fetchRegroupementById = fetchRegroupement // conserve l'ancien nom au cas où

// 3. Créer un regroupement (avec support optionnel des issue_ids)
export const createRegroupement = async (data: { 
  title: string
  description: string
  ssp_ticket?: string
  issue_ids?: number[] 
}) => {
  return await axios.post(`${API_BASE_URL}/regroupements`, data, { headers: getAuthHeaders() })
}

// 4. Clôturer un regroupement (FERMETURE)
export const closeRegroupement = async (id: number) => {
  return await axios.put(`${API_BASE_URL}/regroupements/${id}/close`, {}, { headers: getAuthHeaders() })
}

// 5. Envoyer des pièces jointes (multipart/form-data)
export const uploadRegroupementAttachments = async (id: number, formData: FormData) => {
  const token = localStorage.getItem('nutria_token')
  return await axios.post(`${API_BASE_URL}/regroupements/${id}/attachments`, formData, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data'
    }
  })
}

// 6. Ajouter un commentaire
export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await axios.post(`${API_BASE_URL}/regroupements/${id}/comments`, { comment_text }, { headers: getAuthHeaders() })
}

// 7. Lier une issue après coup
export const linkIssueToRegroupement = async (id_regroupment: number, id_issue: number) => {
  return await axios.post(`${API_BASE_URL}/regroupements/${id_regroupment}/link-issue`, { id_issue }, { headers: getAuthHeaders() })
}