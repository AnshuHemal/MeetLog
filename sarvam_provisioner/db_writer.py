
import logging
import psycopg2
from psycopg2.extras import execute_values
from config import Config

logger = logging.getLogger("db")

def get_connection():
    return psycopg2.connect(Config.DATABASE_URL)

def save_api_key(
    api_key: str,
    email: str,
    password: str,
    label: str = None,
    status: str = "ACTIVE",
) -> dict:
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            (api_key, label or f"Auto: {email}", status),
        )
        key_id = cur.fetchone()[0]

        try:
            cur.execute(
                (email, password, key_id, status),
            )
        except Exception:
            conn.rollback()
            cur.execute(
                (api_key, label or f"Auto: {email}", status),
            )
            key_id = cur.fetchone()[0]

        conn.commit()
        cur.close()

        logger.info(f"Saved API key for {email} (id={key_id})")
        return {"success": True, "id": str(key_id), "error": None}

    except Exception as e:
        logger.error(f"Database error saving key for {email}: {e}")
        if conn:
            conn.rollback()
        return {"success": False, "id": None, "error": str(e)}
    finally:
        if conn:
            conn.close()

def save_batch_keys(keys_data: list[dict]) -> dict:
    conn = None
    saved = 0
    failed = 0
    errors = []

    try:
        conn = get_connection()
        cur = conn.cursor()

        for item in keys_data:
            try:
                cur.execute(
                    (
                        item["api_key"],
                        item.get("label") or f"Auto: {item['email']}",
                        item.get("status", "ACTIVE"),
                    ),
                )
                key_id = cur.fetchone()[0]
                saved += 1
            except Exception as e:
                failed += 1
                errors.append({"email": item.get("email"), "error": str(e)})
                logger.error(f"Failed to save key for {item.get('email')}: {e}")

        conn.commit()
        cur.close()

        logger.info(f"Batch save complete: {saved} saved, {failed} failed")
        return {"success": True, "saved": saved, "failed": failed, "errors": errors}

    except Exception as e:
        logger.error(f"Batch database error: {e}")
        if conn:
            conn.rollback()
        return {"success": False, "saved": saved, "failed": failed, "errors": errors}
    finally:
        if conn:
            conn.close()

def get_pool_stats() -> dict:
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
        )

        row = cur.fetchone()
        cur.close()

        return {
            "total": row[0] if row else 0,
            "active": row[1] if row else 0,
            "rate_limited": row[2] if row else 0,
            "exhausted": row[3] if row else 0,
            "disabled": row[4] if row else 0,
            "total_usage": row[5] if row else 0,
        }

    except Exception as e:
        logger.error(f"Error fetching pool stats: {e}")
        return {"total": 0, "active": 0, "rate_limited": 0, "exhausted": 0, "disabled": 0, "total_usage": 0}
    finally:
        if conn:
            conn.close()
