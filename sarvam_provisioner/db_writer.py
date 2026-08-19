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

        sql_insert_pool = "INSERT INTO api_key_pools (\"id\", \"provider\", \"key\", \"label\", \"status\", \"usageCount\", \"errorCount\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid()::text, 'SARVAM', %s, %s, %s, 0, 0, NOW(), NOW()) RETURNING \"id\""
        cur.execute(sql_insert_pool, (api_key, label or f"Auto: {email}", status))
        key_id = cur.fetchone()[0]

        try:
            sql_insert_account = "INSERT INTO sarvam_provisioned_accounts (id, email, password, api_key_pool_id, status, created_at, updated_at) VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW(), NOW())"
            cur.execute(sql_insert_account, (email, password, key_id, status))
        except Exception:
            conn.rollback()
            cur.execute(sql_insert_pool, (api_key, label or f"Auto: {email}", status))
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

        sql_insert_pool = "INSERT INTO api_key_pools (\"id\", \"provider\", \"key\", \"label\", \"status\", \"usageCount\", \"errorCount\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid()::text, 'SARVAM', %s, %s, %s, 0, 0, NOW(), NOW()) RETURNING \"id\""

        for item in keys_data:
            try:
                cur.execute(
                    sql_insert_pool,
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

        sql_stats = """SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE "status" = 'ACTIVE') as active, COUNT(*) FILTER (WHERE "status" = 'RATE_LIMITED') as rate_limited, COUNT(*) FILTER (WHERE "status" = 'EXHAUSTED') as exhausted, COUNT(*) FILTER (WHERE "status" = 'DISABLED') as disabled, COALESCE(SUM("usageCount"), 0) as total_usage FROM api_key_pools WHERE "provider" = 'SARVAM'"""
        cur.execute(sql_stats)

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
