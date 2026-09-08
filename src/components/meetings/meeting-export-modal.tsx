"use client";

import React, { useState } from "react";
import {
  FileText, Download, Copy, Check, Share2, Printer,
  Sparkles, FileCode, ExternalLink, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatSecondsToTime, formatDurationHuman } from "@/lib/time-utils";

interface Segment {
  id: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface ActionItem {
  id: string;
  taskDescription: string;
  assigneeName: string | null;
  status: string;
}

interface MeetingExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: {
    id: string;
    title: string;
    description: string | null;
    createdAt?: Date | string;
    durationSeconds: number;
    summaryMarkdown: string | null;
  };
  segments: Segment[];
  actionItems: ActionItem[];
  speakerMap: Record<string, string>;
  workspaceName?: string;
}

function formatSRTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function formatVTTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9; border:1px solid #e2e8f0; padding:1px 5px; border-radius:3px; font-size:11px; font-family:monospace;">$1</code>');
}

function renderCleanExecutiveSummaryHtml(rawSummary: string | null, title: string, segmentCount: number): string {
  if (
    !rawSummary ||
    rawSummary.includes("disabled or key is missing") ||
    rawSummary.includes("Failed to generate") ||
    rawSummary.trim().length === 0
  ) {
    return `
      <div class="report-section">
        <div class="section-header">
          <h2 class="section-title">Executive Summary</h2>
        </div>
        <p class="section-desc">
          Executive briefing for <strong>${escapeHtml(title)}</strong>. Discussions comprised ${segmentCount} transcript segments detailing operational alignment, key deliverables, and team decisions.
        </p>
      </div>
    `;
  }

  const lines = rawSummary.split("\n");
  let html = "";
  let inKeyPoints = false;
  let inDecisions = false;
  let currentParagraph = "";

  const flushParagraph = () => {
    if (currentParagraph.trim()) {
      html += `<p class="section-desc">${formatInline(currentParagraph.trim())}</p>`;
      currentParagraph = "";
    }
  };

  const closeOpenBlocks = () => {
    flushParagraph();
    if (inKeyPoints) {
      html += `</div></div>`;
      inKeyPoints = false;
    }
    if (inDecisions) {
      html += `</div></div>`;
      inDecisions = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    // Heading match (# Heading, ## Heading, ### Heading)
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      closeOpenBlocks();
      const headingText = headingMatch[1].trim();
      const lower = headingText.toLowerCase();

      if (lower.includes("decision")) {
        html += `
          <div class="decisions-card">
            <div class="decisions-card-title">
              <span class="decision-icon">✓</span> Decisions & Key Outcomes
            </div>
            <div class="decisions-list">
        `;
        inDecisions = true;
      } else if (lower.includes("key point") || lower.includes("discussion") || lower.includes("topics") || lower.includes("takeaway")) {
        html += `
          <div class="report-section">
            <div class="section-header">
              <h2 class="section-title">${escapeHtml(headingText)}</h2>
            </div>
            <div class="key-point-list">
        `;
        inKeyPoints = true;
      } else {
        html += `
          <div class="report-section">
            <div class="section-header">
              <h2 class="section-title">${escapeHtml(headingText)}</h2>
            </div>
        `;
      }
      continue;
    }

    // Bullet items: "- **Title:** Description" or "- Item"
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      const content = line.substring(2).trim();

      if (inDecisions) {
        html += `
          <div class="decision-item">
            <span class="decision-check">✓</span>
            <div class="decision-text">${formatInline(content)}</div>
          </div>
        `;
      } else if (inKeyPoints) {
        html += `
          <div class="key-point-item">
            <span class="point-bullet"></span>
            <div class="point-body">${formatInline(content)}</div>
          </div>
        `;
      } else {
        html += `
          <div class="key-point-item">
            <span class="point-bullet"></span>
            <div class="point-body">${formatInline(content)}</div>
          </div>
        `;
      }
      continue;
    }

    // Regular paragraph line
    if (currentParagraph) {
      currentParagraph += " " + line;
    } else {
      currentParagraph = line;
    }
  }

  closeOpenBlocks();
  return html;
}

