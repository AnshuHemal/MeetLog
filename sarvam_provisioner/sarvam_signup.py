
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

    async def complete_onboarding_and_extract_key(self, page: Page, context) -> Optional[str]:
        try:
            logger.info("Handling post-signup onboarding flow...")

            logger.info("Onboarding Step 1: Selecting 'Developer' role...")
            try:
                dev_btn = page.get_by_text("Developer", exact=False).first
                await dev_btn.wait_for(state="visible", timeout=25000)
                await dev_btn.click()
                await self._human_delay(1500, 2500)
            except Exception as e:
                logger.warning(f"Role selection not clicked: {e}")

            logger.info("Onboarding Step 2: Selecting 'Sarvam API'...")
            try:
                api_btn = page.get_by_text("Sarvam API", exact=False).first
                await api_btn.wait_for(state="visible", timeout=20000)
                await api_btn.click()
                await self._human_delay(1500, 2500)
            except Exception as e:
                logger.warning(f"Goal selection not clicked: {e}")

            logger.info("Onboarding Step 3: Clicking 'Continue to Sarvam API'...")
            try:
                continue_btn = page.get_by_text("Continue to Sarvam API", exact=False).first
                await continue_btn.wait_for(state="visible", timeout=20000)
                await continue_btn.click()
                await self._human_delay(3000, 4500)
            except Exception as e:
                logger.warning(f"Continue button not clicked: {e}")

            # First try extracting directly from any inputs/code tags
            for sel in ["input[readonly]", "input[type='text']", "code", "pre", "span", "div"]:
                for el in await page.locator(sel).all():
                    try:
                        val = await el.get_attribute("value")
                        if not val:
                            val = await el.inner_text()
                        val = (val or "").strip()
                        if val and 20 <= len(val) <= 80 and (" " not in val) and not val.startswith("http") and ("*" not in val) and ("•" not in val) and not val.startswith("Account"):
                            logger.info(f"API key extracted from element: {val[:8]}...{val[-4:]}")
                            return val
                    except Exception:
                        pass

            copy_btn = page.locator("button:has-text('Copy'), [aria-label*='copy' i], svg[class*='copy' i]").first
            try:
                if await copy_btn.count() > 0 and await copy_btn.is_visible():
                    logger.info("Clicking modal 'Copy' button...")
                    await copy_btn.click()
                    await self._human_delay(800, 1500)

                    clipboard_text = await page.evaluate("navigator.clipboard.readText()")
                    if clipboard_text and len(clipboard_text) >= 15:
                        api_key = clipboard_text.strip()
                        logger.info(f"API key successfully extracted via clipboard: {api_key[:8]}...{api_key[-4:]}")

                        try:
                            save_btn = page.locator("button:has-text('I have saved it'), button:has-text('Done'), button:has-text('Close')").first
                            if await save_btn.count() > 0 and await save_btn.is_visible():
                                await save_btn.click()
                        except Exception:
                            pass

                        return api_key
            except Exception as e:
                logger.warning(f"Copy button / clipboard extraction warning: {e}")

            return None

        except Exception as e:
            logger.error(f"Onboarding flow error: {e}")
            return None

    async def generate_api_key(self, page: Page, context=None) -> Optional[str]:
        api_key = await self.complete_onboarding_and_extract_key(page, context)
        if api_key:
            return api_key

        try:
            logger.info("Fallback: Navigating to API keys settings...")
            await page.goto("https://indus.sarvam.ai/developer", wait_until="domcontentloaded", timeout=30000)
            await self._human_delay(2000, 3500)

            copy_btn = page.get_by_text("Copy", exact=True).first
            if await copy_btn.count() > 0 and await copy_btn.is_visible():
                await copy_btn.click()
                await self._human_delay(500, 1000)
                clipboard_text = await page.evaluate("navigator.clipboard.readText()")
                if clipboard_text and len(clipboard_text) >= 15:
                    return clipboard_text.strip()

            key_triggers = [
                "button:has-text('Generate API Key')",
                "button:has-text('Create Key')",
                "button:has-text('Create API Key')",
                "button:has-text('New API Key')",
            ]

            for tr in key_triggers:
                el = page.locator(tr).first
                if await el.count() > 0 and await el.is_visible():
                    logger.info(f"Clicking API key trigger ({tr})...")
                    await el.click()
                    await self._human_delay(1500, 2500)
                    break

            name_input = page.locator("input[name='name'], input[placeholder*='name' i], input[placeholder*='key' i]").first
            if await name_input.count() > 0 and await name_input.is_visible():
                await name_input.fill(f"meetlog-pool-{random.randint(1000,9999)}")
                await self._human_delay(400, 800)

                confirm_btn = page.locator("button:has-text('Create'), button:has-text('Generate'), button:has-text('Save'), button[type='submit']").first
                if await confirm_btn.count() > 0 and await confirm_btn.is_visible():
                    await confirm_btn.click()
                    await self._human_delay(2500, 4000)

            for sel in ["code", "pre", "[class*='key']", "input[readonly]", "textarea[readonly]"]:
                for el in await page.locator(sel).all():
                    val = await el.inner_text()
                    if not val:
                        val = await el.get_attribute("value") or ""
                    val = val.strip()
                    if val and len(val) >= 20 and (" " not in val):
                        logger.info(f"API key successfully extracted: {val[:8]}...{val[-4:]}")
                        return val

            logger.warning("Could not find generated API key on page")
            return None

        except Exception as e:
            logger.error(f"API key generation fallback error: {e}")
            return None
