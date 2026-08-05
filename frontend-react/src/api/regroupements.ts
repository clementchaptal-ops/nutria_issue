import apiClient from './client';

/** Retrieves all regroupements. */
export const fetchAllRegroupements = async () => {
  return await apiClient.get(`/regroupements`)
}

/** Retrieves a specific regroupement by ID. */
export const fetchRegroupement = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}`)
}

/** Alias for fetching a regroupement by ID. */
export const fetchRegroupementById = fetchRegroupement

/** Creates a new regroupement with the provided details. */
export const createRegroupement = async (data: { 
  title: string
  description: string
  ssp_ticket?: string
  issue_ids?: number[] 
}) => {
  return await apiClient.post(`/regroupements`, data)
}

/** Closes a specific regroupement by ID. */
export const closeRegroupement = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/close`, {})
}

/** Retrieves all comments for a specific regroupement. */
export const fetchRegroupementComments = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}/comments`)
}

/** Adds a comment to a specific regroupement. */
export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await apiClient.post(`/regroupements/${id}/comments`, { comment_text })
}

/** Uploads attachments associated with a specific regroupement comment. */
export const uploadRegroupementCommentAttachments = async (regId: number, commentId: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${regId}/comments/${commentId}/attachments`, formData)
}

/** Uploads attachments directly to a regroupement. */
export const uploadRegroupementAttachments = async (id: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${id}/attachments`, formData)
}

/** Updates the details of an existing regroupement. */
export const updateRegroupement = async (id: number, data: { title: string, description: string, ssp_ticket?: string }) => {
  return await apiClient.put(`/regroupements/${id}`, data)
}

/** Deletes a specific attachment from a regroupement. */
export const deleteRegroupementAttachment = async (id: number, filename: string) => {
  return await apiClient.delete(`/regroupements/${id}/attachments/${filename}`)
}

/** Triggers the AI clustering suggestion process. */
export const triggerAiClustering = async () => {
  return await apiClient.post(`/regroupements/suggest-ai`, {})
}

/** Validates an AI-generated clustering suggestion for a regroupement. */
export const validateAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/validate-suggestion`, {})
}

/** Rejects an AI-generated clustering suggestion for a regroupement. */
export const rejectAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/reject-suggestion`, {})
}