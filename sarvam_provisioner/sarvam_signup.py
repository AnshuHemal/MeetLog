
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

        # 1. Complete onboarding wizard steps until redirected away from /onboarding
        try:
            await log("Handling initial onboarding setup...")
            for attempt in range(1, 15):
                curr_url = page.url
                await log(f"Checking onboarding status (attempt {attempt}/15, URL: {curr_url})...")
                await self.capture_frame(page, log_cb, f"Onboarding Check {attempt}")

                if "onboarding" not in curr_url and attempt > 3:
                    await log("Successfully exited onboarding wizard!")
                    break

                # Role: Developer (Click card containing "Developer")
                dev_clicked = False
                try:
                    dev_locator = page.locator("text='Developer'").first
                    if await dev_locator.count() > 0 and await dev_locator.is_visible():
                        await dev_locator.click()
                        dev_clicked = True
                except Exception:
                    pass

                if not dev_clicked:
                    dev_clicked = await page.evaluate("""
                        () => {
                            for (const el of document.querySelectorAll("div, button, [role='button'], a, li, span, p")) {
                                const txt = (el.innerText || "").trim();
                                if (txt.includes("Developer") && !txt.includes("Which role") && !txt.includes("Founder") && !txt.includes("Product") && txt.length < 50) {
                                    el.click();
                                    return true;
                                }
                            }
                            return false;
                        }
                    """)

                if dev_clicked:
                    await log("Selected 'Developer' role card.")
                    await self._human_delay(1000, 1800)
                    await self.capture_frame(page, log_cb, "Selected Developer")

                # Goal: Sarvam API (Click card containing "Sarvam API")
                api_clicked = False
                try:
                    api_locator = page.locator("text='Sarvam API'").first
                    if await api_locator.count() > 0 and await api_locator.is_visible():
                        await api_locator.click()
                        api_clicked = True
                except Exception:
                    pass

                if not api_clicked:
                    api_clicked = await page.evaluate("""
                        () => {
                            for (const el of document.querySelectorAll("div, button, [role='button'], a, li, span, p")) {
                                const txt = (el.innerText || "").trim();
                                if (txt.includes("Sarvam API") && !txt.includes("Which role") && !txt.includes("goal") && txt.length < 60) {
                                    el.click();
                                    return true;
                                }
                            }
                            return false;
                        }
                    """)

                if api_clicked:
                    await log("Selected 'Sarvam API' goal card.")
                    await self._human_delay(1000, 1800)
                    await self.capture_frame(page, log_cb, "Selected Sarvam API")

                # Continue / Continue to Sarvam API button
                cont_text = None
                try:
                    cont_btn = page.locator("button:has-text('Continue to Sarvam API'), button:has-text('Continue'), button:has-text('Get Started'), button:has-text('Next')").first
                    if await cont_btn.count() > 0 and await cont_btn.is_visible():
                        cont_text = await cont_btn.inner_text()
                        await cont_btn.click()
                except Exception:
                    pass

                if not cont_text:
                    cont_text = await page.evaluate("""
                        () => {
                            for (const el of document.querySelectorAll("button, [role='button'], a")) {
                                const txt = (el.innerText || "").trim();
                                if (txt === "Continue to Sarvam API" || txt === "Continue" || txt === "Get Started" || txt === "Next") {
                                    el.click();
                                    return txt;
                                }
                            }
                            return null;
                        }
                    """)

                if cont_text:
                    await log(f"Clicked onboarding '{cont_text.strip()}' button.")
                    await self._human_delay(2500, 4000)
                    await self.capture_frame(page, log_cb, f"After '{cont_text.strip()}'")

                await asyncio.sleep(1)
        except Exception as e:
            logger.warning(f"Onboarding flow check: {e}")

        keys_found: list[str] = []

        # 2. Check for initial auto-generated API key popup right after onboarding
        await log("Checking for initial auto-generated API key popup...")
        await self._human_delay(1500, 2500)
        await self.capture_frame(page, log_cb, "Post-Onboarding Screen")

        for _ in range(3):
            try:
                initial_key = await page.evaluate("""
                    () => {
                        for (const el of document.querySelectorAll("input, textarea, code, pre")) {
                            let val = (el.value || el.innerText || "").trim();
                            if (val.startsWith("sk_") && val.length >= 24 && !val.includes("*")) {
                                return val;
                            }
                        }
                        const fullText = document.body.innerText || "";
                        const match = fullText.match(/\\b(sk_[a-zA-Z0-9_-]{20,80})\\b/);
                        if (match && !match[1].includes("*")) {
                            return match[1];
                        }
                        return null;
                    }
                """)
                if initial_key and initial_key not in keys_found:
                    keys_found.append(initial_key)
                    await log(f"Captured initial auto-generated Key #1: {initial_key[:8]}...{initial_key[-4:]}")
                    break
            except Exception:
                pass
            await asyncio.sleep(1)

        # Dismiss any welcome / initial key dialog if visible
        try:
            await page.evaluate("""
                () => {
                    for (const b of document.querySelectorAll("button, [role='button']")) {
                        const txt = (b.innerText || "").trim();
                        if (txt.includes("I have saved it") || txt === "Done" || txt === "Close" || txt === "Get Started") {
                            b.click();
                            return true;
                        }
                    }
                    return false;
                }
            """)
            await self._human_delay(1000, 1800)
        except Exception:
            pass

        # 3. Navigate directly to https://indus.sarvam.ai/key-management
        await log("Navigating directly to https://indus.sarvam.ai/key-management to create secondary API key...")
        try:
            await page.goto("https://indus.sarvam.ai/key-management", wait_until="domcontentloaded", timeout=30000)
            await self._human_delay(2000, 3500)
            await self.capture_frame(page, log_cb, "Key Management Page Loaded")
        except Exception as e:
            await log(f"Navigation warning: {e}")

        # If redirected back to onboarding, complete whatever is visible
        if "onboarding" in page.url:
            await log("Detected onboarding redirect, completing final step...")
            await page.evaluate("""
                () => {
                    for (const el of document.querySelectorAll("div, button, [role='button']")) {
                        const txt = (el.innerText || "").trim();
                        if (txt.includes("Developer") || txt.includes("Sarvam API") || txt.includes("Continue")) {
                            el.click();
                        }
                    }
                }
            """)
            await self._human_delay(2500, 3500)
            try:
                await page.goto("https://indus.sarvam.ai/key-management", wait_until="domcontentloaded", timeout=20000)
                await self._human_delay(2000, 3000)
            except Exception:
                pass

        # 4. If no initial key was found, try copying existing default key from table
        if len(keys_found) == 0:
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.5)
                    cb_text = await page.evaluate("navigator.clipboard.readText()")
                    if cb_text and cb_text.strip().startswith("sk_") and not "*" in cb_text:
                        table_key = cb_text.strip()
                        if table_key not in keys_found:
                            keys_found.append(table_key)
                            await log(f"Captured default table Key #1: {table_key[:8]}...{table_key[-4:]}")
            except Exception:
                pass

        # 5. Locate and click "+ Create API Key" to generate second key
        key_name = f"meetlog-pool-{random.randint(1000, 9999)}"
        await log("Waiting for '+ Create API Key' button to render...")

        try:
            await page.wait_for_selector(
                "button:has-text('Create API Key'), button:has-text('+ Create API Key'), button:has-text('Create Key'), [role='button']:has-text('Create')",
                state="visible",
                timeout=20000
            )
        except Exception:
            pass

        create_btn = page.locator("button:has-text('Create API Key'), button:has-text('+ Create API Key'), button:has-text('Create Key'), button:has-text('+ Create')").first
        if await create_btn.count() > 0 and await create_btn.is_visible():
            await create_btn.click()
            await log("Clicked '+ Create API Key' button.")
        else:
            # Fallback JS click
            await page.evaluate("""
                () => {
                    for (const el of document.querySelectorAll("button, [role='button'], a, div, span")) {
                        const txt = (el.innerText || "").trim();
                        if (txt.includes("Create API Key") || txt === "+ Create API Key" || txt === "Create Key") {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }
            """)
            await log("Triggered JS click on '+ Create API Key'.")

        await self._human_delay(1200, 2000)
        await self.capture_frame(page, log_cb, "Create Key Dialog Opened")

        # 6. Fill key name in dialog using real native keystrokes
        await log(f"Entering API key name: {key_name}...")
        try:
            name_input = page.locator("input[placeholder*='production-app' i], input[placeholder*='name' i], input[type='text'], input").first
            await name_input.wait_for(state="visible", timeout=12000)
            await name_input.click()
            await name_input.fill("")
            await name_input.press_sequentially(key_name, delay=30)
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

        await self._human_delay(800, 1500)
        await self.capture_frame(page, log_cb, "Key Name Entered")

        # 7. Click "Create key" submit button
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

        await self._human_delay(2000, 3500)
        await self.capture_frame(page, log_cb, "Key Confirmation Dialog")

        # 8. Extract unmasked API key from confirmation dialog (polling up to 15 seconds)
        await log("Extracting unmasked API key from confirmation dialog...")
        key_2 = None

        for attempt_sec in range(15):
            try:
                extracted_token = await page.evaluate("""
                    () => {
                        // 1. Check all inputs and textareas
                        for (const el of document.querySelectorAll("input, textarea, code, pre")) {
                            let val = (el.value || el.innerText || "").trim();
                            if (val.startsWith("sk_") && val.length >= 24 && !val.includes("*")) {
                                return val;
                            }
                        }
                        // 2. Scan entire page body text for unmasked sk_ token
                        const fullText = document.body.innerText || "";
                        const match = fullText.match(/\\b(sk_[a-zA-Z0-9_-]{20,80})\\b/);
                        if (match && !match[1].includes("*")) {
                            return match[1];
                        }
                        return null;
                    }
                """)
                if extracted_token and extracted_token not in keys_found:
                    key_2 = extracted_token
                    keys_found.append(key_2)
                    await log(f"API Key #2 extracted from dialog: {key_2[:8]}...{key_2[-4:]}")
                    break
            except Exception:
                pass

            # Try clicking Copy button if available
            try:
                copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await copy_btn.click()
                    await asyncio.sleep(0.5)
                    cb_text = await page.evaluate("navigator.clipboard.readText()")
                    if cb_text and cb_text.strip().startswith("sk_") and not "*" in cb_text:
                        if cb_text.strip() not in keys_found:
                            key_2 = cb_text.strip()
                            keys_found.append(key_2)
                            await log(f"API Key #2 extracted via clipboard: {key_2[:8]}...{key_2[-4:]}")
                            break
            except Exception:
                pass

            await asyncio.sleep(1)

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
            await self._human_delay(500, 1000)
            await self.capture_frame(page, log_cb, "Key Saved & Done")
        except Exception:
            pass

        # Deduplicate keys found
        unique_keys = list(dict.fromkeys(keys_found))
        await log(f"Account completed: Harvested {len(unique_keys)} active API Key(s)!")
        return unique_keys
