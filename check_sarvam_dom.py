import asyncio
from playwright.async_api import async_playwright

async def main():
    p = await async_playwright().start()
    b = await p.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--window-size=1920,1080",
        ]
    )
    context = await b.new_context(
        viewport={"width": 1920, "height": 1080},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale="en-US",
        timezone_id="Asia/Kolkata",
        extra_http_headers={
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
        }
    )
    
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    
    page = await context.new_page()
    res = await page.goto("https://login.sarvam.ai/registration", timeout=40000)
    await page.wait_for_timeout(4000)
    print("STATUS:", res.status)
    print("PAGE TITLE:", await page.title())
    print("FINAL URL:", page.url)

    inputs = await page.locator("input").all()
    print("FOUND INPUTS:", len(inputs))
    for i in inputs:
        info = await i.evaluate("el => ({ name: el.name, type: el.type, id: el.id, placeholder: el.placeholder })")
        print("INPUT:", info)

    await b.close()
    await p.stop()

if __name__ == "__main__":
    asyncio.run(main())
