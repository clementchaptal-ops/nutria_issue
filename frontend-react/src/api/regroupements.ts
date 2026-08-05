import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api'

const getAuthHeaders = () => {
  const token = localStorage.getItem('nutria_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  return headers
}

export const fetchAllRegroupements = async () => {
  return await axios.get(`${API_BASE_URL}/regroupements`, { headers: getAuthHeaders() })
}

export const fetchRegroupement = async (id: number) => {
  return await axios.get(`${API_BASE_URL}/regroupements/${id}`, { headers: getAuthHeaders() })
}
export const fetchRegroupementById = fetchRegroupement

export const createRegroupement = async (data: { 
  title: string
  description: string
  ssp_ticket?: string
  issue_ids?: number[] 
}) => {
  return await axios.post(`${API_BASE_URL}/regroupements`, data, { headers: getAuthHeaders() })
}

export const closeRegroupement = async (id: number) => {
  return await axios.put(`${API_BASE_URL}/regroupements/${id}/close`, {}, { headers: getAuthHeaders() })
}

export const fetchRegroupementComments = async (id: number) => {
  return await axios.get(`${API_BASE_URL}/regroupements/${id}/comments`, { headers: getAuthHeaders() })
}

export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await axios.post(`${API_BASE_URL}/regroupements/${id}/comments`, { comment_text }, { headers: getAuthHeaders() })
}

export const uploadRegroupementCommentAttachments = async (regId: number, commentId: number, formData: FormData) => {
  const token = localStorage.getItem('nutria_token')
  return await axios.post(`${API_BASE_URL}/regroupements/${regId}/comments/${commentId}/attachments`, formData, {
    headers: { 'Authorization': token ? `Bearer ${token}` : '' }
  })
}

export const uploadRegroupementAttachments = async (id: number, formData: FormData) => {
  const token = localStorage.getItem('nutria_token')
  return await axios.post(`${API_BASE_URL}/regroupements/${id}/attachments`, formData, {
    headers: { 'Authorization': token ? `Bearer ${token}` : '' }
  })
}

export const updateRegroupement = async (id: number, data: { title: string, description: string, ssp_ticket?: string }) => {
  return await axios.put(`${API_BASE_URL}/regroupements/${id}`, data, { headers: getAuthHeaders() })
}

export const deleteRegroupementAttachment = async (id: number, filename: string) => {
  return await axios.delete(`${API_BASE_URL}/regroupements/${id}/attachments/${filename}`, { headers: getAuthHeaders() })
}

export const triggerAiClustering = async () => {
  return await axios.post(`${API_BASE_URL}/regroupements/suggest-ai`, {}, { headers: getAuthHeaders() })
}

export const validateAiSuggestion = async (id: number) => {
  return await axios.put(`${API_BASE_URL}/regroupements/${id}/validate-suggestion`, {}, { headers: getAuthHeaders() })
}

export const rejectAiSuggestion = async (id: number) => {
  return await axios.put(`${API_BASE_URL}/regroupements/${id}/reject-suggestion`, {}, { headers: getAuthHeaders() })
}