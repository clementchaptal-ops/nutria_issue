# NUTRIA - LIMS AIOps & Issue Tracking Platform

NUTRIA is an advanced Technical Support and Artificial Intelligence for IT Operations (AIOps) platform designed specifically to diagnose, correlate, and resolve incidents related to the LabWare LIMS and Citrix environments.

This repository is a monorepo containing the complete source code, divided into a reactive React frontend and a Serverless Python API powered by Generative AI.

---

## How is NUTRIA Called? (The Workflow)

NUTRIA bridges the gap between machine-generated errors and human IT support. It is called through two main channels:

1. **System-to-System (Machine Integration):**
   When a user encounters a fatal error or crash inside the LabWare LIMS or Citrix environment, a background script automatically intercepts the crash. It fires a POST request to Nutria's `/issues/preticket` endpoint. This request uses a strict `LABWARE_API_TOKEN` and injects the user's environment details (IP, Ping, Citrix session, current LabWare batch, and analysis context). Nutria saves this as a "PRETICKET".
2. **Web Interface:**
   The user opens the Nutria Issue Web App. Using Google Single Sign-On (SSO), Nutria recognizes the user, retrieves the automatically generated "Preticket," and asks the user to fill in the missing human context (Description, photos, videos). The ticket then transitions to "IN PROGRESS".
3. **AI Background Processing:**
   Upon saving, Nutria's backend asynchronously triggers Vertex AI to read system logs and attachments, generating a root-cause summary. Periodically, the AI scans all active tickets and groups similar ones into "Clusters" (Regroupements) for the IT team.

---

## Google Cloud Platform (GCP) Services Used

NUTRIA relies heavily on a modern, serverless Google Cloud stack:

* **Google Cloud Functions :** Hosts the Python backend (`backend-python`). It provides automatic scaling and handles incoming HTTP requests via the `functions-framework`.
* **Google Cloud SQL (PostgreSQL):** The primary relational database storing tickets (`c_issue`), comments, users (`lims_users`), and audit trails (`c_issue_audit_logs`). Connected via Cloud SQL Auth Proxy (`/cloudsql/...` unix sockets).
* **Google Cloud Storage (GCS Buckets):** Stores all heavy payloads. It holds user attachments (images, videos, PDF, ZIP logs) and the `active_issues_state.json` file used by the AI. 
* **Vertex AI (Gemini 2.5 Flash):** The brain of the platform. Used for Multimodal Analysis (reading images and ZIP logs to extract root causes) and Data Clustering (analyzing JSON dumps to group similar tickets together). It uses Grounding via Vertex AI Search / Datastore to search the internal IT knowledge base.
* **Google Cloud Build:** The CI/CD pipeline tool that reads `cloudbuild.yaml` to automatically package and deploy the Cloud Function.
* **Google Workspace / Apps Script:** A specific Apps Script endpoint is called by the backend to check Google Groups memberships (e.g., `nutria_core_it@mxns.com`) and dynamically assign RBAC permissions (`IT_TEAM`, `LOCAL_ADMIN`, `USER`).

---

## File-by-File Documentation

### 1. Root Directory
* `cloudbuild.yaml`: Configuration file for Google Cloud Build. It enables required GCP APIs and defines the deployment steps for the Python Cloud Function.
* `.gcloudignore`: Specifies which files and directories (like `node_modules`, `.venv`, and local attachments) should be excluded when uploading the code to GCP.

### 2. Backend (`/backend-python`)

#### Main Entry Point
* `main.py`: The single entry point for the Cloud Function. It manages CORS headers, intercepts requests to verify authentication (either LIMS tokens or Google JWTs), applies security scoping, and routes requests to their respective controllers based on the URL path.
* `requirements.txt`: Lists all Python dependencies (Flask, google-cloud-storage, google-genai, psycopg2, PyJWT, etc.).

#### Configuration (`/config`)
* `database.py`: Manages the connection pool to PostgreSQL, handling both local TCP connections and GCP Unix Socket connections.
* `storage.py`: Centralizes GCS logic. It generates secure Signed URLs for downloads and handles binary uploads, generating unique UUID paths for attachments.
* `admin_role.py`: Communicates with an external Google Apps Script to fetch Google Group memberships, utilizing an in-memory TTL cache to limit API calls.
* `translator.py`: A local development script using `deep_translator` to automatically generate `es`, `pl`, and `pt` frontend translation files based on the English source.

