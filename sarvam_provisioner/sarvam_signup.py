
import asyncio
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

    async def complete_onboarding_and_extract_key(self, page: Page, context=None, log_cb=None) -> Optional[str]:
        async def log(msg: str):
            logger.info(msg)
            if log_cb:
                await log_cb(msg)

        try:
            await log(f"Checking post-signup onboarding (URL: {page.url})...")
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
            await self._human_delay(2000, 3000)

            await log("Onboarding Step 1: Selecting 'Developer' role...")
            for dev_sel in ["button:has-text('Developer')", "[role='button']:has-text('Developer')", "div:has-text('Developer')", "span:has-text('Developer')"]:
                try:
                    dev_btn = page.locator(dev_sel).first
                    if await dev_btn.count() > 0 and await dev_btn.is_visible():
                        await dev_btn.click()
                        await self._human_delay(1500, 2500)
                        await log("Selected 'Developer' role.")
                        break
                except Exception:
                    pass

            await log("Onboarding Step 2: Selecting 'Sarvam API' goal...")
            for api_sel in ["button:has-text('Sarvam API')", "[role='button']:has-text('Sarvam API')", "div:has-text('Sarvam API')", "span:has-text('Sarvam API')"]:
                try:
                    api_btn = page.locator(api_sel).first
                    if await api_btn.count() > 0 and await api_btn.is_visible():
                        await api_btn.click()
                        await self._human_delay(1500, 2500)
                        await log("Selected 'Sarvam API' goal.")
                        break
                except Exception:
                    pass

            await log("Onboarding Step 3: Clicking 'Continue'...")
            for cont_sel in ["button:has-text('Continue to Sarvam API')", "button:has-text('Continue')", "button:has-text('Get Started')", "button:has-text('Next')"]:
                try:
                    continue_btn = page.locator(cont_sel).first
                    if await continue_btn.count() > 0 and await continue_btn.is_visible():
                        await continue_btn.click()
                        await self._human_delay(3000, 5000)
                        await log("Submitted onboarding choices.")
                        break
                except Exception:
                    pass

            await log("Onboarding Step 4: Extracting API key from dialog or page...")
            extracted_key = await page.evaluate("""
                () => {
                    const candidateSelectors = ["input", "textarea", "code", "pre", "span", "p", "div", "td"];
                    for (const sel of candidateSelectors) {
                        for (const el of document.querySelectorAll(sel)) {
                            let val = (el.value || el.innerText || "").trim();
                            if (val && val.length >= 24 && val.length <= 80 && !val.includes(" ") && !val.startsWith("http") && !val.includes("*") && !val.includes("•") && !val.startsWith("Account") && !val.startsWith("Developer") && !val.startsWith("Sarvam")) {
                                return val;
                            }
                        }
                    }
                    return null;
                }
            """)
            if extracted_key:
                await log(f"API key extracted from modal: {extracted_key[:8]}...{extracted_key[-4:]}")
                return extracted_key

            copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
            try:
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    await log("Clicking modal 'Copy' button...")
                    await copy_btn.click()
                    await self._human_delay(500, 1000)

                    clipboard_text = await page.evaluate("navigator.clipboard.readText()")
                    if clipboard_text and len(clipboard_text.strip()) >= 15:
                        api_key = clipboard_text.strip()
                        await log(f"API key extracted via clipboard: {api_key[:8]}...{api_key[-4:]}")
                        return api_key
            except Exception as e:
                logger.warning(f"Copy button / clipboard extraction warning: {e}")

            return None

        except Exception as e:
            await log(f"Onboarding flow error: {e}")
            return None

    async def generate_api_key(self, page: Page, context=None, log_cb=None) -> Optional[str]:
        async def log(msg: str):
            logger.info(msg)
            if log_cb:
                await log_cb(msg)

        api_key = await self.complete_onboarding_and_extract_key(page, context, log_cb=log_cb)
        if api_key:
            return api_key

        for dash_url in ["https://indus.sarvam.ai/developer", "https://dashboard.sarvam.ai/developer", "https://indus.sarvam.ai/api-keys"]:
            try:
                await log(f"Navigating to developer dashboard ({dash_url})...")
                await page.goto(dash_url, wait_until="domcontentloaded", timeout=30000)
                await self._human_delay(2000, 3000)

                table_key = await page.evaluate("""
                    () => {
                        for (const el of document.querySelectorAll("input, textarea, code, pre, [class*='key'], td, span")) {
                            let val = (el.value || el.innerText || "").trim();
                            if (val && val.length >= 24 && val.length <= 80 && !val.includes(" ") && !val.startsWith("http") && !val.startsWith("Developer") && !val.startsWith("Account")) {
                                return val;
                            }
                        }
                        return null;
                    }
                """)
                if table_key:
                    await log(f"API key found in dashboard table: {table_key[:8]}...{table_key[-4:]}")
                    return table_key

                key_triggers = [
                    "button:has-text('Generate API Key')",
                    "button:has-text('Create API Key')",
                    "button:has-text('Create Key')",
                    "button:has-text('New API Key')",
                    "button:has-text('Generate Key')",
                    "button:has-text('+ Create')",
                ]

                for tr in key_triggers:
                    el = page.locator(tr).first
                    if await el.count() > 0 and await el.is_visible():
                        await log(f"Clicking API key trigger ({tr})...")
                        await el.click()
                        await self._human_delay(1200, 2000)

                        name_input = page.locator("input[name='name'], input[placeholder*='name' i], input[placeholder*='key' i]").first
                        if await name_input.count() > 0 and await name_input.is_visible():
                            await name_input.fill(f"meetlog-pool-{random.randint(1000,9999)}")
                            await self._human_delay(400, 800)

                            confirm_btn = page.locator("button:has-text('Create'), button:has-text('Generate'), button:has-text('Save'), button[type='submit']").first
                            if await confirm_btn.count() > 0 and await confirm_btn.is_visible():
                                await confirm_btn.click()
                                await self._human_delay(2000, 3500)

                        created_key = await page.evaluate("""
                            () => {
                                for (const el of document.querySelectorAll("input, textarea, code, pre, [class*='key'], span, div")) {
                                    let val = (el.value || el.innerText || "").trim();
                                    if (val && val.length >= 24 && val.length <= 80 && !val.includes(" ") && !val.startsWith("http")) {
                                        return val;
                                    }
                                }
                                return null;
                            }
                        """)
                        if created_key:
                            await log(f"Newly generated API key extracted: {created_key[:8]}...{created_key[-4:]}")
                            return created_key
            except Exception as e:
                logger.warning(f"Failed fallback navigation to {dash_url}: {e}")

        await log("Could not extract API key from any dashboard flow.")
        return None
