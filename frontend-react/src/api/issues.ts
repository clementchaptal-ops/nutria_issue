// Base URL pointant vers GCP Cloud Functions / Cloud Run
const API_BASE_URL = "https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api";
const API_URL = `${API_BASE_URL}/issues`;

// --- Helper function to get the security headers ---
const getAuthHeaders = () => {
    const token = localStorage.getItem('nutria_token');
    return {
        'Content-Type': 'application/json',
        // If there's a token, attach it. Otherwise, send empty string to avoid "null"
        'Authorization': token ? `Bearer ${token}` : '' 
    };
};

// ---------------------------------------------------------
// 1. Fetch ALL tickets (For the Dashboard)
// ---------------------------------------------------------
export const fetchAllIssues = async () => {
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch issues: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching all issues:", error);
        throw error;
    }
};

// ---------------------------------------------------------
// 2. Fetch a SINGLE ticket (For the Ticket Form)
// ---------------------------------------------------------
export const fetchIssueById = async (issueId: number) => {
    try {
        const response = await fetch(`${API_URL}/${issueId}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch issue ${issueId}: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching issue ${issueId}:`, error);
        throw error;
    }
};

// ---------------------------------------------------------
// 3. Update/Validate a ticket
// ---------------------------------------------------------
export const validateIssue = async (issueId: number, updateData: any) => {
    try {
        const response = await fetch(`${API_URL}/${issueId}/validate`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            throw new Error(`Failed to validate issue: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error validating issue:", error);
        throw error;
    }
};