#### Routers / Controllers (`/routers`)
* `auth.py`: Handles Google OAuth 2.0 verification. It checks the user's email against the LIMS database, handles multi-profile selections, assigns roles, and issues the session's JWT Access Token.
* `issues.py`: The core CRUD controller for tickets. Handles creation (manual and Pre-tickets), updates, cancellations, status changes, environment tracking, and file downloads.
* `attachments.py`: Handles HTTP requests for uploading files to GCS and storing references in the database. It spawns background threads to trigger AI analysis upon upload.
* `audit.py`: The security logger. Exposes functions to record user actions (IP, Target, Action Type) synchronously into the database to maintain a compliant Audit Trail.
* `regroupement.py`: Manages the "Clusters". Allows IT teams to manually group tickets, or validate/reject groups suggested by the AI.
* `schemas.py`: Contains `Pydantic` models to strictly validate the payload structures of incoming JSON requests.
* `security.py`: Contains the `verify_token` middleware logic, decoding JWTs and validating system API keys.

#### Services & AI (`/services`)
* `state_manager.py`: Queries the database for all active tickets, formats them into a massive JSON object, and uploads `active_issues_state.json` to GCS. Runs in a background thread.
* `ai_clustering.py`: Feeds the JSON state file to Gemini 2.5 Flash, asking it to find strong technical correlations (same Citrix Server, same Batch). Inserts suggestions into the database as `SUGGESTED` regroupements.
* `ai_extractor.py`: Downloads ZIP files from GCS, unzips them in RAM, extracts log text, and sends it to Gemini alongside images/videos. Returns a short, explicit summary of the root cause.

---

### 3. Frontend (`/frontend-react`)

#### Configuration
* `vite.config.ts`: Configures the Vite bundler, sets the development port (5173), and enforces Cross-Origin headers (`same-origin-allow-popups`) required by Google Auth.
* `package.json`: Defines React, Axios, i18next, and React Router dependencies.

#### Core App (`/src`)
* `main.tsx` & `App.tsx`: React mounting points. Configures the Router, Notification Toaster, and wraps routes inside Layouts and Security Guards.
* `i18n.ts`: Initializes internationalization, loading JSON translation files dynamically based on browser preferences.

#### Layout & Guards (`/src/layouts` & `/src/components`)
* `MainLayout.tsx`: The application shell containing the Header, Navigation buttons, and User Profile/Logout controls.
* `ProtectedRoute.tsx`: Prevents access to the app without a valid JWT in `localStorage`.
* `AdminRoute.tsx`: Restricts specific paths (`/audit`, `/regroupements`) to `IT_TEAM` and `LOCAL_ADMIN` roles.

#### API Clients (`/src/api`)
* `client.ts`: An Axios instance equipped with interceptors. It automatically injects the `Bearer` token in headers and catches `401 Unauthorized` errors to force user logout.
* `issues.ts` & `regroupements.ts`: Wrappers for backend HTTP calls.

#### Pages (`/src/pages`)
* `Login.tsx`: Handles the Google SSO flow, manages multi-profile selection, and stores the JWT.
* `Dashboard.tsx`: The main view containing filtering controls, metric cards (`StatCard`), and the dynamic ticket list (`GenericTable`).
* `IssueForm.tsx`: A view handling both Ticket Creation and Ticket Details. It manages form fields, file uploads (Drag & Drop + Paste), auto-collected LIMS context, and the chat/discussion module.
* `RegroupementList.tsx`: A split dashboard displaying Manual Clusters (Classic) and AI-Generated Clusters (AIOps Suggestions), allowing IT to Accept/Reject AI suggestions.
* `RegroupementDetail.tsx`: A view managing grouped tickets, cluster descriptions, and cluster-specific discussion threads.
* `AuditLogs.tsx`: A read-only admin table displaying the history of all user actions.

---

## Local Development Setup
*All the variable are stored in the nutria-api in the variable section
### 1. Backend Initialization


Create a `.env` file in `backend-python/`:
```ini
DB_USER=postgres
DB_PASSWORD=""
DB_NAME=nutria_db
DB_HOST=127.0.0.1
DB_PORT=5432
GCP_PROJECT=nutria-issue
BUCKET_NAME=nutria-issue-attachments
JWT_SECRET_KEY=""
GOOGLE_CLIENT_ID=""
LABWARE_API_TOKEN="" 

cd backend-python
python -m venv venv
source venv/bin/activate 
pip install -r requirements.txt
functions-framework --target=nutria_api --debug

### 2. Frontend Initialization
VITE_API_URL=http://localhost:8080


cd frontend-react
npm install
npm run dev

Deployment
The backend is deployed via Google Cloud Build. Run this command at the root of the project:
gcloud builds submit --config cloudbuild.yaml