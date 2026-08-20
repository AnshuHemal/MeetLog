
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
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
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

    async def generate_api_key(self, page: Page, context=None, log_cb=None) -> Optional[str]:
        async def log(msg: str):
            logger.info(msg)
            if log_cb:
                await log_cb({"type": "log", "line": msg})

        # 1. Complete onboarding wizard cleanly
        if "onboarding" in page.url:
            await log("Completing onboarding setup...")
            try:
                # Role: Developer
                dev_loc = page.locator("text='Developer'").first
                if await dev_loc.count() > 0 and await dev_loc.is_visible():
                    await dev_loc.click()
                    await log("Selected 'Developer' role.")
                    await self._human_delay(400, 800)

                # Goal: Sarvam API
                api_loc = page.locator("text='Sarvam API'").first
                if await api_loc.count() > 0 and await api_loc.is_visible():
                    await api_loc.click()
                    await log("Selected 'Sarvam API' goal.")
                    await self._human_delay(400, 800)

                # Continue to Sarvam API
                cont_btn = page.locator("button:has-text('Continue to Sarvam API'), button:has-text('Continue'), button:has-text('Get Started')").first
                if await cont_btn.count() > 0 and await cont_btn.is_visible():
                    await cont_btn.click()
                    await log("Submitted onboarding choices.")
                    await self._human_delay(1500, 2500)
            except Exception as e:
                logger.warning(f"Onboarding flow warning: {e}")

        keys_found: list[str] = []

        # 2. Fast Capture of initial API key from welcome modal ("Here is your first API key to get started")
        await log("Capturing initial welcome API key...")
        await self._human_delay(800, 1500)

        try:
            copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
            if await copy_btn.count() > 0 and await copy_btn.is_visible():
                await copy_btn.click()
                await asyncio.sleep(0.3)
                cb_text = await page.evaluate("navigator.clipboard.readText()")
                if cb_text and cb_text.strip().startswith("sk_") and not "*" in cb_text:
                    k1 = cb_text.strip()
                    keys_found.append(k1)
                    await log(f"Captured initial API Key #1: {k1[:8]}...{k1[-4:]}")
        except Exception:
            pass

        # Close welcome modal by clicking "I have saved it"
        try:
            saved_btn = page.locator("button:has-text('I have saved it'), button:has-text('Done'), button:has-text('Close')").first
            if await saved_btn.count() > 0 and await saved_btn.is_visible():
                await saved_btn.click()
                await self._human_delay(400, 800)
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
                await self._human_delay(400, 800)
        except Exception:
            pass

        # 3. Navigate directly to https://indus.sarvam.ai/key-management for secondary API key
        await log("Navigating to https://indus.sarvam.ai/key-management...")
        try:
            await page.goto("https://indus.sarvam.ai/key-management", wait_until="domcontentloaded", timeout=20000)
            await self._human_delay(1000, 1800)
        except Exception as e:
            await log(f"Navigation warning: {e}")

        # 4. If no initial key was found, try copying existing default key from table
        if len(keys_found) == 0:
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.3)
                    cb_text = await page.evaluate("navigator.clipboard.readText()")
                    if cb_text and cb_text.strip().startswith("sk_") and not "*" in cb_text:
                        table_key = cb_text.strip()
                        if table_key not in keys_found:
                            keys_found.append(table_key)
                            await log(f"Captured table default Key #1: {table_key[:8]}...{table_key[-4:]}")
            except Exception:
                pass

        # 5. Fast Click "+ Create API Key" to generate second key
        key_name = f"meetlog-pool-{random.randint(1000, 9999)}"
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

        await self._human_delay(400, 800)

        # 6. Fast Fill name in dialog
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

        # 7. Fast Submit secondary key creation form
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

        await self._human_delay(1000, 1800)

        # 8. Extract unmasked secondary API key
        await log("Extracting secondary API key...")
        for _ in range(8):
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.3)
                    cb_text = await page.evaluate("navigator.clipboard.readText()")
                    if cb_text and cb_text.strip().startswith("sk_") and not "*" in cb_text:
                        if cb_text.strip() not in keys_found:
                            k2 = cb_text.strip()
                            keys_found.append(k2)
                            await log(f"Captured secondary API Key #2: {k2[:8]}...{k2[-4:]}")
                            break
            except Exception:
                pass

            try:
                extracted_token = await page.evaluate("""
                    () => {
                        for (const el of document.querySelectorAll("input, textarea, code, pre")) {
                            let val = (el.value || el.innerText || "").trim();
                            if (val.startsWith("sk_") && val.length >= 24 && !val.includes("*")) return val;
                        }
                        const fullText = document.body.innerText || "";
                        const match = fullText.match(/\\b(sk_[a-zA-Z0-9_-]{20,80})\\b/);
                        if (match && !match[1].includes("*")) return match[1];
                        return null;
                    }
                """)
                if extracted_token and extracted_token not in keys_found:
                    keys_found.append(extracted_token)
                    await log(f"Captured secondary API Key #2: {extracted_token[:8]}...{extracted_token[-4:]}")
                    break
            except Exception:
                pass

            await asyncio.sleep(0.5)

        # 9. Close the dialog by clicking "I have saved it"
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
            await self._human_delay(300, 600)
        except Exception:
            pass

        unique_keys = list(dict.fromkeys(keys_found))
        await log(f"Account completed: Successfully harvested {len(unique_keys)} active API Key(s)!")
        return unique_keys
