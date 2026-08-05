import apiClient from './client';

/** Retrieves all issues from the system. */
export const fetchAllIssues = async () => {
    const res = await apiClient.get('/issues');
    return res.data;
};

/** Retrieves a single issue by its unique identifier. */
export const fetchIssueById = async (issueId: string | number) => {
    const res = await apiClient.get(`/issues/${issueId}`);
    return res.data;
};

/** Creates a new issue. */
export const createIssue = async (issueData: any) => {
    const res = await apiClient.post(`/issues/create`, issueData);
    return res.data;
};

/** Validates an issue and updates its status. */
export const validateIssue = async (issueId: string | number, updateData: any) => {
    const res = await apiClient.put(`/issues/${issueId}/validate`, updateData);
    return res.data;
};

/** Cancels a ticket. */
export const cancelTicket = async (issueId: string | number) => {
    const res = await apiClient.put(`/issues/${issueId}/cancel`, {});
    return res.data;
};

/** Closes an active ticket. */
export const closeTicket = async (issueId: string | number, new_status: string) => {
    const res = await apiClient.put(`/issues/${issueId}/close`, { new_status });
    return res.data;
};

/** Retrieves profile data for the currently authenticated user. */
export const fetchUserMe = async () => {
    const res = await apiClient.get(`/issues/users/me`);
    return res.data;
};

/** Retrieves all comments for a specific issue. */
export const fetchIssueComments = async (issueId: string | number) => {
    const res = await apiClient.get(`/issues/${issueId}/comments`);
    return res.data;
};

/** Adds a comment to an issue. */
export const addIssueComment = async (issueId: string | number, comment_text: string) => {
    const res = await apiClient.post(`/issues/${issueId}/comments`, { comment_text });
    return res.data;
};

/** Uploads attachments to an issue. */
export const uploadIssueAttachments = async (issueId: string | number, formData: FormData) => {
    const res = await apiClient.post(`/issues/${issueId}/attachments`, formData);
    return res.data;
};

/** Uploads attachments to a specific comment. */
export const uploadCommentAttachments = async (issueId: string | number, commentId: string | number, formData: FormData) => {
    const res = await apiClient.post(`/issues/${issueId}/comments/${commentId}/attachments`, formData);
    return res.data;
};

/** Deletes a specified attachment from an issue. */
export const deleteIssueAttachment = async (issueId: string | number, filename: string) => {
    const res = await apiClient.delete(`/issues/${issueId}/attachments/${filename}`);
    return res.data;
};

/** Downloads logs or working directory files for an issue. */
export const downloadIssueFile = async (issueId: string | number, type: 'working_dir' | 'logs') => {
    const res = await apiClient.get(`/issues/${issueId}/download/${type}`);
    return res.data;
};