
import asyncio
import base64
import logging
import random
from pathlib import Path
from typing import Optional
from playwright.async_api import async_playwright, Browser, Page
from config import Config

logger = logging.getLogger("sarvam")

def generate_name() -> str:
    first = ["Alex", "Jordan", "Casey", "Morgan", "Riley", "Quinn", "Avery", "Parker",
             "Skyler", "Dakota", "Reese", "Finley", "Hayden", "Emerson", "Sage", "Rowan",
             "Blake", "Charlie", "Drew", "Frankie", "Kendall", "Logan", "Phoenix", "River"]
    last = ["Chen", "Park", "Kim", "Lee", "Patel", "Singh", "Gupta", "Nakamura",
            "Tanaka", "Watanabe", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller"]
    return f"{random.choice(first)} {random.choice(last)}"

class SarvamProvisioner:
    def __init__(self, headless: bool = None):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.headless = Config.HEADLESS_MODE if headless is None else headless

    async def capture_frame(self, page: Page, log_cb=None, label: str = "") -> Optional[str]:
        try:
            raw_bytes = await page.screenshot(type="jpeg", quality=60)
            img_b64 = "data:image/jpeg;base64," + base64.b64encode(raw_bytes).decode("utf-8")
            if log_cb:
                await log_cb({"type": "preview", "image": img_b64, "url": page.url, "title": await page.title(), "label": label})
            return img_b64
        except Exception as e:
            logger.warning(f"Screenshot capture warning: {e}")
            return None

    async def start(self):
        import os
        self.playwright = await async_playwright().start()

        has_display = bool(os.getenv("DISPLAY"))
        is_headless = False if has_display else self.headless

        self.browser = await self.playwright.chromium.launch(
            headless=is_headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-zygote",
                "--disable-infobars",
                "--start-maximized",
            ],
        )
        logger.info(f"Browser launched (headless={is_headless}, display={os.getenv('DISPLAY')})")

    async def stop(self):
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        try:
            if self.playwright:
                await self.playwright.stop()
        except Exception:
            pass
        logger.info("Browser closed")

    async def _human_delay(self, min_ms: int = 500, max_ms: int = 1500):
        await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))

    async def provision_account(self, email: str, password: str = None) -> dict:
        password = password or Config.SARVAM_DEFAULT_PASSWORD
        name = generate_name()

        result = {
            "success": False,
            "email": email,
            "password": password,
            "api_key": None,
            "error": None,
            "awaiting_otp": False,
            "page": None,
            "context": None,
        }

        context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="Asia/Kolkata",
            permissions=["clipboard-read", "clipboard-write"],
        )
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.__meetlog_captured_keys = window.__meetlog_captured_keys || [];

            if (navigator.clipboard) {
                const origWrite = navigator.clipboard.writeText;
                navigator.clipboard.writeText = async function(text) {
                    if (text && typeof text === 'string' && text.includes('sk_')) {
                        window.__meetlog_captured_keys.push(text.trim());
                    }
                    try {
                        return await origWrite.apply(this, arguments);
                    } catch (e) {
                        return Promise.resolve();
                    }
                };
            }
        """)
        page = await context.new_page()

        try:
            logger.info(f"[{email}] Step 1: Navigating to Sarvam registration...")
            await page.goto("https://login.sarvam.ai/registration", wait_until="domcontentloaded", timeout=40000)
            await self._human_delay(1500, 2500)

            logger.info(f"[{email}] Step 2: Entering email address...")
            identifier_input = page.locator("input[name='identifier'], input[placeholder*='Email' i], input[type='text']:not([type='hidden']), input[type='email']").first
            await identifier_input.wait_for(state="visible", timeout=30000)
            await identifier_input.click()
            await identifier_input.fill(email)
            await self._human_delay(500, 1000)

            continue_btn = page.locator("button:has-text('Continue'), button[type='submit']").first
            await continue_btn.click()
            await self._human_delay(2000, 3500)

            logger.info(f"[{email}] Step 3: Entering name and password...")
            name_input = page.locator("input[name='traits.name'], input[placeholder*='Full Name' i], input[placeholder*='Name' i]").first
            await name_input.wait_for(state="visible", timeout=25000)
            await name_input.click()
            await name_input.fill(name)
            await self._human_delay(400, 800)

            pass_input = page.locator("input[name='password'], input[type='password']").first
            await pass_input.wait_for(state="visible", timeout=20000)
            await pass_input.click()
            await pass_input.fill(password)
            await self._human_delay(400, 800)

            logger.info(f"[{email}] Step 4: Submitting account registration...")
            create_btn = page.locator("button:has-text('Create account'), button:has-text('Sign up'), button[type='submit']").first
            await create_btn.click()
            await self._human_delay(2500, 4000)

            logger.info(f"[{email}] Step 5: Registration submitted! Polling Boomlify inbox for OTP...")
            result["awaiting_otp"] = True
            result["page"] = page
            result["context"] = context
            return result

        except Exception as e:
            logger.error(f"[{email}] Registration flow error: {e}")
            try:
                debug_img = Path(Config.LOG_DIR) / f"err_{email.split('@')[0]}.png"
                await page.screenshot(path=str(debug_img))
                logger.info(f"Saved debug screenshot to {debug_img}")
            except Exception:
                pass
            result["error"] = str(e)
            await context.close()
            return result

    async def complete_otp_verification(self, page: Page, otp: str) -> bool:
        try:
            logger.info(f"Entering 6-digit OTP code: {otp}")
            otp_boxes = page.locator("input[type='text']:not([type='hidden']), input[inputmode='numeric']")
            await otp_boxes.first.wait_for(state="visible", timeout=25000)

            box_count = await otp_boxes.count()
            logger.info(f"Found {box_count} OTP input boxes. Typing code {otp}...")

            if box_count >= 6:
                for i in range(min(6, len(otp))):
                    box = otp_boxes.nth(i)
                    await box.click()
                    await box.fill(otp[i])
                    await asyncio.sleep(0.08)
            else:
                first_box = otp_boxes.first
                await first_box.click()
                await first_box.press_sequentially(otp, delay=80)

            await self._human_delay(800, 1500)

            verify_btn = page.locator("button:has-text('Verify'), button[type='submit']").first
            if await verify_btn.count() > 0 and await verify_btn.is_visible():
                await verify_btn.click()

            await self._human_delay(3500, 6000)
            logger.info("OTP verification submitted successfully")
            return True
        except Exception as e:
            logger.error(f"OTP verification error: {e}")
            return False

    async def generate_api_key(self, page: Page, context=None, log_cb=None) -> Optional[list[str]]:
        async def log(msg: str):
            logger.info(msg)
            if log_cb:
                await log_cb({"type": "log", "line": msg})

        network_captured_keys: list[str] = []

        async def on_response(resp):
            try:
                if "sarvam.ai" in resp.url and resp.status in (200, 201):
                    ct = resp.headers.get("content-type", "")
                    if "json" in ct or "text" in ct:
                        body_txt = await resp.text()
                        import re
                        for m in re.findall(r'\b(sk_[a-zA-Z0-9_-]{20,80})\b', body_txt):
                            if m not in network_captured_keys and not "*" in m:
                                network_captured_keys.append(m)
                                logger.info(f"Captured secret key from network API response: {m[:8]}...{m[-4:]}")
            except Exception:
                pass

        page.on("response", on_response)

        async def extract_current_keys() -> list[str]:
            found: list[str] = []
            # 1. From network listener
            for k in network_captured_keys:
                if k and k.startswith("sk_") and not "*" in k and k not in found:
                    found.append(k)

            # 2. From window.__meetlog_captured_keys hook
            try:
                hooked = await page.evaluate("() => window.__meetlog_captured_keys || []")
                for k in hooked:
                    if k and k.startswith("sk_") and not "*" in k and k not in found:
                        found.append(k)
            except Exception:
                pass

            # 3. From clipboard
            try:
                cb = await page.evaluate("navigator.clipboard ? navigator.clipboard.readText() : null")
                if cb and cb.strip().startswith("sk_") and not "*" in cb and cb.strip() not in found:
                    found.append(cb.strip())
            except Exception:
                pass

            # 4. From DOM elements
            try:
                dom_keys = await page.evaluate("""
                    () => {
                        const res = [];
                        for (const el of document.querySelectorAll("input, textarea, code, pre, p, span, div")) {
                            const val = (el.value || el.innerText || "").trim();
                            if (val.startsWith("sk_") && val.length >= 24 && !val.includes("*")) {
                                res.push(val);
                            }
                        }
                        const fullText = document.body.innerText || "";
                        const matches = fullText.match(/\\b(sk_[a-zA-Z0-9_-]{20,80})\\b/g) || [];
                        for (const m of matches) {
                            if (!m.includes("*")) res.push(m);
                        }
                        return res;
                    }
                """)
                for k in dom_keys:
                    if k and k.startswith("sk_") and not "*" in k and k not in found:
                        found.append(k)
            except Exception:
                pass

            return found

        # 1. Complete onboarding wizard cleanly
        if "onboarding" in page.url:
            await log("Completing onboarding setup...")
            try:
                # Role: Developer
                dev_loc = page.locator("text='Developer'").first
                if await dev_loc.count() > 0 and await dev_loc.is_visible():
                    await dev_loc.click()
                    await log("Selected 'Developer' role.")
                    await self._human_delay(300, 600)

                # Goal: Sarvam API
                api_loc = page.locator("text='Sarvam API'").first
                if await api_loc.count() > 0 and await api_loc.is_visible():
                    await api_loc.click()
                    await log("Selected 'Sarvam API' goal.")
                    await self._human_delay(300, 600)

                # Continue to Sarvam API
                cont_btn = page.locator("button:has-text('Continue to Sarvam API'), button:has-text('Continue'), button:has-text('Get Started')").first
                if await cont_btn.count() > 0 and await cont_btn.is_visible():
                    await cont_btn.click()
                    await log("Submitted onboarding choices.")
                    await self._human_delay(1500, 2500)
            except Exception as e:
                logger.warning(f"Onboarding flow warning: {e}")

        keys_found: list[str] = []

        # 2. Wait for initial welcome modal to open ("Here is your first API key to get started")
        await log("Waiting for initial welcome API key modal...")
        try:
            await page.wait_for_selector(
                "button:has-text('I have saved it'), button:has-text('Copy'), text='Here is your first API key'",
                state="visible",
                timeout=12000
            )
        except Exception:
            pass

        await self._human_delay(400, 800)

        # Click Copy button on welcome modal
        try:
            copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
            if await copy_btn.count() > 0 and await copy_btn.is_visible():
                await copy_btn.click()
                await asyncio.sleep(0.3)
        except Exception:
            pass

        # Capture Key #1
        for k in await extract_current_keys():
            if k not in keys_found:
                keys_found.append(k)
                await log(f"Captured initial API Key #1: {k[:8]}...{k[-4:]}")

        # Close welcome modal by clicking "I have saved it"
        try:
            saved_btn = page.locator("button:has-text('I have saved it'), button:has-text('Done'), button:has-text('Close')").first
            if await saved_btn.count() > 0 and await saved_btn.is_visible():
                await saved_btn.click()
                await self._human_delay(300, 600)
            else:
                await page.evaluate("""
                    () => {
                        for (const b of document.querySelectorAll("button, [role='button']")) {
                            const txt = (b.innerText || "").trim();
                            if (txt.includes("I have saved it") || txt === "Done" || txt === "Close") {
                                b.click();
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                await self._human_delay(300, 600)
        except Exception:
            pass

        # 3. Navigate directly to https://indus.sarvam.ai/key-management
        await log("Navigating to https://indus.sarvam.ai/key-management...")
        try:
            await page.goto("https://indus.sarvam.ai/key-management", wait_until="domcontentloaded", timeout=20000)
            # Wait for key management page content to render
            await page.wait_for_selector(
                "button:has-text('Create API Key'), button:has-text('+ Create API Key'), button:has-text('Create Key')",
                state="visible",
                timeout=12000
            )
        except Exception as e:
            await log(f"Page ready check: {e}")

        # If no initial key was found yet, check table copy button
        if len(keys_found) == 0:
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.3)
            except Exception:
                pass
            for k in await extract_current_keys():
                if k not in keys_found:
                    keys_found.append(k)
                    await log(f"Captured table default Key #1: {k[:8]}...{k[-4:]}")

        # 4. Click "+ Create API Key" button
        key_name = f"meetlog-pool-{random.randint(1000, 9999)}"
        await log("Clicking '+ Create API Key' button...")
        try:
            create_btn = page.locator("button:has-text('Create API Key'), button:has-text('+ Create API Key'), button:has-text('Create Key'), [role='button']:has-text('Create')").first
            if await create_btn.count() > 0 and await create_btn.is_visible():
                await create_btn.click()
            else:
                await page.evaluate("""
                    () => {
                        for (const el of document.querySelectorAll("button, [role='button'], a")) {
                            const txt = (el.innerText || "").trim();
                            if (txt.includes("Create API Key") || txt === "+ Create API Key" || txt === "Create Key") {
                                el.click();
                                return true;
                            }
                        }
                        return false;
                    }
                """)
        except Exception:
            pass

        # 5. Wait for name input in modal and enter name
        await log(f"Entering API key name: {key_name}...")
        try:
            name_input = page.locator("input[placeholder*='production-app' i], input[placeholder*='name' i], input[type='text'], input").first
            await name_input.wait_for(state="visible", timeout=8000)
            await name_input.fill(key_name)
        except Exception:
            await page.evaluate("""
                (name) => {
                    const inp = document.querySelector("input[placeholder*='production-app' i]") || 
                                document.querySelector("input[placeholder*='name' i]") || 
                                document.querySelector("input[type='text']") || 
                                document.querySelector("input");
                    if (inp) {
                        inp.focus();
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                        if (nativeSetter) nativeSetter.call(inp, name);
                        else inp.value = name;
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        inp.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            """, key_name)

        await self._human_delay(200, 400)

        # 6. Click "Create key" submit button
        await log("Submitting secondary key creation form...")
        try:
            submit_btn = page.locator("button:has-text('Create key'), button:has-text('Create Key'), button:has-text('Create'), button[type='submit']").first
            if await submit_btn.count() > 0 and await submit_btn.is_visible():
                await submit_btn.click()
            else:
                await page.keyboard.press("Enter")
        except Exception:
            await page.evaluate("""
                () => {
                    for (const b of document.querySelectorAll("button, [role='button'], input[type='submit']")) {
                        const txt = (b.innerText || b.value || "").trim();
                        if (txt === "Create key" || txt === "Create Key" || txt === "Create" || txt === "Save") {
                            b.click();
                            return true;
                        }
                    }
                    return false;
                }
            """)

        # 7. Wait for the created key modal to appear and extract Key #2
        await log("Waiting for created API key modal...")
        try:
            await page.wait_for_selector(
                "button:has-text('I have saved it'), button:has-text('Copy')",
                state="visible",
                timeout=10000
            )
        except Exception:
            pass

        for _ in range(6):
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.3)
            except Exception:
                pass

            curr_extracted = await extract_current_keys()
            new_keys = [k for k in curr_extracted if k not in keys_found]
            if new_keys:
                k2 = new_keys[0]
                keys_found.append(k2)
                await log(f"Captured secondary API Key #2: {k2[:8]}...{k2[-4:]}")
                break

            await asyncio.sleep(0.5)

        # 8. Close the modal by clicking "I have saved it"
        try:
            saved_btn = page.locator("button:has-text('I have saved it'), button:has-text('Done'), button:has-text('Close')").first
            if await saved_btn.count() > 0 and await saved_btn.is_visible():
                await saved_btn.click()
            else:
                await page.evaluate("""
                    () => {
                        for (const b of document.querySelectorAll("button, [role='button']")) {
                            const txt = (b.innerText || "").trim();
                            if (txt.includes("I have saved it") || txt === "Done" || txt === "Close") {
                                b.click();
                                return true;
                            }
                        }
                        return false;
                    }
                """)
            await self._human_delay(200, 500)
        except Exception:
            pass

        unique_keys = list(dict.fromkeys(keys_found))
        await log(f"Account completed: Successfully harvested {len(unique_keys)} active API Key(s)!")
        return unique_keys
