
import os
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

class Config:
    BOOMLIFY_API_KEY: str = os.getenv("BOOMLIFY_API_KEY", "")
    BOOMLIFY_BASE_URL: str = "https://v1.boomlify.com"

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    SARVAM_DEFAULT_PASSWORD: str = os.getenv("SARVAM_DEFAULT_PASSWORD", "MeetLog2026!@#")
    SARVAM_ACCOUNT_COUNT: int = int(os.getenv("SARVAM_ACCOUNT_COUNT", "50"))
    SARVAM_DELAY_BETWEEN_ACCOUNTS: int = int(os.getenv("SARVAM_DELAY_BETWEEN_ACCOUNTS", "30"))

    SARVAM_LOGIN_URL: str = "https://login.sarvam.ai/"
    SARVAM_DASHBOARD_URL: str = "https://dashboard.sarvam.ai/"
    SARVAM_API_KEY_URL: str = "https://dashboard.sarvam.ai/settings/api-keys"

    HEADLESS_MODE: bool = os.getenv("HEADLESS_MODE", "false").lower() == "true"

    EMAIL_DURATION: str = "1hour"
    EMAIL_POLL_INTERVAL: int = 5
    EMAIL_POLL_MAX_ATTEMPTS: int = 24

    LOG_DIR: str = str(Path(__file__).parent / "logs")

    @classmethod
    def validate(cls) -> list[str]:
        errors = []
        if not cls.BOOMLIFY_API_KEY:
            errors.append("BOOMLIFY_API_KEY is required. Register at https://boomlify.com/register")
        if not cls.DATABASE_URL:
            errors.append("DATABASE_URL is required. Use your Neon DB connection string.")
        return errors
