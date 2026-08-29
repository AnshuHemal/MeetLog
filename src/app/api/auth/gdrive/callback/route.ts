import { NextResponse } from "next/server";
import { exchangeGoogleDriveAuthCode } from "@/lib/gdrive";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Google Drive Authorization Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; padding: 32px; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .icon { width: 48px; height: 48px; margin: 0 auto 16px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
    button { background: #27272a; color: #fff; border: 1px solid #3f3f46; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h2>Authorization Denied</h2>
    <p>${error}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (!code) {
    return NextResponse.json({ error: "Authorization code missing" }, { status: 400 });
  }

  const result = await exchangeGoogleDriveAuthCode(code);

  if (!result.success) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Token Exchange Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; padding: 32px; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .icon { width: 48px; height: 48px; margin: 0 auto 16px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
    button { background: #27272a; color: #fff; border: 1px solid #3f3f46; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h2>Authentication Failed</h2>
    <p>${result.error || "Failed to exchange tokens with Google."}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Google Drive Connected</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; padding: 36px 32px; border-radius: 20px; max-width: 440px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }
    .icon { width: 56px; height: 56px; margin: 0 auto 16px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    h2 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 9999px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .subtext { font-size: 12px; color: #71717a; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Google Drive Connected!</h2>
    <div class="badge">Connected: ${result.email || "Authorized User"}</div>
    <p>Your Google Drive OAuth refresh token has been securely synchronized with MeetLog.</p>
    <div class="subtext">This window will automatically close in 2 seconds...</div>
  </div>

  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "GDRIVE_AUTH_SUCCESS", email: "${result.email || ''}" }, "*");
      }
    } catch(e) {}
    setTimeout(function() {
      window.close();
    }, 1800);
  </script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
