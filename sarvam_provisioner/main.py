#!/usr/bin/env python3

import asyncio
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import Config
from boomlify_client import BoomlifyClient
from sarvam_signup import SarvamProvisioner
import db_writer

LOG_DIR = Path(Config.LOG_DIR)
LOG_DIR.mkdir(exist_ok=True)

log_file = LOG_DIR / f"provision_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
    ],
)
logger = logging.getLogger("main")

async def provision_single_account(
    index: int,
    boomlify: BoomlifyClient,
    sarvam: SarvamProvisioner,
    password: str,
    dry_run: bool = False,
) -> dict:
    result = {
        "index": index,
        "email": None,
        "success": False,
        "api_key": None,
        "error": None,
    }

    try:
        logger.info(f"--- Account {index}: Creating temp email ---")
        email_data = boomlify.create_email(duration=Config.EMAIL_DURATION)
        email_address = email_data["address"]
        email_id = email_data["id"]
        result["email"] = email_address

        logger.info(f"[{email_address}] Starting Sarvam signup...")
        signup_result = await sarvam.provision_account(email_address, password)

        if signup_result.get("error"):
            result["error"] = signup_result["error"]
            logger.error(f"[{email_address}] Signup failed: {result['error']}")
            return result

        if not signup_result.get("awaiting_otp"):
            result["error"] = "Signup did not reach OTP verification step"
            logger.error(f"[{email_address}] {result['error']}")
            return result

        logger.info(f"[{email_address}] Waiting for OTP email...")
        message = boomlify.wait_for_message(email_id)

        if not message:
            result["error"] = "OTP email not received within timeout"
            logger.error(f"[{email_address}] {result['error']}")
            return result

        otp = boomlify.extract_otp_from_message(message)
        if not otp:
            result["error"] = "Could not extract OTP from email"
            logger.error(f"[{email_address}] {result['error']}")
            return result

        logger.info(f"[{email_address}] Verifying OTP: {otp}")
        page = signup_result["page"]
        otp_success = await sarvam.complete_otp_verification(page, otp)

        if not otp_success:
            result["error"] = "OTP verification failed"
            logger.error(f"[{email_address}] {result['error']}")
            return result

        logger.info(f"[{email_address}] Completing onboarding & extracting API keys...")
        raw_keys = await sarvam.generate_api_key(page, context=signup_result.get("context"))
        account_keys = raw_keys if isinstance(raw_keys, list) else ([raw_keys] if raw_keys else [])

        if not account_keys:
            result["error"] = "API key generation failed"
            logger.error(f"[{email_address}] {result['error']}")
            return result

        result["api_key"] = account_keys[0]
        result["api_keys"] = account_keys

        if not dry_run:
            for k_i, k_val in enumerate(account_keys, 1):
                logger.info(f"[{email_address}] Saving Key {k_i}/{len(account_keys)} to database: {k_val[:8]}...")
                db_result = db_writer.save_api_key(
                    api_key=k_val,
                    email=email_address,
                    password=password,
                    label=f"Auto #{index} (Key {k_i}/{len(account_keys)})",
                )
                if not db_result["success"]:
                    logger.warning(f"[{email_address}] DB save warning for key {k_i}: {db_result['error']}")
        else:
            logger.info(f"[{email_address}] DRY RUN: Skipping DB save for {len(account_keys)} keys")

        result["success"] = True
        logger.info(f"[{email_address}] Successfully provisioned {len(account_keys)} keys!")

        try:
            await signup_result["context"].close()
        except Exception:
            pass
        boomlify.delete_email(email_id)

        return result

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"[{result.get('email', 'unknown')}] Unexpected error: {e}")
        return result

