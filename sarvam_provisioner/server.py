
import asyncio
import json
import os
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from boomlify_client import BoomlifyClient
from sarvam_signup import SarvamProvisioner
import db_writer
from config import Config

app = FastAPI(title="MeetLog Sarvam Provisioner Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProvisionRequest(BaseModel):
    count: int = 1
    dry_run: bool = False
    headless: bool = True

@app.get("/health")
def health():
    return {"status": "ok", "service": "sarvam_provisioner"}

@app.get("/stats")
def stats():
    return db_writer.get_pool_stats()

@app.post("/provision")
async def provision_stream(req: ProvisionRequest, authorization: str = Header(None)):
    expected_token = os.getenv("PROVISIONER_AUTH_TOKEN")
    if expected_token:
        token = (authorization or "").replace("Bearer ", "").strip()
        if token != expected_token:
            raise HTTPException(status_code=401, detail="Unauthorized token")

    target_count = max(1, min(req.count, 20))
    dry_run = req.dry_run
    headless = req.headless

    async def event_generator() -> AsyncGenerator[dict, None]:
        yield {
            "event": "status",
            "data": json.dumps({
                "status": "started",
                "targetCount": target_count,
                "dryRun": dry_run,
                "headless": headless,
            })
        }

        boomlify = BoomlifyClient(api_key=Config.BOOMLIFY_API_KEY)
        sarvam = SarvamProvisioner(headless=headless)
        created_keys = []

        try:
            await sarvam.start()

            for i in range(1, target_count + 1):
                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "create_email",
                        "label": f"Account {i}/{target_count}: Creating temporary inbox...",
                    })
                }

                email_res = boomlify.create_email(duration="1hour")
                if not email_res["success"]:
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": f"Email creation error: {email_res.get('error')}", "isError": True})
                    }
                    continue

                email_id = email_res["email_id"]
                email_address = email_res["address"]

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "email_created",
                        "email": email_address,
                        "label": f"Inbox created: {email_address}",
                    })
                }

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "navigating",
                        "label": "Submitting Sarvam registration...",
                    })
                }

                signup_res = await sarvam.provision_account(email=email_address)
                if not signup_res.get("awaiting_otp"):
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": f"Registration failed: {signup_res.get('error')}", "isError": True})
                    }
                    boomlify.delete_email(email_id)
                    continue

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "form_submitted",
                        "label": "Registration sent. Waiting for verification OTP...",
                    })
                }

                page = signup_res["page"]
                context = signup_res.get("context")
                otp = None

                for attempt in range(1, 15):
                    await asyncio.sleep(5)
                    otp = boomlify.get_verification_code(email_id)
                    if otp:
                        break

                if not otp:
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": "OTP timeout", "isError": True})
                    }
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "otp_received",
                        "otp": otp,
                        "label": f"OTP Intercepted: {otp}",
                    })
                }

                otp_ok = await sarvam.complete_otp_verification(page, otp)
                if not otp_ok:
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "onboarding_role",
                        "label": "Navigating onboarding & generating API key...",
                    })
                }

                api_key = await sarvam.generate_api_key(page, context=context)
                if not api_key:
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                created_keys.append(api_key)
                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "key_extracted",
                        "keyPreview": f"{api_key[:8]}...{api_key[-4:]}",
                        "label": f"API Key Extracted: {api_key[:8]}...{api_key[-4:]}",
                    })
                }

                if not dry_run:
                    db_writer.save_api_key(
                        api_key=api_key,
                        email=email_address,
                        password=Config.SARVAM_DEFAULT_PASSWORD,
                        label=f"Auto-provisioned #{i}",
                    )
                    yield {
                        "event": "key_saved",
                        "data": json.dumps({
                            "account": i,
                            "success": True,
                            "totalCreated": len(created_keys),
                        })
                    }

                boomlify.delete_email(email_id)
                if context:
                    await context.close()

                if i < target_count:
                    await asyncio.sleep(5)

            yield {
                "event": "complete",
                "data": json.dumps({
                    "success": True,
                    "totalCreated": len(created_keys),
                    "message": "Provisioning complete",
                })
            }

        finally:
            await sarvam.stop()

    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
