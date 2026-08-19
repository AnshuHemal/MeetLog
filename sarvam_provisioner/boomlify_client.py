
import time
import logging
import requests
import re
from typing import Optional
from bs4 import BeautifulSoup
from config import Config

logger = logging.getLogger("boomlify")

class BoomlifyClient:

    def __init__(self, api_key: str = None):
        self.api_key = api_key or Config.BOOMLIFY_API_KEY
        self.base_url = Config.BOOMLIFY_BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        })

    def create_email(self, duration: str = None) -> dict:
        duration = duration or Config.EMAIL_DURATION
        url = f"{self.base_url}/api/v1/emails/create"
        params = {"time": duration}

        logger.info(f"Creating temp email (duration={duration})...")
        response = self.session.post(url, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()

        email_obj = data.get("email") or data.get("data") or data
        if isinstance(email_obj, dict):
            email_id = email_obj.get("id")
            email_address = email_obj.get("address") or email_obj.get("email")
        else:
            email_id = data.get("id")
            email_address = data.get("address") or data.get("email")

        if not email_id or not email_address:
            raise ValueError(f"Unexpected Boomlify response: {data}")

        logger.info(f"Created temp email: {email_address} (id={email_id})")
        return {"id": str(email_id), "address": str(email_address)}

    def get_messages(self, email_id: str) -> list[dict]:
        url = f"{self.base_url}/api/v1/emails/{email_id}/messages"
        params = {"limit": 10, "offset": 0}

        try:
            response = self.session.get(url, params=params, timeout=30)
            if response.status_code == 404:
                url = f"{self.base_url}/api/v1/inbox/{email_id}/messages"
                response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logger.warning(f"Error fetching messages for {email_id}: {e}")
            return []

        messages = data.get("messages")
        if messages is None and isinstance(data.get("data"), dict):
            messages = data["data"].get("messages")
        elif messages is None and isinstance(data.get("data"), list):
            messages = data["data"]
        elif messages is None and isinstance(data.get("email"), dict):
            messages = data["email"].get("messages")

        if isinstance(messages, list):
            return messages
        return []

    def wait_for_message(self, email_id: str, max_attempts: int = None, interval: int = None) -> Optional[dict]:
        max_attempts = max_attempts or Config.EMAIL_POLL_MAX_ATTEMPTS
        interval = interval or Config.EMAIL_POLL_INTERVAL

        for attempt in range(1, max_attempts + 1):
            logger.info(f"Polling inbox (attempt {attempt}/{max_attempts})...")
            messages = self.get_messages(email_id)

            if messages:
                logger.info(f"Received {len(messages)} message(s)!")
                for msg in reversed(messages):
                    subj = (msg.get("subject") or "").lower()
                    from_email = (msg.get("from_email") or "").lower()
                    if "sarvam" in subj or "verify" in subj or "verification" in subj or "code" in subj or "amazonses" in from_email:
                        return msg
                return messages[-1]

            logger.info(f"No messages yet. Waiting {interval}s...")
            time.sleep(interval)

        logger.warning(f"Timeout: No messages received after {max_attempts} attempts")
        return None

    def extract_otp_from_message(self, message: dict) -> Optional[str]:
        body_text = message.get("body_text") or message.get("text") or message.get("body") or ""
        body_html = message.get("body_html") or message.get("html") or ""

        if body_text:
            match = re.search(r"(?:code|below|is|otp)[\s:]*([0-9]{6})\b", body_text, re.IGNORECASE)
            if match:
                otp = match.group(1)
                logger.info(f"Extracted numeric OTP from body_text: {otp}")
                return otp

            digits = re.findall(r"\b([0-9]{6})\b", body_text)
            if digits:
                otp = digits[0]
                logger.info(f"Extracted numeric OTP: {otp}")
                return otp

        if body_html:
            soup = BeautifulSoup(body_html, "html.parser")
            code_el = soup.find(lambda el: el.name in ["span", "div", "p", "td", "strong", "b", "h1", "h2", "h3"] and el.string and re.match(r"^\s*[0-9]{6}\s*$", el.string))
            if code_el and code_el.string:
                otp = code_el.string.strip()
                logger.info(f"Extracted numeric OTP from HTML: {otp}")
                return otp

            clean_text = soup.get_text(separator=" ")
            digits = re.findall(r"\b([0-9]{6})\b", clean_text)
            if digits:
                otp = digits[0]
                logger.info(f"Extracted numeric OTP from parsed HTML: {otp}")
                return otp

        logger.warning("Could not extract numeric OTP from message body")
        logger.debug(f"Message preview: {body_text[:300]}")
        return None

    def delete_email(self, email_id: str) -> bool:
        url = f"{self.base_url}/api/v1/emails/{email_id}"
        try:
            response = self.session.delete(url, timeout=15)
            response.raise_for_status()
            logger.info(f"Deleted temp email {email_id}")
            return True
        except Exception as e:
            logger.warning(f"Failed to delete email {email_id}: {e}")
            return False

    def get_usage(self) -> dict:
        url = f"{self.base_url}/api/v1/account/usage"
        response = self.session.get(url, timeout=15)
        response.raise_for_status()
        return response.json()
