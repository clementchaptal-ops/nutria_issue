import axios from 'axios';

// Base URL pointant vers GCP Cloud Functions / Cloud Run
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api";
const API_URL = `${API_BASE_URL}/issues`;

// --- Helper function to get the security headers ---
const getAuthHeaders = () => {
    const token = localStorage.getItem('nutria_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    
    // On ajoute le token uniquement s'il existe
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
};

// ---------------------------------------------------------
// 1. Fetch ALL tickets (For the Dashboard)
// ---------------------------------------------------------
export const fetchAllIssues = async () => {
    // En renvoyant res.data, le composant Dashboard recevra exactement le même format JSON qu'avant avec fetch()
    const res = await axios.get(API_URL, { headers: getAuthHeaders() });
    return res.data;
};

// ---------------------------------------------------------
// 2. Fetch a SINGLE ticket (For the Ticket Form)
// ---------------------------------------------------------
export const fetchIssueById = async (issueId: number) => {
    const res = await axios.get(`${API_URL}/${issueId}`, { headers: getAuthHeaders() });
    return res.data;
};

// ---------------------------------------------------------
// 3. Update/Validate a ticket
// ---------------------------------------------------------
export const validateIssue = async (issueId: number, updateData: any) => {
    const res = await axios.put(`${API_URL}/${issueId}/validate`, updateData, { headers: getAuthHeaders() });
    return res.data;
};