import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api'

const getAuthHeaders = () => {
  const token = localStorage.getItem('nutria_token')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

export const fetchAllRegroupements = async () => {
  return await axios.get(`${API_BASE_URL}/regroupements`, { headers: getAuthHeaders() })
}

export const fetchRegroupementById = async (id: number) => {
  return await axios.get(`${API_BASE_URL}/regroupements/${id}`, { headers: getAuthHeaders() })
}

export const createRegroupement = async (data: { title: string, description: string, ssp_ticket?: string }) => {
  return await axios.post(`${API_BASE_URL}/regroupements`, data, { headers: getAuthHeaders() })
}

export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await axios.post(`${API_BASE_URL}/regroupements/${id}/comments`, { comment_text }, { headers: getAuthHeaders() })
}

export const linkIssueToRegroupement = async (id_regroupment: number, id_issue: number) => {
  return await axios.post(`${API_BASE_URL}/regroupements/${id_regroupment}/link-issue`, { id_issue }, { headers: getAuthHeaders() })
}