import os
import uuid
import datetime
import google.auth
from google.auth.transport import requests
from google.cloud import storage

BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")

def make_signed_url(public_url: str) -> str:
    """Generates a temporary signed URL (15 min) compatible with Cloud Run and GCP IAM Credentials."""
    if not public_url or "storage.googleapis.com" not in public_url:
        return public_url

    parts = public_url.replace("https://storage.googleapis.com/", "").split("/", 1)
    if len(parts) != 2:
        return public_url

    bucket_name, blob_name = parts[0], parts[1]

    try:
        credentials, _ = google.auth.default()
        auth_request = requests.Request()
        credentials.refresh(auth_request)

        client = storage.Client(credentials=credentials)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        return blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="GET",
            service_account_email=credentials.service_account_email,
            access_token=credentials.token
        )
    except Exception as e:
        print(f"[STORAGE ERROR - make_signed_url]: {str(e)}")
        return public_url

def get_oracle_attachment_type(content_type: str, filename: str) -> str:
    """Evaluates the MIME type to return the legacy Oracle attachment type."""
    content_type = content_type.lower()
    if content_type.startswith('image/'):
        return 'IMAGE'
    elif content_type.startswith('video/'):
        return 'VIDEO'
    elif 'zip' in content_type or filename.lower().endswith('.zip'):
        return 'ZIP'
    else:
        return 'DOCUMENT'

def upload_to_gcs(file_bytes: bytes, filename: str, issue_id) -> dict:
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        unique_prefix = uuid.uuid4().hex[:8]
        blob_path = f"tickets/ticket_{issue_id}/{unique_prefix}_{filename}"

        blob = bucket.blob(blob_path)
        blob.upload_from_string(file_bytes)

        gs_uri = f"gs://{BUCKET_NAME}/{blob_path}"
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_path}"

        return {
            "blob_path": blob_path,
            "gs_uri": gs_uri,
            "public_url": public_url
        }
    except Exception as e:
        print(f"[STORAGE ERROR - upload_to_gcs]: {str(e)}")
        raise e