async def run_provisioner(count: int = None, dry_run: bool = False, headless: bool = False):
    errors = Config.validate()
    if errors:
        for err in errors:
            logger.error(f"Config error: {err}")
        sys.exit(1)

    target_count = count or Config.SARVAM_ACCOUNT_COUNT
    password = Config.SARVAM_DEFAULT_PASSWORD

    logger.info("=" * 60)
    logger.info("MeetLog — Sarvam API Key Auto-Provisioner")
    logger.info("=" * 60)
    logger.info(f"Target accounts: {target_count}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"Browser mode: {'Headless' if headless else 'Headed (Visible Window)'}")
    logger.info(f"Email duration: {Config.EMAIL_DURATION}")
    logger.info(f"Delay between accounts: {Config.SARVAM_DELAY_BETWEEN_ACCOUNTS}s")
    logger.info(f"Log file: {log_file}")
    logger.info("=" * 60)

    boomlify = BoomlifyClient()
    sarvam = SarvamProvisioner(headless=headless)

    try:
        usage = boomlify.get_usage()
        logger.info(f"Boomlify usage: {usage}")
    except Exception as e:
        logger.warning(f"Could not fetch Boomlify usage: {e}")

    await sarvam.start()

    results = []
    success_count = 0
    fail_count = 0

    try:
        for i in range(1, target_count + 1):
            logger.info(f"\n{'='*40} Account {i}/{target_count} {'='*40}")

            result = await provision_single_account(i, boomlify, sarvam, password, dry_run)
            results.append(result)

            if result["success"]:
                success_count += 1
                logger.info(f"  Result: SUCCESS (key: {result['api_key'][:8]}...)")
            else:
                fail_count += 1
                logger.warning(f"  Result: FAILED ({result['error']})")

            if i < target_count:
                delay = Config.SARVAM_DELAY_BETWEEN_ACCOUNTS
                logger.info(f"  Waiting {delay}s before next account...")
                await asyncio.sleep(delay)

    except KeyboardInterrupt:
        logger.info("\nInterrupted by user. Saving progress...")
    finally:
        await sarvam.stop()

    logger.info("\n" + "=" * 60)
    logger.info("PROVISIONING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total attempted: {target_count}")
    logger.info(f"Successful:      {success_count}")
    logger.info(f"Failed:          {fail_count}")
    logger.info(f"Success rate:    {(success_count/target_count*100):.1f}%" if target_count > 0 else "N/A")
    logger.info(f"Log file:        {log_file}")

    summary_file = LOG_DIR / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    import json
    summary = {
        "timestamp": datetime.now().isoformat(),
        "target_count": target_count,
        "success_count": success_count,
        "fail_count": fail_count,
        "results": [{k: v for k, v in r.items() if k != "page"} for r in results],
    }
    summary_file.write_text(json.dumps(summary, indent=2, default=str))
    logger.info(f"Summary saved to: {summary_file}")

    return results

def show_stats():
    stats = db_writer.get_pool_stats()
    print("\n  Sarvam API Key Pool Statistics")
    print("  " + "-" * 40)
    print(f"  Total Keys:     {stats['total']}")
    print(f"  Active:         {stats['active']}")
    print(f"  Rate Limited:   {stats['rate_limited']}")
    print(f"  Exhausted:      {stats['exhausted']}")
    print(f"  Disabled:       {stats['disabled']}")
    print(f"  Total Usage:    {stats['total_usage']} transcriptions")
    print()

def main():
    parser = argparse.ArgumentParser(
        description="MeetLog Sarvam API Key Auto-Provisioner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--count", type=int, help="Number of accounts to provision")
    parser.add_argument("--dry-run", action="store_true", help="Test without saving to DB")
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode (default: headed)")
    parser.add_argument("--stats", action="store_true", help="Show pool statistics")
    args = parser.parse_args()

    if args.stats:
        show_stats()
        return

    try:
        asyncio.run(run_provisioner(count=args.count, dry_run=args.dry_run, headless=args.headless))
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("\n[!] Provisioner gracefully stopped by user.")
        sys.exit(0)

if __name__ == "__main__":
    main()
