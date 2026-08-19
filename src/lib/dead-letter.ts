import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";

export async function notifyMeetingFailed(
  meetingId: string,
  errorMessage: string,
) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      workspace: {
        include: {
          members: {
            where: { role: "OWNER" },
            include: { user: true },
          },
        },
      },
    },
  });

  if (!meeting) {
    console.error(`[DEAD LETTER] Meeting ${meetingId} not found. Cannot send notification.`);
    return;
  }

  const owner = meeting.workspace.members[0]?.user;
  if (!owner?.email) {
    console.error(`[DEAD LETTER] No owner email found for meeting ${meetingId}.`);
    return;
  }

  const truncatedError =
    errorMessage.length > 200 ? errorMessage.slice(0, 200) + "..." : errorMessage;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Transcription Failed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #f4f4f5;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#18181b;">${siteConfig.name}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <div style="width:48px;height:48px;border-radius:12px;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
              <span style="font-size:24px;">⚠️</span>
            </div>
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#18181b;">Transcription Failed</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#71717a;">
              The transcription for your meeting <strong style="color:#18181b;">"${meeting.title}"</strong>
              in workspace <strong style="color:#18181b;">${meeting.workspace.name}</strong>
              failed after multiple retry attempts.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fafafa;border-radius:12px;border:1px solid #e4e4e7;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.5px;">Error Details</p>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#52525b;font-family:'Courier New',monospace;word-break:break-all;">${truncatedError}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#71717a;">
              You can try re-uploading the audio file or contact support if the issue persists.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
              <tr>
                <td style="border-radius:10px;background:#18181b;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://meetlog.ai"}/workspace/${meeting.workspace.slug}/meetings/${meeting.id}"
                     style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                    View Meeting →
                  </a>
                </td>
              </tr>
            </table>
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

  await sendEmail({
    to: owner.email,
    subject: `Transcription failed: "${meeting.title}" — ${siteConfig.name}`,
    html,
  });

  console.log(`[DEAD LETTER] Sent failure notification to ${owner.email} for meeting ${meetingId}`);
}
