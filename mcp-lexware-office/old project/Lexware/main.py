from dotenv import load_dotenv
load_dotenv()

from contacts_sync import sync_contacts
from categories_sync import sync_categories
from downloader import run as download_unchecked
from processor import run_batch


def main():
    # Step 1: Sync all contacts from Lexware into local DB (fresh copy every run)
    contacts = sync_contacts()
    print()

    # Step 2: Sync all posting categories into local DB (fresh copy every run)
    categories = sync_categories()
    print()

    # Step 3: Pull unchecked "zu prüfen" PDFs from Lexware into pdf/inbox/
    downloaded = download_unchecked()
    print()

    # Step 4: Process each PDF — extract with Claude, update voucher in Lexware
    summary = run_batch()
    print()

    print(
        f"Summary: {len(contacts)} contacts, {len(categories)} categories synced, "
        f"{len(downloaded)} file(s) downloaded — "
        f"processed: {summary['open']} open, "
        f"{summary['skipped']} skipped (no contact), "
        f"{summary['failed']} failed."
    )


if __name__ == "__main__":
    main()
