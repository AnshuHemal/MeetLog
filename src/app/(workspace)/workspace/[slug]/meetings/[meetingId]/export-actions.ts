"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import axios from "axios";

async function getMeetingWithIntegration(
  meetingId: string,
  workspaceSlug: string,
  type: "SLACK" | "JIRA" | "LINEAR" | "NOTION"
) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: { include: { integrations: { where: { type } } } } },
  });

  if (!membership) throw new Error("Unauthorized");

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, workspaceId: membership.workspaceId },
    include: { actionItems: true },
  });

  if (!meeting) throw new Error("Meeting not found");

  const integration = membership.workspace.integrations[0];
  return { meeting, integration, workspaceId: membership.workspaceId };
}

export async function exportToSlackAction(meetingId: string, workspaceSlug: string) {
  const { meeting, integration } = await getMeetingWithIntegration(meetingId, workspaceSlug, "SLACK");

  if (!integration?.webhookUrl) {
    return { success: false, error: "Slack is not configured. Add a webhook URL in Settings > Integrations." };
  }

  const pendingItems = meeting.actionItems.filter((i) => i.status === "PENDING");

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📋 ${meeting.title}`, emoji: true },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Duration:*\n${Math.round(meeting.durationSeconds / 60)} min` },
        { type: "mrkdwn", text: `*Action Items:*\n${pendingItems.length} pending` },
      ],
    },
  ];

  if (meeting.summaryMarkdown) {
    const summary = meeting.summaryMarkdown
      .replace(/#{1,6}\s?/g, "*")
      .replace(/\*\*/g, "*")
      .slice(0, 2800);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*📝 Summary*\n${summary}` },
    });
  }

  if (pendingItems.length > 0) {
    const itemList = pendingItems
      .slice(0, 10)
      .map((item, i) =>
        `${i + 1}. ${item.taskDescription}${item.assigneeName ? ` _(${item.assigneeName})_` : ""}`
      )
      .join("\n");

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*✅ Action Items*\n${itemList}` },
    });
  }

  try {
    await axios.post(integration.webhookUrl, { blocks, text: `Meeting summary: ${meeting.title}` });
    return { success: true };
  } catch (e: any) {
    console.error("Slack export failed:", e.message);
    return { success: false, error: "Failed to post to Slack. Check your webhook URL." };
  }
}

export async function exportToJiraAction(meetingId: string, workspaceSlug: string) {
  const { meeting, integration } = await getMeetingWithIntegration(meetingId, workspaceSlug, "JIRA");

  if (!integration?.apiKey || !integration.projectKey) {
    return { success: false, error: "Jira is not configured. Add your API key and project key in Settings > Integrations." };
  }

  const pendingItems = meeting.actionItems.filter((i) => i.status === "PENDING");
  if (pendingItems.length === 0) {
    return { success: false, error: "No pending action items to export." };
  }

  const jiraBaseUrl = integration.teamId;
  if (!jiraBaseUrl) {
    return { success: false, error: "Jira base URL not configured." };
  }

  const created: string[] = [];
  const errors: string[] = [];

  for (const item of pendingItems) {
    try {
      const response = await axios.post(
        `${jiraBaseUrl}/rest/api/3/issue`,
        {
          fields: {
            project: { key: integration.projectKey },
            summary: item.taskDescription,
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: `From meeting: ${meeting.title}` },
                    ...(item.assigneeName
                      ? [{ type: "text", text: `\nAssigned to: ${item.assigneeName}` }]
                      : []),
                  ],
                },
              ],
            },
            issuetype: { name: "Task" },
          },
        },
        {
          auth: { username: "api", password: integration.apiKey },
          headers: { "Content-Type": "application/json" },
        }
      );
      created.push(response.data.key);
    } catch (e: any) {
      errors.push(item.taskDescription.slice(0, 30));
    }
  }

  if (created.length === 0) {
    return { success: false, error: `Failed to create issues: ${errors.join(", ")}` };
  }

  return { success: true, created, errors };
}

export async function exportToLinearAction(meetingId: string, workspaceSlug: string) {
  const { meeting, integration } = await getMeetingWithIntegration(meetingId, workspaceSlug, "LINEAR");

  if (!integration?.apiKey || !integration.teamId) {
    return { success: false, error: "Linear is not configured. Add your API key and team ID in Settings > Integrations." };
  }

  const pendingItems = meeting.actionItems.filter((i) => i.status === "PENDING");
  if (pendingItems.length === 0) {
    return { success: false, error: "No pending action items to export." };
  }

  const LINEAR_API = "https://api.linear.app/graphql";
  const created: string[] = [];

  for (const item of pendingItems) {
    try {
      const query = `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id title url }
          }
        }
      `;
      const variables = {
        input: {
          teamId: integration.teamId,
          title: item.taskDescription,
          description: `**From meeting:** ${meeting.title}${item.assigneeName ? `\n**Assignee:** ${item.assigneeName}` : ""}`,
        },
      };

      const response = await axios.post(
        LINEAR_API,
        { query, variables },
        {
          headers: {
            Authorization: integration.apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      const issue = response.data?.data?.issueCreate?.issue;
      if (issue) created.push(issue.title);
    } catch (e: any) {
      console.error("Linear issue creation failed:", e.message);
    }
  }

  return { success: created.length > 0, created };
}
