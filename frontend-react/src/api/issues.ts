import apiClient from './client';

/**
 * Retrieves all issues from the system.
 * 
 * @returns {Promise<any>} A promise resolving to the array of issues.
 */
export const fetchAllIssues = async () => {
    // Send GET request to retrieve the full issues collection
    const res = await apiClient.get('/issues');
    return res.data;
};

/**
 * Retrieves details for a single issue by its unique identifier.
 * 
 * @param {string | number} issueId - The unique identifier of the issue.
 * @returns {Promise<any>} A promise resolving to the issue details.
 */
export const fetchIssueById = async (issueId: string | number) => {
    // Send GET request to fetch a specific issue resource
    const res = await apiClient.get(`/issues/${issueId}`);
    return res.data;
};

/**
 * Creates a new issue in the system.
 * 
 * @param {any} issueData - The payload containing configuration for the new issue.
 * @returns {Promise<any>} A promise resolving to the created issue object.
 */
export const createIssue = async (issueData: any) => {
    // Send POST request with payload data to create the issue
    const res = await apiClient.post(`/issues/create`, issueData);
    return res.data;
};

/**
 * Validates an issue and updates its current validation status.
 * 
 * @param {string | number} issueId - The unique identifier of the issue to validate.
 * @param {any} updateData - The payload containing status validation updates.
 * @returns {Promise<any>} A promise resolving to the updated issue state.
 */
export const validateIssue = async (issueId: string | number, updateData: any) => {
    // Send PUT request to modify validation fields
    const res = await apiClient.put(`/issues/${issueId}/validate`, updateData);
    return res.data;
};

/**
 * Cancels a designated ticket/issue.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @returns {Promise<any>} A promise resolving to the canceled issue status.
 */
export const cancelTicket = async (issueId: string | number) => {
    // Send PUT request with empty body to trigger transition to cancelled state
    const res = await apiClient.put(`/issues/${issueId}/cancel`, {});
    return res.data;
};

/**
 * Closes an active ticket/issue and applies the specified final status.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @param {string} new_status - The target status value to apply upon closing.
 * @returns {Promise<any>} A promise resolving to the closed issue data.
 */
export const closeTicket = async (issueId: string | number, new_status: string) => {
    // Send PUT request with new status parameters to close the issue
    const res = await apiClient.put(`/issues/${issueId}/close`, { new_status });
    return res.data;
};

/**
 * Retrieves profile and account data for the currently authenticated user session.
 * 
 * @returns {Promise<any>} A promise resolving to the current user's profile information.
 */
export const fetchUserMe = async () => {
    // Send GET request to retrieve current session holder information
    const res = await apiClient.get(`/issues/users/me`);
    return res.data;
};

/**
 * Retrieves all comment records associated with a specific issue.
 * 
 * @param {string | number} issueId - The unique identifier of the parent issue.
 * @returns {Promise<any>} A promise resolving to the list of issue comments.
 */
export const fetchIssueComments = async (issueId: string | number) => {
    // Send GET request to fetch nested comment records
    const res = await apiClient.get(`/issues/${issueId}/comments`);
    return res.data;
};

/**
 * Adds a new comment text entry to a specific issue.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @param {string} comment_text - The plain text content of the new comment.
 * @returns {Promise<any>} A promise resolving to the newly created comment object.
 */
export const addIssueComment = async (issueId: string | number, comment_text: string) => {
    // Send POST request with text payload to append comment
    const res = await apiClient.post(`/issues/${issueId}/comments`, { comment_text });
    return res.data;
};

/**
 * Uploads local files as binary attachments to a specific issue.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @param {FormData} formData - Multipart form structure containing the file assets.
 * @returns {Promise<any>} A promise resolving to the confirmation details of the uploaded attachment.
 */
export const uploadIssueAttachments = async (issueId: string | number, formData: FormData) => {
    // Send POST request containing file form data to issue attachment endpoint
    const res = await apiClient.post(`/issues/${issueId}/attachments`, formData);
    return res.data;
};

/**
 * Uploads local files as binary attachments directly linked to a specific comment resource.
 * 
 * @param {string | number} issueId - The unique identifier of the parent issue.
 * @param {string | number} commentId - The unique identifier of the target comment.
 * @param {FormData} formData - Multipart form structure containing the file assets.
 * @returns {Promise<any>} A promise resolving to the confirmation details of the uploaded comment attachment.
 */
export const uploadCommentAttachments = async (issueId: string | number, commentId: string | number, formData: FormData) => {
    // Send POST request containing file form data to nested comment attachment endpoint
    const res = await apiClient.post(`/issues/${issueId}/comments/${commentId}/attachments`, formData);
    return res.data;
};

/**
 * Deletes a targeted attachment from an issue using the specific file name.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @param {string} filename - The name identifier of the file to remove.
 * @returns {Promise<any>} A promise resolving to the execution result of the delete operation.
 */
export const deleteIssueAttachment = async (issueId: string | number, filename: string) => {
    // Send DELETE request targeting a specific file asset path
    const res = await apiClient.delete(`/issues/${issueId}/attachments/${filename}`);
    return res.data;
};

/**
 * Downloads diagnostic system logs or development working directory source files for a specific issue.
 * 
 * @param {string | number} issueId - The unique identifier of the target issue.
 * @param {'working_dir' | 'logs'} type - The asset group category to extract.
 * @returns {Promise<any>} A promise resolving to the downloaded file stream or base data payload.
 */
export const downloadIssueFile = async (issueId: string | number, type: 'working_dir' | 'logs') => {
    // Send GET request targeting specified file export endpoint path
    const res = await apiClient.get(`/issues/${issueId}/download/${type}`);
    return res.data;
};