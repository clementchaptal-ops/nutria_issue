from pydantic import BaseModel
from typing import Optional

class IssueCreate(BaseModel):
    """
    Schema for validating data when creating a new issue tracker entry.
    """
    title: str
    issue_type: str
    criticity: str        
    frequency: str        
    blocking_issue: str   
    description: str
    current_project: Optional[str] = None
    current_batch: Optional[str] = None
    current_sample: Optional[int] = None
    current_analysis: Optional[str] = None
    current_analysis_variation: Optional[str] = None
    current_customer: Optional[str] = None
    environment: Optional[str] = None

class IssueUpdate(BaseModel):
    """
    Schema for validating data when updating an existing issue tracker entry.
    """
    title: str
    issue_type: str
    criticity: str        
    frequency: str        
    blocking_issue: str   
    description: str
    current_project: Optional[str] = None
    current_batch: Optional[str] = None
    current_sample: Optional[int] = None
    current_analysis: Optional[str] = None
    current_analysis_variation: Optional[str] = None
    current_customer: Optional[str] = None
    environment: Optional[str] = None

class StatusUpdate(BaseModel):
    """
    Schema for validating updates to the workflow status of an issue.
    """
    new_status: str

class GoogleTokenRequest(BaseModel):
    """
    Schema representing a request to authenticate or verify a Google OAuth credential.
    """
    credential: str
    token: Optional[str] = None
    selected_profile: Optional[str] = None

class RegroupementCreate(BaseModel):
    """
    Schema for validating data when creating a new grouping of related issues.
    """
    title: str
    description: str
    ssp_ticket: Optional[str] = None
    issue_ids: Optional[list[int]] = [] 

class RegroupementUpdate(BaseModel):
    """
    Schema for validating data when updating an existing grouping of related issues.
    """
    title: str
    description: str
    ssp_ticket: Optional[str] = None