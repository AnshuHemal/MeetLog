import asyncio
import json
import os
import datetime
from typing import AsyncGenerator, Optional
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

@app.get("/")
@app.head("/")
def root():
    return {"status": "ok", "service": "sarvam_provisioner", "message": "MeetLog Provisioner Engine is running"}

@app.get("/health")
@app.head("/health")
def health():
    return {"status": "ok", "service": "sarvam_provisioner"}

@app.get("/favicon.ico")
def favicon():
    return {}

@app.get("/stats")
def stats():
    return db_writer.get_pool_stats()

@app.post("/provision")
async def provision_stream(req: ProvisionRequest, authorization: Optional[str] = Header(default=None)):
    expected_token = os.getenv("PROVISIONER_AUTH_TOKEN")
    if expected_token:
        token = (authorization or "").replace("Bearer ", "").strip()
        if token != expected_token:
            raise HTTPException(status_code=401, detail="Unauthorized token")

    target_count = max(1, min(req.count, 20))
    dry_run = req.dry_run
    headless = True

    async def event_generator() -> AsyncGenerator[dict, None]:
        def now_str():
            return datetime.datetime.now().strftime("%H:%M:%S")

        yield {
            "event": "status",
            "data": json.dumps({
                "status": "started",
                "targetCount": target_count,
                "dryRun": dry_run,
                "headless": headless,
            })
        }

        yield {
            "event": "log",
            "data": json.dumps({"line": f"Initializing provisioner session (target: {target_count} key(s))...", "timestamp": now_str()})
        }

        boomlify = BoomlifyClient(api_key=Config.BOOMLIFY_API_KEY)
        sarvam = SarvamProvisioner(headless=headless)
        created_keys = []

        try:
            yield {
                "event": "log",
                "data": json.dumps({"line": "Launching headless Playwright Chromium instance on Linux...", "timestamp": now_str()})
            }
            await sarvam.start()
            yield {
                "event": "log",
                "data": json.dumps({"line": "Playwright Chromium browser ready.", "timestamp": now_str()})
            }

            for i in range(1, target_count + 1):
                yield {
                    "event": "log",
                    "data": json.dumps({"line": f"--- Starting Account {i}/{target_count} ---", "timestamp": now_str()})
                }

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "create_email",
                        "label": f"Account {i}/{target_count}: Creating temporary inbox...",
                    })
                }

                yield {
                    "event": "log",
                    "data": json.dumps({"line": "Requesting disposable inbox from Boomlify...", "timestamp": now_str()})
                }

                try:
                    email_res = boomlify.create_email(duration="1hour")
                    email_id = email_res["id"]
                    email_address = email_res["address"]
                except Exception as email_err:
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": f"Boomlify inbox creation error: {email_err}", "isError": True, "timestamp": now_str()})
                    }
                    continue

                yield {
                    "event": "log",
                    "data": json.dumps({"line": f"Disposable inbox ready: {email_address}", "timestamp": now_str()})
                }

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

                yield {
                    "event": "log",
                    "data": json.dumps({"line": f"Opening Sarvam registration portal and filling form...", "timestamp": now_str()})
                }

                signup_res = await sarvam.provision_account(email=email_address)
                if not signup_res.get("awaiting_otp"):
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": f"Registration submission error: {signup_res.get('error')}", "isError": True, "timestamp": now_str()})
                    }
                    boomlify.delete_email(email_id)
                    continue

                yield {
                    "event": "log",
                    "data": json.dumps({"line": "Form submitted. Listening for email OTP code...", "timestamp": now_str()})
                }

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
                    await asyncio.sleep(4)
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": f"Polling Boomlify inbox (attempt {attempt}/15)...", "timestamp": now_str()})
                    }
                    otp = boomlify.get_verification_code(email_id)
                    if otp:
                        break

                if not otp:
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": "OTP interception timed out.", "isError": True, "timestamp": now_str()})
                    }
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                yield {
                    "event": "log",
                    "data": json.dumps({"line": f"Intercepted 6-digit verification code: {otp}", "timestamp": now_str()})
                }

                yield {
                    "event": "step",
                    "data": json.dumps({
                        "account": i,
                        "step": "otp_received",
                        "otp": otp,
                        "label": f"OTP Intercepted: {otp}",
                    })
                }

                yield {
                    "event": "log",
                    "data": json.dumps({"line": "Entering OTP into verification field...", "timestamp": now_str()})
                }

                otp_ok = await sarvam.complete_otp_verification(page, otp)
                if not otp_ok:
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": "OTP verification failed on Sarvam portal.", "isError": True, "timestamp": now_str()})
                    }
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                yield {
                    "event": "log",
                    "data": json.dumps({"line": "OTP verified! Setting up Developer workspace profile...", "timestamp": now_str()})
                }

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
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": "Failed to extract API key from dashboard.", "isError": True, "timestamp": now_str()})
                    }
                    boomlify.delete_email(email_id)
                    if context:
                        await context.close()
                    continue

                created_keys.append(api_key)
                yield {
                    "event": "log",
                    "data": json.dumps({"line": f"Successfully extracted API Key: {api_key[:8]}...{api_key[-4:]}", "timestamp": now_str()})
                }

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
                        "event": "log",
                        "data": json.dumps({"line": "Saved API key to Neon PostgreSQL database key pool.", "timestamp": now_str()})
                    }
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
                    yield {
                        "event": "log",
                        "data": json.dumps({"line": "Pausing 5s before next account...", "timestamp": now_str()})
                    }
                    await asyncio.sleep(5)

            yield {
                "event": "log",
                "data": json.dumps({"line": f"Provisioning complete! Total keys created: {len(created_keys)}", "timestamp": now_str()})
            }

            yield {
                "event": "complete",
                "data": json.dumps({
                    "success": True,
                    "totalCreated": len(created_keys),
                    "message": "Provisioning complete",
                })
            }

        except Exception as exc:
            yield {
                "event": "log",
                "data": json.dumps({"line": f"[FATAL ERROR] {exc}", "isError": True, "timestamp": now_str()})
            }
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)})
            }
        finally:
            await sarvam.stop()

    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
