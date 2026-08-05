import apiClient from './client';

/**
 * Fetches all regroupements from the system.
 * 
 * @returns {Promise<any>} A promise resolving to the list of regroupements.
 */
export const fetchAllRegroupements = async () => {
  return await apiClient.get(`/regroupements`)
}

/**
 * Retrieves a specific regroupement by its unique identifier.
 * 
 * @param {number} id - The unique identifier of the regroupement.
 * @returns {Promise<any>} A promise resolving to the regroupement details.
 */
export const fetchRegroupement = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}`)
}

/**
 * Alias function to fetch a regroupement by its ID.
 */
export const fetchRegroupementById = fetchRegroupement

/**
 * Creates a new regroupement with the provided details.
 * 
 * @param {Object} data - The payload containing the regroupement details.
 * @param {string} data.title - The title of the regroupement.
 * @param {string} data.description - A detailed description of the regroupement.
 * @param {string} [data.ssp_ticket] - Optional associated SSP ticket reference.
 * @param {number[]} [data.issue_ids] - Optional list of associated issue IDs to link.
 * @returns {Promise<any>} A promise resolving to the created regroupement data.
 */
export const createRegroupement = async (data: { 
  title: string
  description: string
  ssp_ticket?: string
  issue_ids?: number[] 
}) => {
  return await apiClient.post(`/regroupements`, data)
}

/**
 * Closes an active regroupement.
 * 
 * @param {number} id - The ID of the regroupement to close.
 * @returns {Promise<any>} A promise resolving to the API response.
 */
export const closeRegroupement = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/close`, {})
}

/**
 * Fetches all comments associated with a specific regroupement.
 * 
 * @param {number} id - The ID of the regroupement.
 * @returns {Promise<any>} A promise resolving to the collection of comments.
 */
export const fetchRegroupementComments = async (id: number) => {
  return await apiClient.get(`/regroupements/${id}/comments`)
}

/**
 * Adds a new comment to a regroupement.
 * 
 * @param {number} id - The ID of the target regroupement.
 * @param {string} comment_text - The textual content of the comment.
 * @returns {Promise<any>} A promise resolving to the newly created comment object.
 */
export const addRegroupementComment = async (id: number, comment_text: string) => {
  return await apiClient.post(`/regroupements/${id}/comments`, { comment_text })
}

/**
 * Uploads attachment files linked to a specific comment within a regroupement.
 * 
 * @param {number} regId - The ID of the parent regroupement.
 * @param {number} commentId - The ID of the specific comment.
 * @param {FormData} formData - The multipart form data containing the file binary.
 * @returns {Promise<any>} A promise resolving to the status of the upload action.
 */
export const uploadRegroupementCommentAttachments = async (regId: number, commentId: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${regId}/comments/${commentId}/attachments`, formData)
}

/**
 * Uploads attachment files directly to a regroupement.
 * 
 * @param {number} id - The ID of the regroupement.
 * @param {FormData} formData - The multipart form data containing the file payload.
 * @returns {Promise<any>} A promise resolving to the status of the upload action.
 */
export const uploadRegroupementAttachments = async (id: number, formData: FormData) => {
  return await apiClient.post(`/regroupements/${id}/attachments`, formData)
}

/**
 * Updates the structural information of an existing regroupement.
 * 
 * @param {number} id - The ID of the regroupement to update.
 * @param {Object} data - The updated data fields.
 * @param {string} data.title - The updated title.
 * @param {string} data.description - The updated description.
 * @param {string} [data.ssp_ticket] - The optional updated SSP ticket reference.
 * @returns {Promise<any>} A promise resolving to the updated regroupement data.
 */
export const updateRegroupement = async (id: number, data: { title: string, description: string, ssp_ticket?: string }) => {
  return await apiClient.put(`/regroupements/${id}`, data)
}

/**
 * Removes a specific file attachment from a regroupement.
 * 
 * @param {number} id - The ID of the regroupement.
 * @param {string} filename - The unique name of the file to delete.
 * @returns {Promise<any>} A promise representing the API response status.
 */
export const deleteRegroupementAttachment = async (id: number, filename: string) => {
  return await apiClient.delete(`/regroupements/${id}/attachments/${filename}`)
}

/**
 * Triggers the background AI service to generate regroupement suggestions.
 * 
 * @returns {Promise<any>} A promise resolving to the triggered task status.
 */
export const triggerAiClustering = async () => {
  return await apiClient.post(`/regroupements/suggest-ai`, {})
}

/**
 * Confirms and validates an AI clustering recommendation.
 * 
 * @param {number} id - The ID of the regroupement associated with the suggestion.
 * @returns {Promise<any>} A promise representing the validation status.
 */
export const validateAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/validate-suggestion`, {})
}

/**
 * Rejects and dismisses an AI clustering recommendation.
 * 
 * @param {number} id - The ID of the regroupement associated with the suggestion.
 * @returns {Promise<any>} A promise representing the rejection status.
 */
export const rejectAiSuggestion = async (id: number) => {
  return await apiClient.put(`/regroupements/${id}/reject-suggestion`, {})
}