from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, attachments, issues, reports


app = FastAPI(
    title="NUTRIA API",
    description="Back-End Python pour le support LIMS"
)

# Configuration de sécurité CORS pour autoriser ton React local
app.add_middleware(
    CORSMiddleware,
    # Ajout de 127.0.0.1 en plus de localhost pour éviter les blocages de navigateurs stricts
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

# ---------------------------------------------------------
# BRANCHEMENT DES ROUTEURS
# ---------------------------------------------------------

# AJOUTÉ : Inclusion du routeur d'authentification Google/Oracle qui manquait !
app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(attachments.router)
app.include_router(issues.router)

# ---------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "API NUTRIA Opérationnelle. En attente des requêtes LabWare."}


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    # Cet en-tête indique au navigateur d'autoriser les popups sécurisées comme Google Login
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response