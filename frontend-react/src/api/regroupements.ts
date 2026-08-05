import apiClient from './client';

export const fetchAllRegroupements = async () => {
  return await apiClient.get(`/regroupements`)
}

export const fetchRegroupement = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}`)
}
export const fetchRegroupementById = fetchRegroupement

export const createRegroupement = async (data: { 
  title: string
  description: string
  ssp_ticket?: string
  issue_ids?: number[] 
}) => {
  return await apiClient.post(`/regroupements`, data)
}

export const closeRegroupement = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/close`, {})
}

export const fetchRegroupementComments = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}/comments`)
}

export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await apiClient.post(`/regroupements/${id}/comments`, { comment_text })
}

export const uploadRegroupementCommentAttachments = async (regId: number, commentId: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${regId}/comments/${commentId}/attachments`, formData)
}

export const uploadRegroupementAttachments = async (id: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${id}/attachments`, formData)
}

export const updateRegroupement = async (id: number, data: { title: string, description: string, ssp_ticket?: string }) => {
  return await apiClient.put(`/regroupements/${id}`, data)
}

export const deleteRegroupementAttachment = async (id: number, filename: string) => {
  return await apiClient.delete(`/regroupements/${id}/attachments/${filename}`)
}

export const triggerAiClustering = async () => {
  return await apiClient.post(`/regroupements/suggest-ai`, {})
}

export const validateAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/validate-suggestion`, {})
}

export const rejectAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/reject-suggestion`, {})
}