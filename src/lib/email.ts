import nodemailer from "nodemailer";
import { siteConfig } from "@/config/site";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

const FROM =
  process.env.EMAIL_FROM ?? `${siteConfig.name} <noreply@meetlog.app>`;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const fs = require("fs");
  const path = require("path");
  const logPath = path.join(process.cwd(), "email-debug.log");
  const timestamp = new Date().toISOString();
  
  const logMessage = (msg: string) => {
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`, "utf8");
  };

  logMessage(`Attempting to send email to: ${to} | Subject: ${subject}`);

  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    logMessage(`SUCCESS: Email sent successfully! MessageId: ${info.messageId}`);
  } catch (error: any) {
    logMessage(`ERROR: Failed to send email via SMTP: ${error.message || error}`);
    console.error("[SMTP Error]", error);
    throw error;
  }
}

interface SendOTPEmailOptions {
  to: string;
  otp: string;
  type: "email-verification" | "sign-in" | "forget-password" | "change-email";
}

export async function sendOTPEmail({ to, otp, type }: SendOTPEmailOptions) {
  const fs = require("fs");
  const path = require("path");
  const logPath = path.join(process.cwd(), "email-debug.log");
  const timestamp = new Date().toISOString();
  fs.appendFileSync(
    logPath,
    `[${timestamp}] [OTP GENERATED] Email: ${to} | Code: ${otp} | Type: ${type}\n`,
    "utf8"
  );

  await sendEmail({
    to,
    subject: getSubject(type),
    html: buildOTPEmailHTML({ otp, type }),
  });
}

interface SendInviteEmailOptions {
  to: string;
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
}

export async function sendInviteEmail({
  to,
  inviterName,
  workspaceName,
  inviteUrl,
}: SendInviteEmailOptions) {
  await sendEmail({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on ${siteConfig.name}`,
    html: buildInviteEmailHTML({ inviterName, workspaceName, inviteUrl }),
  });
}

function getSubject(type: SendOTPEmailOptions["type"]): string {
  switch (type) {
    case "email-verification": return `Verify your ${siteConfig.name} account`;
    case "sign-in":            return `Your ${siteConfig.name} sign-in code`;
    case "forget-password":    return `Reset your ${siteConfig.name} password`;
    case "change-email":       return `Confirm your new ${siteConfig.name} email`;
  }
}

function getHeading(type: SendOTPEmailOptions["type"]): string {
  switch (type) {
    case "email-verification": return "Verify your email address";
    case "sign-in":            return "Your sign-in code";
    case "forget-password":    return "Reset your password";
    case "change-email":       return "Confirm your new email";
  }
}

function getBody(type: SendOTPEmailOptions["type"]): string {
  switch (type) {
    case "email-verification":
      return `Enter the code below to verify your email address and activate your ${siteConfig.name} account.`;
    case "sign-in":
      return `Enter the code below to sign in to your ${siteConfig.name} account.`;
    case "forget-password":
      return `Enter the code below to reset your ${siteConfig.name} password.`;
    case "change-email":
      return `Enter the code below to confirm your new email address on your ${siteConfig.name} account.`;
  }
}

function buildOTPEmailHTML({
  otp,
  type,
}: {
  otp: string;
  type: SendOTPEmailOptions["type"];
}): string {
  const heading = getHeading(type);
  const body    = getBody(type);

  return  `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #f4f4f5;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#18181b;">${siteConfig.name}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#18181b;">${heading}</h1>
            <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#71717a;">${body}</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#f4f4f5;border-radius:12px;padding:16px 24px;">
                  <span style="font-size:28px;font-weight:800;letter-spacing:6px;color:#18181b;font-family:'Courier New',monospace;">${otp}</span>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">This code expires in <strong style="color:#71717a;">10 minutes</strong>.</p>
            <p style="margin:0;font-size:13px;color:#a1a1aa;">If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">© ${new Date().getFullYear()} ${siteConfig.name}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

function buildInviteEmailHTML({
  inviterName,
  workspaceName,
  inviteUrl,
}: {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
}): string {
  return  `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to ${workspaceName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #f4f4f5;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#18181b;">${siteConfig.name}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#18181b;">You've been invited!</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#71717a;">
              <strong style="color:#18181b;">${inviterName}</strong> has invited you to join
              <strong style="color:#18181b;">${workspaceName}</strong> on ${siteConfig.name}.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="border-radius:10px;background:#18181b;">
                  <a href="${inviteUrl}"
                     style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                    Accept invitation →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">This invitation expires in <strong style="color:#71717a;">7 days</strong>.</p>
            <p style="margin:0;font-size:13px;color:#a1a1aa;">If you weren't expecting this, you can safely ignore it.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">© ${new Date().getFullYear()} ${siteConfig.name}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
