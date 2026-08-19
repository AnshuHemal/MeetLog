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

function renderCleanExecutiveSummaryHtml(rawSummary: string | null, title: string, segmentCount: number): string {
  if (
    !rawSummary ||
    rawSummary.includes("disabled or key is missing") ||
    rawSummary.includes("Failed to generate") ||
    rawSummary.trim().length === 0
  ) {
    return `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px; margin-bottom:20px;">
        <h3 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px;">Executive Summary</h3>
        <p style="margin:0; font-size:13px; color:#334155; line-height:1.6;">
          Executive overview for <strong>${title}</strong>. Discussions comprised ${segmentCount} key transcript segments detailing team deliverables, operational alignment, and action items.
        </p>
      </div>
    `;
  }

  let html = rawSummary
    .replace(/^### (.*$)/gim, '<h4 style="margin:14px 0 6px 0; font-size:14px; font-weight:700; color:#1e293b;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin:16px 0 8px 0; font-size:15px; font-weight:700; color:#0f172a;">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="margin:18px 0 10px 0; font-size:16px; font-weight:800; color:#0f172a;">$1</h2>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0; font-size:13px; color:#334155; line-height:1.6;">')
    .replace(/\n/g, '<br/>');

  return `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px; margin-bottom:20px;">
      <h3 style="margin:0 0 10px 0; font-size:14px; font-weight:700; color:#0f172a; border-bottom:1px solid #cbd5e1; padding-bottom:6px;">Executive Summary</h3>
      <div style="font-size:13px; color:#334155; line-height:1.6;">${html}</div>
    </div>
  `;
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
        <div style="margin-top:24px;">
          <h2 style="font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:6px; color:#0f172a; margin-bottom:12px;">Action Items Checklist</h2>
          <ul style="list-style:none; padding:0; margin:0;">
            ${actionItems
              .map(
                (a) => `
              <li style="margin-bottom:8px; font-size:13px; color:#334155; display:flex; items-center; gap:8px;">
                <span style="color:${a.status === "COMPLETED" ? "#10b981" : "#3b82f6"}; font-weight:bold;">${a.status === "COMPLETED" ? "☑" : "☐"}</span>
                <strong style="color:#0f172a;">${a.taskDescription}</strong>
                ${a.assigneeName ? `<span style="color:#64748b; font-size:11px;">(Assignee: ${a.assigneeName})</span>` : ""}
              </li>`
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    let transcriptHtml = `
      <div style="margin-top:24px;">
        <h2 style="font-size:15px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:6px; color:#0f172a; margin-bottom:12px;">Transcript Summary</h2>
        <div>
          ${segments
            .slice(0, 40)
            .map((seg) => {
              const speaker = speakerMap[seg.speakerId] || seg.speakerId;
              const timeStr = formatSecondsToTime(seg.startTime);
              return `<p style="font-size:12px; margin-bottom:6px; line-height:1.5; color:#334155;"><strong style="color:#2563eb;">[${timeStr}] ${speaker}:</strong> ${seg.text}</p>`;
            })
            .join("")}
        </div>
      </div>
    `;

    const summaryHtml = renderCleanExecutiveSummaryHtml(meeting.summaryMarkdown, meeting.title, segments.length);

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${meeting.title} - Executive Report</title>
          <style>
            @page {
              size: auto;
              margin: 15mm;
            }
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 22px; font-weight: 800; margin: 0; color: #0f172a; text-align: right; line-height: 1.25; }
            .meta { font-size: 12px; color: #64748b; margin-top: 6px; }
            .brand { font-size: 14px; font-weight: 800; color: #2563eb; letter-spacing: 0.5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="text-align: left;">
              <div class="brand">MeetLog Intelligence</div>
              <div class="meta">${workspaceName} · Date: ${formattedDate} · Duration: ${formatDurationHuman(meeting.durationSeconds)}</div>
            </div>
            <div style="text-align: right; max-width: 60%;">
              <h1 class="title">${meeting.title}</h1>
            </div>
          </div>

          ${summaryHtml}
          ${actionsHtml}
          ${transcriptHtml}

          <script>
            document.title = "${meeting.title.replace(/"/g, "")} - Executive Report";
            window.onload = function() { window.print(); }
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
