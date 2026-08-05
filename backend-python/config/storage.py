import os
import uuid
import datetime
import google.auth
from google.auth.transport import requests
from google.cloud import storage

BUCKET_NAME = os.environ.get("BUCKET_NAME", "nutria-issue-attachments")

def make_signed_url(public_url: str) -> str:
    """
    Generate a secure, temporary (15 minutes) signed URL for a public GCS object.

    Uses GCP IAM service account credentials to sign the request. This approach
    is compatible with Cloud Run and ambient IAM configurations.

    Args:
        public_url (str): The fully qualified public GCS URL.

    Returns:
        str: The signed access URL, or the original URL if parsing or signing fails.
    """
    if not public_url or "storage.googleapis.com" not in public_url:
        return public_url

    # Parse bucket and blob names from the standard public storage endpoint
    parts = public_url.replace("https://storage.googleapis.com/", "").split("/", 1)
    if len(parts) != 2:
        return public_url

    bucket_name, blob_name = parts[0], parts[1]

    try:
        # Refresh ambient credentials to obtain the required service account email and token
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
    """
    Map a file's MIME type or extension to a legacy Oracle attachment type.

    Args:
        content_type (str): The MIME/Media type of the uploaded file.
        filename (str): The source file name used as a fallback for ZIP detection.

    Returns:
        str: Corresponding Oracle category classification ('IMAGE', 'VIDEO', 'ZIP', or 'DOCUMENT').
    """
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
    """
    Upload raw file bytes directly to a structured path in Google Cloud Storage.

    Constructs a unique filepath within an issue-specific directory using a short UUID
    prefix to prevent naming collisions.

    Args:
        file_bytes (bytes): Binary payload of the file.
        filename (str): Original client-side filename.
        issue_id: Identifier of the parent issue entity.

    Returns:
        dict: Mapping of 'blob_path', 'gs_uri', and 'public_url'.
    """
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