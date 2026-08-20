import { NextRequest } from "next/server";
import { getUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function findPythonCommand(): string {
  const isWin = process.platform === "win32";
  return isWin ? "python" : "python3";
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { workspaceSlug, count = 1, dryRun = false, headless = false } = body;

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspace: { slug: workspaceSlug },
      },
    });

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden: You do not have workspace access." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const remoteServiceUrl =
      process.env.PROVISIONER_SERVICE_URL || "https://meetlog-sarvam-provisioner.onrender.com";

    // If headless is true, route to cloud microservice; if headed (visible window), execute locally so user physically sees Chrome
    if (remoteServiceUrl && headless) {
      try {
        console.log(`[PROVISION PROXY] Forwarding request to remote provisioner: ${remoteServiceUrl}...`);
        const remoteRes = await fetch(`${remoteServiceUrl.replace(/\/$/, "")}/provision`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.PROVISIONER_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.PROVISIONER_AUTH_TOKEN}` } : {}),
          },
          body: JSON.stringify({ count, dry_run: dryRun, headless }),
        });

        if (!remoteRes.ok || !remoteRes.body) {
          const errDetail = await remoteRes.text().catch(() => "");
          throw new Error(`Remote provisioner HTTP ${remoteRes.status}: ${errDetail || remoteRes.statusText}`);
        }

        const remoteReader = remoteRes.body.getReader();
        const customStream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await remoteReader.read();
                if (done) {
                  controller.close();
                  break;
                }
                controller.enqueue(value);
              }
            } catch (streamErr) {
              controller.error(streamErr);
            }
          },
          cancel() {
            remoteReader.cancel().catch(() => {});
          },
        });

        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } catch (err: any) {
        console.error("[REMOTE PROVISIONER ERROR]", err);
        const scriptPath = path.join(process.cwd(), "sarvam_provisioner", "main.py");
        if (!fs.existsSync(scriptPath)) {
          return new Response(JSON.stringify({ error: `Remote provisioner error: ${err.message}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        console.warn("[PROVISION FALLBACK] Falling back to local provisioner script...");
      }
    }

    const provisionerDir = path.join(process.cwd(), "sarvam_provisioner");
    const scriptPath = path.join(provisionerDir, "main.py");

    if (!fs.existsSync(scriptPath)) {
      return new Response(
        JSON.stringify({
          error: "Provisioner script not found. For Vercel, please set PROVISIONER_SERVICE_URL in environment variables.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const pythonCmd = findPythonCommand();
    const args: string[] = ["main.py", "--count", String(Math.min(Math.max(1, count), 20))];
    if (dryRun) args.push("--dry-run");
    if (headless) args.push("--headless");

    const encoder = new TextEncoder();
    let isClosed = false;

    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (event: string, data: any) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            isClosed = true;
          }
        };

        sendEvent("status", {
          status: "started",
          targetCount: count,
          dryRun,
          headless,
          timestamp: new Date().toISOString(),
        });

        const proc = spawn(pythonCmd, args, {
          cwd: provisionerDir,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
          },
        });

        let currentAccount = 1;
        let createdKeys: string[] = [];

        proc.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          const lines = text.split("\n");

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            sendEvent("log", { line: trimmed, timestamp: new Date().toISOString() });

            if (trimmed.includes("Account ") && trimmed.includes("Creating temp email")) {
              const match = trimmed.match(/Account\s+(\d+)/i);
              if (match) currentAccount = parseInt(match[1], 10);
              sendEvent("step", {
                account: currentAccount,
                step: "create_email",
                label: `Account ${currentAccount}: Generating temporary inbox...`,
              });
            } else if (trimmed.includes("Created temp email:")) {
              const emailMatch = trimmed.match(/Created temp email:\s*([^\s(]+)/);
              sendEvent("step", {
                account: currentAccount,
                step: "email_created",
                email: emailMatch ? emailMatch[1] : undefined,
                label: `Inbox created: ${emailMatch ? emailMatch[1] : ""}`,
              });
            } else if (trimmed.includes("Step 1: Navigating to Sarvam")) {
              sendEvent("step", {
                account: currentAccount,
                step: "navigating",
                label: "Submitting Sarvam registration...",
              });
            } else if (trimmed.includes("Step 4: Submitting account registration")) {
              sendEvent("step", {
                account: currentAccount,
                step: "form_submitted",
                label: "Registration submitted. Awaiting verification code...",
              });
            } else if (trimmed.includes("Extracted numeric OTP from body_text:") || trimmed.includes("Verifying OTP:")) {
              const otpMatch = trimmed.match(/(\d{6})/);
              sendEvent("step", {
                account: currentAccount,
                step: "otp_received",
                otp: otpMatch ? otpMatch[1] : "******",
                label: `OTP Code Intercepted: ${otpMatch ? otpMatch[1] : "Verified"}`,
              });
            } else if (trimmed.includes("Onboarding Step 1: Selecting 'Developer'")) {
              sendEvent("step", {
                account: currentAccount,
                step: "onboarding_role",
                label: "Setting Developer profile...",
              });
            } else if (trimmed.includes("Onboarding Step 2: Selecting 'Sarvam API'")) {
              sendEvent("step", {
                account: currentAccount,
                step: "onboarding_goal",
                label: "Configuring Sarvam API workspace...",
              });
            } else if (trimmed.includes("API key successfully extracted via clipboard:")) {
              const keyMatch = trimmed.match(/sk_[^\s]+/);
              const preview = keyMatch ? keyMatch[0] : "sk_...";
              createdKeys.push(preview);
              sendEvent("step", {
                account: currentAccount,
                step: "key_extracted",
                keyPreview: preview,
                label: `API Key Extracted: ${preview}`,
              });
            } else if (trimmed.includes("Saved API key for") || (trimmed.includes("Result: SUCCESS") && !dryRun)) {
              sendEvent("key_saved", {
                account: currentAccount,
                success: true,
                totalCreated: createdKeys.length,
              });
            } else if (trimmed.includes("Result: FAILED")) {
              sendEvent("step", {
                account: currentAccount,
                step: "failed",
                label: trimmed,
              });
            }
          }
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8").trim();
          if (text) {
            sendEvent("log", { line: `[STDERR] ${text}`, isError: true, timestamp: new Date().toISOString() });
          }
        });

        proc.on("close", (code) => {
          sendEvent("complete", {
            exitCode: code,
            success: code === 0,
            totalCreated: createdKeys.length,
            message: code === 0 ? "Provisioning completed successfully!" : `Process exited with code ${code}`,
          });

          setTimeout(() => {
            if (!isClosed) {
              try {
                controller.close();
              } catch {
              }
              isClosed = true;
            }
          }, 1000);
        });

        proc.on("error", (err) => {
          sendEvent("error", { error: err.message || "Failed to start Python process." });
          if (!isClosed) {
            try {
              controller.close();
            } catch {
            }
            isClosed = true;
          }
        });
      },
      cancel() {
        isClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("[PROVISION API ERROR]", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