export function MeetingExportModal({
  isOpen,
  onClose,
  meeting,
  segments,
  actionItems,
  speakerMap,
  workspaceName = "Workspace",
}: MeetingExportModalProps) {
  const [copiedNotion, setCopiedNotion] = useState(false);

  const handleDownloadSRT = () => {
    let srtContent = "";
    segments.forEach((seg, index) => {
      const speaker = speakerMap[seg.speakerId] || seg.speakerId;
      const start = formatSRTTime(seg.startTime);
      const end = formatSRTTime(seg.endTime);
      srtContent += `${index + 1}\n${start} --> ${end}\n[${speaker}]: ${seg.text}\n\n`;
    });

    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.title.replace(/[^a-z0-9]/gi, "_")}_subtitles.srt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadVTT = () => {
    let vttContent = "WEBVTT - MeetLog AI Transcript Subtitles\n\n";
    segments.forEach((seg, index) => {
      const speaker = speakerMap[seg.speakerId] || seg.speakerId;
      const start = formatVTTTime(seg.startTime);
      const end = formatVTTTime(seg.endTime);
      vttContent += `${index + 1}\n${start} --> ${end}\n<v ${speaker}>${seg.text}\n\n`;
    });

    const blob = new Blob([vttContent], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.title.replace(/[^a-z0-9]/gi, "_")}_subtitles.vtt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyNotionMarkdown = () => {
    const formattedDate = new Date(meeting.createdAt || new Date()).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    let markdown = `# ${meeting.title}\n\n`;
    markdown += `**Workspace:** ${workspaceName}  \n`;
    markdown += `**Date:** ${formattedDate}  \n`;
    markdown += `**Duration:** ${Math.round(meeting.durationSeconds / 60)} mins  \n\n`;

    if (meeting.summaryMarkdown && !meeting.summaryMarkdown.includes("disabled or key is missing")) {
      markdown += `## 📌 Executive Summary\n${meeting.summaryMarkdown}\n\n`;
    }

    if (actionItems.length > 0) {
      markdown += `## ✅ Action Items\n`;
      actionItems.forEach((item) => {
        const checkbox = item.status === "COMPLETED" ? "[x]" : "[ ]";
        const assignee = item.assigneeName ? ` (@${item.assigneeName})` : "";
        markdown += `- ${checkbox} ${item.taskDescription}${assignee}\n`;
      });
      markdown += `\n`;
    }

    markdown += `## 🎙️ Meeting Transcript Excerpts\n`;
    segments.forEach((seg) => {
      const speaker = speakerMap[seg.speakerId] || seg.speakerId;
      const timeStr = formatSecondsToTime(seg.startTime);
      markdown += `**[${timeStr}] ${speaker}:** ${seg.text}\n\n`;
    });

    navigator.clipboard.writeText(markdown);
    setCopiedNotion(true);
    setTimeout(() => setCopiedNotion(false), 2000);
  };

  const handlePrintPDF = () => {
    const formattedDate = new Date(meeting.createdAt || new Date()).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const printWin = window.open("", "_blank");
    if (!printWin) return;

    let actionsHtml = "";
    if (actionItems.length > 0) {
      actionsHtml = `
        <div class="report-section">
          <div class="section-header">
            <h2 class="section-title">Action Items & Deliverables</h2>
            <span class="section-counter">${actionItems.filter(a => a.status === "COMPLETED").length}/${actionItems.length} Completed</span>
          </div>
          <div class="action-items-list">
            ${actionItems
              .map((a) => {
                const isDone = a.status === "COMPLETED";
                return `
                  <div class="action-card ${isDone ? "completed" : ""}">
                    <div class="action-main">
                      <div class="action-box ${isDone ? "completed" : ""}">
                        ${isDone ? `<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
                      </div>
                      <span class="action-desc ${isDone ? "completed" : ""}">${escapeHtml(a.taskDescription)}</span>
                    </div>
                    <div class="action-badges">
                      ${a.assigneeName ? `<span class="assignee-badge">👤 ${escapeHtml(a.assigneeName)}</span>` : ""}
                      <span class="status-badge ${isDone ? "status-completed" : "status-pending"}">${isDone ? "Completed" : "Pending"}</span>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    let transcriptHtml = "";
    if (segments.length > 0) {
      transcriptHtml = `
        <div class="report-section">
          <div class="section-header">
            <h2 class="section-title">Transcript Key Excerpts</h2>
            <span class="section-counter">${Math.min(segments.length, 35)} of ${segments.length} segments</span>
          </div>
          <div class="transcript-list">
            ${segments
              .slice(0, 35)
              .map((seg) => {
                const speaker = speakerMap[seg.speakerId] || seg.speakerId;
                const timeStr = formatSecondsToTime(seg.startTime);
                return `
                  <div class="transcript-row">
                    <div class="transcript-meta">
                      <span class="timestamp-tag">${timeStr}</span>
                      <span class="speaker-label">${escapeHtml(speaker)}</span>
                    </div>
                    <div class="transcript-text">${escapeHtml(seg.text)}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    const summaryHtml = renderCleanExecutiveSummaryHtml(meeting.summaryMarkdown, meeting.title, segments.length);

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title> </title>
          <style>
            @page {
              size: A4 portrait;
              margin-top: 0mm;
              margin-bottom: 14mm;
              margin-left: 16mm;
              margin-right: 16mm;
              @top-left { content: none !important; }
              @top-center { content: none !important; }
              @top-right { content: none !important; }
              @bottom-left { content: none !important; }
              @bottom-right { content: none !important; }
              @bottom-center {
                content: "Page " counter(page) " of " counter(pages);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 8.5pt;
                color: #94a3b8;
              }
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              margin: 0;
              padding: 14mm 0 10mm 0;
              line-height: 1.6;
              font-size: 13px;
              -webkit-font-smoothing: antialiased;
            }

            /* Branding Bar */
            .report-brand-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }

            .brand-group {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .brand-logo-icon {
              width: 22px;
              height: 22px;
              border-radius: 6px;
              background: linear-gradient(135deg, #2563eb, #4f46e5);
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: -0.5px;
            }

            .brand-name {
              font-size: 13px;
              font-weight: 800;
              letter-spacing: -0.2px;
              color: #0f172a;
            }

            .brand-divider {
              color: #cbd5e1;
              font-weight: 300;
            }

            .brand-tag {
              font-size: 10.5px;
              font-weight: 600;
              color: #64748b;
              letter-spacing: 0.3px;
              text-transform: uppercase;
            }

            .confidential-pill {
              font-size: 9.5px;
              font-weight: 700;
              letter-spacing: 0.5px;
              text-transform: uppercase;
              color: #475569;
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              padding: 3px 8px;
              border-radius: 9999px;
            }

            /* Title & Context Grid */
            .report-title-block {
              margin-bottom: 22px;
            }

            .report-title {
              font-size: 24px;
              font-weight: 800;
              color: #0f172a;
              letter-spacing: -0.5px;
              line-height: 1.25;
              margin: 0 0 12px 0;
            }

            .report-meta-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 8px 16px;
              font-size: 11.5px;
              color: #64748b;
              background: #f8fafc;
              border: 1px solid #f1f5f9;
              border-radius: 8px;
              padding: 8px 12px;
            }

            .meta-item {
              display: flex;
              align-items: center;
              gap: 5px;
            }

            .meta-item strong {
              color: #334155;
              font-weight: 600;
            }

            /* Section Styling */
            .report-section {
              margin-bottom: 22px;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .section-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1.5px solid #0f172a;
              padding-bottom: 6px;
              margin-bottom: 12px;
            }

            .section-title {
              font-size: 13.5px;
              font-weight: 800;
              letter-spacing: 0.4px;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0;
            }

            .section-counter {
              font-size: 11px;
              font-weight: 600;
              color: #64748b;
            }

            .section-desc {
              font-size: 13px;
              color: #334155;
              line-height: 1.65;
              margin: 0 0 10px 0;
            }

            /* Key Points */
            .key-point-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin: 10px 0;
            }

            .key-point-item {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              font-size: 12.5px;
              line-height: 1.55;
              color: #334155;
              background: #ffffff;
              border: 1px solid #f1f5f9;
              border-left: 3px solid #3b82f6;
              border-radius: 0 6px 6px 0;
              padding: 8px 12px;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .point-bullet {
              width: 5px;
              height: 5px;
              border-radius: 50%;
              background: #3b82f6;
              margin-top: 7px;
              shrink: 0;
            }

            .point-body strong {
              color: #0f172a;
              font-weight: 700;
            }

            /* Decisions Block */
            .decisions-card {
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              border-left: 4px solid #10b981;
              border-radius: 8px;
              padding: 12px 14px;
              margin: 14px 0;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .decisions-card-title {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #15803d;
              margin: 0 0 8px 0;
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .decision-icon {
              font-weight: bold;
              font-size: 14px;
            }

            .decisions-list {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }

            .decision-item {
              display: flex;
              align-items: flex-start;
              gap: 8px;
              font-size: 12.5px;
              color: #166534;
              line-height: 1.5;
            }

            .decision-check {
              color: #16a34a;
              font-weight: bold;
              font-size: 13px;
              line-height: 1;
              margin-top: 1px;
            }

            .decision-text strong {
              color: #14532d;
              font-weight: 700;
            }

            /* Action Items */
            .action-items-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }

            .action-card {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 9px 12px;
              background: #ffffff;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .action-card.completed {
              background: #f8fafc;
              border-color: #e2e8f0;
            }

            .action-main {
              display: flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
              flex: 1;
            }

            .action-box {
              width: 16px;
              height: 16px;
              border-radius: 4px;
              border: 1.5px solid #cbd5e1;
              display: flex;
              align-items: center;
              justify-content: center;
              shrink: 0;
              background: #ffffff;
            }

            .action-box.completed {
              border-color: #10b981;
              background: #10b981;
            }

            .action-desc {
              font-size: 12.5px;
              font-weight: 600;
              color: #0f172a;
              line-height: 1.4;
            }

            .action-desc.completed {
              text-decoration: line-through;
              color: #94a3b8;
            }

            .action-badges {
              display: flex;
              align-items: center;
              gap: 6px;
              shrink: 0;
            }

            .assignee-badge {
              font-size: 10.5px;
              font-weight: 600;
              color: #475569;
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              padding: 2px 8px;
              border-radius: 9999px;
              white-space: nowrap;
            }

            .status-badge {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              padding: 2px 7px;
              border-radius: 9999px;
            }

            .status-completed {
              background: #dcfce7;
              color: #15803d;
            }

            .status-pending {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              color: #64748b;
            }

            /* Transcript Table/List */
            .transcript-list {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }

            .transcript-row {
              display: flex;
              align-items: baseline;
              gap: 12px;
              padding: 4px 0;
              border-bottom: 1px solid #f8fafc;
              font-size: 11.5px;
              line-height: 1.5;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .transcript-meta {
              display: flex;
              align-items: center;
              gap: 6px;
              min-width: 140px;
              shrink: 0;
            }

            .timestamp-tag {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 10px;
              color: #64748b;
              background: #f1f5f9;
              padding: 1px 5px;
              border-radius: 4px;
            }

            .speaker-label {
              font-weight: 700;
              color: #0f172a;
              font-size: 11px;
            }

            .transcript-text {
              color: #334155;
              flex: 1;
            }
          </style>
        </head>
        <body>
          <!-- Brand & Classification Header -->
          <div class="report-brand-bar">
            <div class="brand-group">
              <div class="brand-logo-icon">M</div>
              <span class="brand-name">MeetLog</span>
              <span class="brand-divider">/</span>
              <span class="brand-tag">Executive Intelligence Brief</span>
            </div>
            <div class="confidential-pill">Confidential · Team Internal</div>
          </div>

          <!-- Title & Context Grid -->
          <div class="report-title-block">
            <h1 class="report-title">${escapeHtml(meeting.title)}</h1>
            <div class="report-meta-grid">
              <div class="meta-item">📅 <strong>Date:</strong> <span>${formattedDate}</span></div>
              <div class="meta-item">⏱️ <strong>Duration:</strong> <span>${formatDurationHuman(meeting.durationSeconds)}</span></div>
              <div class="meta-item">🏢 <strong>Workspace:</strong> <span>${escapeHtml(workspaceName)}</span></div>
              <div class="meta-item">👥 <strong>Action Items:</strong> <span>${actionItems.length} total</span></div>
            </div>
          </div>

          ${summaryHtml}
          ${actionsHtml}
          ${transcriptHtml}

          <script>
            document.title = " ";
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 120);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border p-0 overflow-hidden shadow-2xl rounded-2xl">
        
        {}
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
              <Download className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                <span>Multi-Format Export Hub</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Export meeting intelligence to Notion, PDF reports, or subtitle files.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">

          {}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/30 transition-all flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center text-xl shrink-0">
                📝
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">Notion & Markdown Document</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Copy formatted markdown ready to paste directly into Notion or docs.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyNotionMarkdown}
              className="h-9 text-xs font-bold gap-1.5 cursor-pointer shrink-0 rounded-xl"
            >
              {copiedNotion ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              <span>{copiedNotion ? "Copied!" : "Copy Notion Format"}</span>
            </Button>
          </div>

          {}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/30 transition-all flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl shrink-0">
                📄
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">Printable PDF Report</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Generate executive A4 PDF report with summary and action checklist.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handlePrintPDF}
              className="h-9 text-xs font-bold gap-1.5 cursor-pointer shrink-0 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Printer className="size-3.5" />
              <span>Print PDF</span>
            </Button>
          </div>

          {}
          <div className="p-4 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/30 transition-all flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl shrink-0">
                🎬
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">Subtitle SubRip & WebVTT Files</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Download timestamped .srt & .vtt files for video editors and media players.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadSRT}
                className="h-9 text-xs font-bold gap-1 cursor-pointer rounded-xl"
              >
                <FileCode className="size-3.5 text-primary" />
                <span>.SRT</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadVTT}
                className="h-9 text-xs font-bold gap-1 cursor-pointer rounded-xl"
              >
                <FileCode className="size-3.5 text-purple-500" />
                <span>.VTT</span>
              </Button>
            </div>
          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
