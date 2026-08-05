import apiClient from './client';

// ---------------------------------------------------------
// TICKETS (ISSUES)
// ---------------------------------------------------------
export const fetchAllIssues = async () => {
    const res = await apiClient.get('/issues');
    return res.data;
};

export const fetchIssueById = async (issueId: string | number) => {
    const res = await apiClient.get(`/issues/${issueId}`);
    return res.data;
};

export const createIssue = async (issueData: any) => {
    const res = await apiClient.post(`/issues/create`, issueData);
    return res.data;
};

export const validateIssue = async (issueId: string | number, updateData: any) => {
    const res = await apiClient.put(`/issues/${issueId}/validate`, updateData);
    return res.data;
};

export const cancelTicket = async (issueId: string | number) => {
    const res = await apiClient.put(`/issues/${issueId}/cancel`, {});
    return res.data;
};

export const closeTicket = async (issueId: string | number, new_status: string) => {
    const res = await apiClient.put(`/issues/${issueId}/close`, { new_status });
    return res.data;
};

// ---------------------------------------------------------
// UTILISATEURS
// ---------------------------------------------------------
export const fetchUserMe = async () => {
    const res = await apiClient.get(`/issues/users/me`);
    return res.data;
};

// ---------------------------------------------------------
// COMMENTAIRES & PIÈCES JOINTES
// ---------------------------------------------------------
export const fetchIssueComments = async (issueId: string | number) => {
    const res = await apiClient.get(`/issues/${issueId}/comments`);
    return res.data;
};

export const addIssueComment = async (issueId: string | number, comment_text: string) => {
    const res = await apiClient.post(`/issues/${issueId}/comments`, { comment_text });
    return res.data;
};

export const uploadIssueAttachments = async (issueId: string | number, formData: FormData) => {
    const res = await apiClient.post(`/issues/${issueId}/attachments`, formData);
    return res.data;
};

export const uploadCommentAttachments = async (issueId: string | number, commentId: string | number, formData: FormData) => {
    const res = await apiClient.post(`/issues/${issueId}/comments/${commentId}/attachments`, formData);
    return res.data;
};

export const deleteIssueAttachment = async (issueId: string | number, filename: string) => {
    const res = await apiClient.delete(`/issues/${issueId}/attachments/${filename}`);
    return res.data;
};

export const downloadIssueFile = async (issueId: string | number, type: 'working_dir' | 'logs') => {
    const res = await apiClient.get(`/issues/${issueId}/download/${type}`);
    return res.data;
};