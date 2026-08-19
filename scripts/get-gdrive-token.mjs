import http from "http";
import fs from "fs";
import path from "path";
import readline from "readline";
import axios from "axios";

/**
 * Google Drive OAuth Refresh Token Generator
 *
 * This utility uses your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * from .env to generate a valid, permanent GOOGLE_REFRESH_TOKEN.
 */

const envPath = path.resolve(process.cwd(), ".env");
let envContent = "";
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, "utf-8");
}

function getEnvValue(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const clientId = getEnvValue("GOOGLE_CLIENT_ID");
const clientSecret = getEnvValue("GOOGLE_CLIENT_SECRET");

if (!clientId || !clientSecret) {
  console.error("\n❌ Error: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env.");
  console.error("Please add them to your .env file first.\n");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const REDIRECT_URI = "http://localhost:8085/oauth2callback";

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("\n=======================================================");
console.log("   🔑 Google Drive OAuth Refresh Token Generator");
console.log("=======================================================\n");
console.log("Using Client ID:", clientId);
console.log("\nOption A (Automatic):");
console.log("1. Add this Authorized redirect URI to your Google Cloud OAuth Client:");
console.log(`   👉  ${REDIRECT_URI}`);
console.log("\n2. Open this link in your browser to authorize:");
console.log(`👉  ${authUrl.toString()}\n`);

console.log("Option B (OAuth Playground):");
console.log("1. Go to https://developers.google.com/oauthplayground");
console.log("2. Click the ⚙️ (Settings) top-right, check 'Use your own OAuth credentials'");
console.log(`   - OAuth Client ID: ${clientId}`);
console.log(`   - OAuth Client secret: ${clientSecret}`);
console.log("3. In Step 1, select 'Drive API v3' -> 'https://www.googleapis.com/auth/drive'");
console.log("4. Click 'Authorize APIs' and log in with your Google account");
console.log("5. In Step 2, click 'Exchange authorization code for tokens'");
console.log("6. Copy the 'Refresh token' value and paste it in your .env as GOOGLE_REFRESH_TOKEN=...\n");

let server;
try {
  server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:8085`);
    if (reqUrl.pathname === "/oauth2callback") {
      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
        console.error("\n❌ Authorization was rejected:", error);
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #10b981;">Authorization Successful!</h1>
              <p>You can close this tab and return to your terminal.</p>
            </body>
          </html>
        `);
        console.log("\n✅ Authorization code received from browser!");
        await exchangeCodeForTokens(code, REDIRECT_URI);
      }
    }
  });

  server.listen(8085, () => {
    console.log("Waiting for authorization on http://localhost:8085/oauth2callback ...");
    console.log("(Or paste an authorization code from OAuth Playground / Google Redirect below)\n");
    promptManualCode();
  });
} catch (e) {
  promptManualCode();
}

function promptManualCode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter authorization code or refresh token here: ", async (answer) => {
    rl.close();
    let val = answer.trim();

    // If user directly pasted a refresh token (starts with 1//)
    if (val.startsWith("1//") || val.startsWith("1/")) {
      console.log("\nDirect refresh token detected!");
      updateEnvFile("GOOGLE_REFRESH_TOKEN", val);
      console.log("\n🚀 Google Drive storage is now configured in .env!\n");
      if (server) server.close();
      process.exit(0);
      return;
    }

    if (val.includes("code=")) {
      const match = val.match(/code=([^&]+)/);
      if (match) val = decodeURIComponent(match[1]);
    }

    if (val) {
      await exchangeCodeForTokens(val, REDIRECT_URI);
    }
  });
}

async function exchangeCodeForTokens(code, redirectUri) {
  const candidateRedirects = [
    redirectUri,
    "https://developers.google.com/oauthplayground",
    "http://localhost:3000",
    "urn:ietf:wg:oauth:2.0:oob",
  ];

  let success = false;
  for (const rUri of candidateRedirects) {
    try {
      console.log(`\nExchanging code with redirect_uri: ${rUri}...`);
      const response = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: rUri,
          grant_type: "authorization_code",
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      const { refresh_token, access_token } = response.data;

      if (!refresh_token) {
        console.warn("\n⚠️ Google returned an access token without a refresh token.");
        console.warn("Please re-authenticate and make sure you approve offline access consent.");
      } else {
        console.log("\n🎉 Successfully obtained new Refresh Token!");
        console.log(`GOOGLE_REFRESH_TOKEN=${refresh_token}\n`);
        updateEnvFile("GOOGLE_REFRESH_TOKEN", refresh_token);
      }

      if (access_token) {
        console.log("Testing Google Drive API connection with access token...");
        const driveTest = await axios.get("https://www.googleapis.com/drive/v3/about?fields=user", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        console.log(`✅ Verified! Connected to Drive: ${driveTest.data.user?.emailAddress || "Authorized User"}`);
      }

      console.log("\n🚀 Google Drive storage is now fully ready for large file uploads!\n");
      success = true;
      break;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (data?.error === "redirect_uri_mismatch") {
        continue;
      }
      console.error(`\n❌ Failed token exchange (${status}):`, data || err.message);
      break;
    }
  }

  if (server) server.close();
  process.exit(success ? 0 : 1);
}

function updateEnvFile(key, value) {
  try {
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, "utf-8");

    if (content.match(new RegExp(`^${key}=.*$`, "m"))) {
      content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }

    fs.writeFileSync(envPath, content, "utf-8");
    console.log(`✅ Automatically updated ${key} in .env!`);
  } catch (err) {
    console.error("Failed to update .env automatically:", err.message);
  }
}
