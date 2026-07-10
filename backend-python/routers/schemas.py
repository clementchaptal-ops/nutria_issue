from pydantic import BaseModel
from typing import Optional

class TicketCreate(BaseModel):
    title: str
    issue_type: str
    criticity: str        
    frequency: str        
    blocking_issue: str   
    description: str
    sspticket: Optional[str] = None
    current_project: Optional[str] = None
    current_batch: Optional[str] = None
    current_sample: Optional[int] = None
    current_analysis: Optional[str] = None
    current_analysis_variation: Optional[str] = None
    current_customer: Optional[str] = None

class TicketUpdate(BaseModel):
    title: str
    issue_type: str
    criticity: str        
    frequency: str        
    blocking_issue: str   
    description: str
    sspticket: Optional[str] = None
    current_project: Optional[str] = None
    current_batch: Optional[str] = None
    current_sample: Optional[int] = None
    current_analysis: Optional[str] = None
    current_analysis_variation: Optional[str] = None
    current_customer: Optional[str] = None

class StatusUpdate(BaseModel):
    new_status: str

class GoogleTokenRequest(BaseModel):
    credential: str
    token: Optional[str] = None
    selected_profile: Optional[str] = None