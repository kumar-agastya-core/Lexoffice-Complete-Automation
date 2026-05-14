import json
import os
import time
import requests


# Lexware hard limit: 2 req/sec. Sleep 1.1s between calls to stay well under it.
_REQUEST_DELAY = 1.10


class LexwareClient:
    BASE_URL = "https://api.lexware.io/v1"

    def __init__(self):
        self.api_key = os.environ.get("LEXWARE_API_KEY")
        if not self.api_key:
            raise ValueError("LEXWARE_API_KEY environment variable not set")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    def get(self, endpoint: str, params: dict = None) -> dict:
        time.sleep(_REQUEST_DELAY)
        response = self.session.get(f"{self.BASE_URL}/{endpoint.lstrip('/')}", params=params)
        response.raise_for_status()
        return response.json()

    def post(self, endpoint: str, data: dict) -> dict:
        time.sleep(_REQUEST_DELAY)
        response = self.session.post(f"{self.BASE_URL}/{endpoint.lstrip('/')}", json=data)
        response.raise_for_status()
        return response.json()

    def get_all_contacts(self) -> list:
        """
        Fetch all contacts via paginated GET /v1/contacts.
        Returns the full list once all pages are consumed.
        """
        contacts = []
        page = 0
        while True:
            data = self.get("contacts", params={"page": page, "size": 250})
            # Response is {content: [...], last: bool, ...}
            batch = data.get("content", [])
            contacts.extend(batch)
            if data.get("last", True) or not batch:
                break
            page += 1
        return contacts

    def get_posting_categories(self) -> list:
        """
        GET /v1/posting-categories — returns a plain list (not paginated).
        """
        data = self.get("posting-categories")
        # Endpoint returns a plain list, not a {content: [...]} envelope
        if isinstance(data, list):
            return data
        return data.get("content", [])

    def get_voucher(self, voucher_id: str) -> dict:
        """Fetch full voucher detail including the 'files' array of file IDs."""
        return self.get(f"vouchers/{voucher_id}")

    def get_voucher_file_ids(self, voucher_id: str) -> list:
        """Return the list of file IDs attached to a voucher (plain UUID strings)."""
        detail = self.get_voucher(voucher_id)
        return detail.get("files", [])

    def download_file(self, file_id: str) -> bytes:
        """
        GET /v1/files/{file_id} — download an uploaded attachment.
        Must use Accept: application/pdf (octet-stream returns 406).
        """
        time.sleep(_REQUEST_DELAY)
        url = f"{self.BASE_URL}/files/{file_id}"
        response = self.session.get(url, headers={"Accept": "application/pdf"})
        response.raise_for_status()
        return response.content

    def update_voucher(self, voucher_id: str, payload: dict) -> dict:
        """
        PUT /v1/vouchers/{id} — update an existing voucher.

        Lexware uses optimistic locking: fetches the current voucher first to
        get the version number and existing file IDs, merges them into the
        payload, then sends the PUT. Omitting file IDs would permanently delete
        attachments — this method always preserves them.

        Returns the response dict (may be empty on success).
        """
        current = self.get_voucher(voucher_id)
        version = current.get("version")
        if version is None:
            raise ValueError(f"Voucher {voucher_id} has no version field")

        merged = {**payload, "version": version}

        # Preserve existing file attachments — omitting them deletes them
        existing_files = current.get("files", [])
        if existing_files:
            merged["files"] = existing_files

        time.sleep(_REQUEST_DELAY)
        url = f"{self.BASE_URL}/vouchers/{voucher_id}"
        # Accept: */* so Lexware can return an empty body (204) without
        # triggering a 406. The session default is application/json which
        # causes 406 when the server has no JSON body to return.
        response = self.session.put(url, json=merged, headers={"Accept": "*/*"})
        response.raise_for_status()
        return response.json() if response.text.strip() else {}

    def contact_exists(self, contact_id: str) -> bool:
        """Return True if the contact exists in Lexware (GET /contacts/{id})."""
        try:
            self.get(f"contacts/{contact_id}")
            return True
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                return False
            raise
