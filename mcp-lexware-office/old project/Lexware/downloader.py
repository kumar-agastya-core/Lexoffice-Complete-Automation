"""
Downloads unreviewed documents from the Lexware "zu prüfen" (to be examined) inbox
and saves them to the local filesystem.
"""

import os
import pathlib
from typing import Optional
from lexware_client import LexwareClient

# Where downloaded files are stored locally
DOWNLOAD_DIR = pathlib.Path("pdf/inbox")

VOUCHER_LIST_ENDPOINT = "voucherlist"
UNCHECKED_STATUS = "unchecked"


def fetch_unchecked_vouchers(client: LexwareClient) -> list[dict]:
    """
    Returns all vouchers in the 'zu prüfen' inbox that are marked unchecked.
    Lexware paginates results; this collects every page.
    """
    vouchers = []
    page = 0

    while True:
        response = client.get(VOUCHER_LIST_ENDPOINT, params={
            "voucherType":   "any",
            "voucherStatus": UNCHECKED_STATUS,
            "page": page,
            "size": 100,
        })

        content = response.get("content", [])
        vouchers.extend(content)

        if response.get("last", True):
            break
        page += 1

    return vouchers


def download_voucher_file(client: LexwareClient, voucher: dict) -> Optional[pathlib.Path]:
    """
    Downloads the first PDF attached to a voucher and saves it locally.

    Two-step process (as per Lexware API):
      1. GET /v1/vouchers/{id}  → extract the 'files' array of file UUIDs
      2. GET /v1/files/{file_id} with Accept: application/pdf → raw bytes

    Returns the local path, or None if no file is attached.
    """
    voucher_id = voucher.get("id")
    if not voucher_id:
        return None

    # Step 1: get the list of file IDs from the voucher detail
    file_ids = client.get_voucher_file_ids(voucher_id)
    if not file_ids:
        print(f"  [skip] No file attached to voucher {voucher_id}")
        return None

    file_id = file_ids[0]  # take the first attachment

    # Step 2: download the actual file bytes
    try:
        data = client.download_file(file_id)
    except Exception as e:
        print(f"  [error] Could not download file {file_id} for voucher {voucher_id}: {e}")
        return None

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    local_path = DOWNLOAD_DIR / f"{voucher_id}.pdf"
    local_path.write_bytes(data)
    return local_path


def run():
    client = LexwareClient()

    print("Fetching unchecked vouchers from Lexware 'zu prüfen' inbox...")
    vouchers = fetch_unchecked_vouchers(client)
    print(f"Found {len(vouchers)} unchecked voucher(s).")

    results = []
    for voucher in vouchers:
        voucher_id = voucher.get("id", "unknown")
        print(f"  Downloading voucher {voucher_id}...")
        local_path = download_voucher_file(client, voucher)
        if local_path:
            print(f"    Saved -> {local_path}")
            results.append({"voucher": voucher, "local_path": str(local_path)})

    print(f"\nDone. {len(results)} file(s) saved to '{DOWNLOAD_DIR}/'.")
    return results


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    run()
