"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface Chapter {
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
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
  chapters?: Chapter[];
  workspaceName?: string;
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
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f1f5f9; border:1px solid #e2e8f0; padding:1px 5px; border-radius:3px; font-size:11px; font-family:monospace;">$1</code>'
    );
}

function renderCleanSummaryHtml(
  rawSummary: string | null,
  title: string,
  segmentCount: number
): string {
  if (
    !rawSummary ||
    rawSummary.includes("disabled or key is missing") ||
    rawSummary.includes("Failed to generate") ||
    rawSummary.trim().length === 0
  ) {
    return `
      <div style="margin-bottom: 16px;">
        <h3 style="color: #0f172a; font-size: 13pt; margin-bottom: 6px;">Executive Briefing</h3>
        <p style="color: #475569; font-size: 11pt; line-height: 1.6;">
          Discussion recorded for <strong>${escapeHtml(title)}</strong> covering ${segmentCount} transcript segments detailing key project decisions, team alignment, and operational next steps.
        </p>
      </div>
    `;
  }

  const lines = rawSummary.split("\n");
  let html = "";
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
      html += `<h4 class="pdf-slice-item" style="color:#1e293b; font-size:12pt; margin:16px 0 6px 0; font-weight:600; font-family:'Poppins',sans-serif;">${escapeHtml(trimmed.slice(4))}</h4>\n`;
    } else if (trimmed.startsWith("## ")) {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
      html += `<h3 class="pdf-slice-item" style="color:#0f172a; font-size:13pt; margin:20px 0 8px 0; font-weight:600; font-family:'Poppins',sans-serif; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${escapeHtml(trimmed.slice(3))}</h3>\n`;
    } else if (trimmed.startsWith("# ")) {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
      html += `<h2 class="pdf-slice-item" style="color:#0f172a; font-size:14pt; margin:22px 0 10px 0; font-weight:700; font-family:'Poppins',sans-serif;">${escapeHtml(trimmed.slice(2))}</h2>\n`;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html += '<ul style="margin: 8px 0 12px 24px; padding:0; color:#334155; line-height:1.6; font-family:\'Poppins\',sans-serif;">\n';
        inList = true;
      }
      html += `<li class="pdf-slice-item" style="margin-bottom: 6px; font-family:'Poppins',sans-serif;">${formatInline(escapeHtml(trimmed.slice(2)))}</li>\n`;
    } else {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
      html += `<p class="pdf-slice-item" style="margin: 8px 0; color:#334155; line-height:1.6; font-size:10.5pt; font-family:'Poppins',sans-serif;">${formatInline(escapeHtml(trimmed))}</p>\n`;
    }
  }

  if (inList) {
    html += "</ul>\n";
  }

  return html;
}

export function MeetingExportModal({
  isOpen,
  onClose,
  meeting,
  segments,
  actionItems,
  speakerMap,
  chapters = [],
  workspaceName = "Workspace",
}: MeetingExportModalProps) {
  const [fileName, setFileName] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"doc" | "pdf" | "md">("doc");
  const [isGenerating, setIsGenerating] = useState(false);

  // Pre-load Poppins font for modern PDF rendering
  useEffect(() => {
    if (!document.getElementById("google-font-poppins")) {
      const link = document.createElement("link");
      link.id = "google-font-poppins";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Initialize prefilled clean filename when modal opens
  useEffect(() => {
    if (isOpen) {
      const cleanTitle = (meeting.title || "Meeting")
        .replace(/[\\/:*?"<>|]/g, "")
        .trim();
      setFileName(`${cleanTitle} - MoM & Transcript`);
    }
  }, [isOpen, meeting.title]);

  const uniqueSpeakers = Array.from(
    new Set(segments.map((s) => speakerMap[s.speakerId] || s.speakerId))
  );

  const formattedDate = new Date(meeting.createdAt || new Date()).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const durationStr = formatDurationHuman(meeting.durationSeconds);
  const isLong = meeting.durationSeconds >= 3600;

  // Build Word Document HTML
  const buildWordDocument = (): string => {
    // 1. Spoken Transcript
    const transcriptHtml = segments
      .map((seg) => {
        const speaker = escapeHtml(speakerMap[seg.speakerId] || seg.speakerId);
        const timeStr = formatSecondsToTime(seg.startTime, isLong);
        const text = escapeHtml(seg.text);

        return `
          <div style="margin-bottom: 12px; line-height: 1.6; font-size: 10pt; font-family: 'Poppins', sans-serif;">
            <span style="color: #64748b; font-family: 'Poppins', sans-serif; font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500; margin-right: 8px;">[${timeStr}]</span>
            <strong style="color: #0f172a; margin-right: 6px; font-weight: 600; font-family: 'Poppins', sans-serif;">${speaker}:</strong>
            <span style="color: #334155; font-family: 'Poppins', sans-serif; font-weight: 400;">${text}</span>
          </div>
        `;
      })
      .join("\n");

    // 2. Executive Summary (At the end)
    const summaryHtml = renderCleanSummaryHtml(
      meeting.summaryMarkdown,
      meeting.title,
      segments.length
    );

    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(meeting.title)} - Transcript & Summary</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap">
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: A4;
            margin: 1.0in 1.0in 1.0in 1.0in;
            mso-header-margin: 0.5in;
            mso-footer-margin: 0.5in;
          }
          body {
            font-family: 'Poppins', 'Segoe UI', Arial, sans-serif;
            color: #0f172a;
            line-height: 1.6;
            margin: 0;
            padding: 0;
          }
          h1, h2, h3, h4 {
            font-family: 'Poppins', 'Segoe UI', Arial, sans-serif;
          }
          .header-card {
            background-color: #f8fafc;
            border: 1px solid #cbd5e1;
            border-left: 6px solid #2563eb;
            padding: 16px 20px;
            margin-bottom: 24px;
            border-radius: 6px;
            font-family: 'Poppins', sans-serif;
          }
        </style>
      </head>
      <body>
        <!-- HEADER / METADATA SECTION -->
        <div class="header-card">
          <h1 style="margin: 0 0 6px 0; color: #0f172a; font-size: 18pt; font-weight: 700; line-height: 1.3; font-family: 'Poppins', sans-serif;">
            ${escapeHtml(meeting.title)}
          </h1>
          <p style="margin: 0 0 10px 0; color: #64748b; font-size: 10pt; font-family: 'Poppins', sans-serif;">
            Official Meeting Transcript & Summary
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; color: #334155; font-family: 'Poppins', sans-serif;">
            <tr>
              <td style="padding: 3px 0; width: 50%;"><strong>Date:</strong> ${formattedDate}</td>
              <td style="padding: 3px 0; width: 50%;"><strong>Duration:</strong> ${durationStr}</td>
            </tr>
          </table>
        </div>

        <!-- SECTION 1: FULL SPOKEN TRANSCRIPT WITH TIMESTAMPS -->
        <div style="margin-bottom: 30px;">
          <h2 style="color: #0f172a; font-size: 13pt; font-weight: 600; font-family: 'Poppins', sans-serif; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 14px;">
            1. Complete Spoken Transcript
          </h2>
          <div style="margin-top: 10px;">
            ${transcriptHtml}
          </div>
        </div>

        <!-- PAGE BREAK BEFORE SUMMARY -->
        <br clear="all" style="page-break-before: always; mso-special-character: line-break;" />

        <!-- SECTION 2: EXECUTIVE SUMMARY (AT THE VERY END) -->
        <div style="margin-top: 24px;">
          <h2 style="color: #0f172a; font-size: 13pt; font-weight: 600; font-family: 'Poppins', sans-serif; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 14px;">
            2. Meeting Summary
          </h2>
          <div style="font-size: 10.5pt; line-height: 1.6; color: #1e293b; font-family: 'Poppins', sans-serif;">
            ${summaryHtml}
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Build Markdown (.md)
  const buildMarkdown = (): string => {
    let md = `# ${meeting.title}\n\n`;
    md += `_Official Meeting Transcript & Summary_\n\n`;
    md += `> **Date:** ${formattedDate}  \n`;
    md += `> **Duration:** ${durationStr}  \n\n`;

    md += `---\n\n`;
    md += `## 1. Complete Spoken Transcript\n\n`;

    segments.forEach((seg) => {
      const speaker = speakerMap[seg.speakerId] || seg.speakerId;
      const timeStr = formatSecondsToTime(seg.startTime, isLong);
      md += `[${timeStr}] **${speaker}:** ${seg.text}\n\n`;
    });

    md += `---\n\n`;
    md += `## 2. Meeting Summary\n\n`;
    md += `${meeting.summaryMarkdown || "No executive summary available."}\n`;

    return md;
  };

  const buildPdfDocumentHtml = (): string => {
    const transcriptHtml = segments
      .map((seg) => {
        const speaker = escapeHtml(speakerMap[seg.speakerId] || seg.speakerId);
        const timeStr = formatSecondsToTime(seg.startTime, isLong);
        const text = escapeHtml(seg.text);

        return `
          <div class="pdf-slice-item" style="margin-bottom: 12px; line-height: 1.6; font-size: 10pt; font-family: 'Poppins', sans-serif;">
            <span style="color: #64748b; font-family: 'Poppins', sans-serif; font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500; margin-right: 8px;">[${timeStr}]</span>
            <strong style="color: #0f172a; margin-right: 6px; font-weight: 600; font-family: 'Poppins', sans-serif;">${speaker}:</strong>
            <span style="color: #334155; font-family: 'Poppins', sans-serif; font-weight: 400;">${text}</span>
          </div>
        `;
      })
      .join("\n");

    const summaryHtml = renderCleanSummaryHtml(
      meeting.summaryMarkdown,
      meeting.title,
      segments.length
    );

    return `
      <div style="font-family: 'Poppins', sans-serif; color: #0f172a; line-height: 1.6; background-color: #ffffff; padding: 4px 6px;">
        <!-- HEADER CARD -->
        <div class="pdf-slice-item" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #2563eb; padding: 16px 20px; margin-bottom: 20px; border-radius: 6px; font-family: 'Poppins', sans-serif;">
          <h1 style="margin: 0 0 6px 0; color: #0f172a; font-size: 18pt; font-weight: 700; line-height: 1.3; font-family: 'Poppins', sans-serif;">
            ${escapeHtml(meeting.title)}
          </h1>
          <p style="margin: 0 0 10px 0; color: #64748b; font-size: 10pt; font-family: 'Poppins', sans-serif; font-weight: 400;">
            Official Meeting Transcript & Summary
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; color: #334155; font-family: 'Poppins', sans-serif;">
            <tr>
              <td style="padding: 2px 0; width: 50%;"><strong>Date:</strong> ${formattedDate}</td>
              <td style="padding: 2px 0; width: 50%;"><strong>Duration:</strong> ${durationStr}</td>
            </tr>
          </table>
        </div>

        <!-- SECTION 1: FULL SPOKEN TRANSCRIPT -->
        <div class="pdf-slice-item" style="margin-bottom: 16px;">
          <h2 style="color: #0f172a; font-size: 13pt; font-weight: 600; font-family: 'Poppins', sans-serif; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 14px;">
            1. Complete Spoken Transcript
          </h2>
        </div>
        <div>
          ${transcriptHtml}
        </div>

        <!-- SECTION 2: EXECUTIVE SUMMARY (FORCED BREAK) -->
        <div class="pdf-slice-item" data-break="true" style="margin-top: 24px; padding-top: 10px;">
          <h2 style="color: #0f172a; font-size: 13pt; font-weight: 600; font-family: 'Poppins', sans-serif; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 14px;">
            2. Meeting Summary
          </h2>
        </div>
        <div>
          ${summaryHtml}
        </div>
      </div>
    `;
  };

  const isFileNameEmpty = !fileName.trim();

  const handleDownload = async () => {
    const trimmedName = fileName.trim();
    if (!trimmedName || isGenerating) {
      return;
    }
    const sanitizedName = trimmedName.replace(/[\\/:*?"<>|]/g, "_");

    if (selectedFormat === "pdf") {
      setIsGenerating(true);
      try {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        // Ensure Poppins font is loaded before rendering canvas
        try {
          await document.fonts.load("400 12pt Poppins");
          await document.fonts.load("500 12pt Poppins");
          await document.fonts.load("600 12pt Poppins");
          await document.fonts.load("700 16pt Poppins");
          await document.fonts.ready;
        } catch {}

        const printDocHtml = buildPdfDocumentHtml();

        // 1. Create temporary container
        const container = document.createElement("div");
        container.id = "pdf-direct-export";
        container.style.position = "fixed";
        container.style.left = "0px";
        container.style.top = "0px";
        container.style.width = "780px";
        container.style.zIndex = "-1000";
        container.style.backgroundColor = "#ffffff";
        container.style.color = "#0f172a";
        container.style.pointerEvents = "none";
        container.innerHTML = printDocHtml;
        document.body.appendChild(container);

        // Measure true item boundaries using getBoundingClientRect relative to container
        const containerRect = container.getBoundingClientRect();
        const itemNodes = Array.from(container.querySelectorAll(".pdf-slice-item")) as HTMLElement[];
        const items = itemNodes.map((el) => {
          const rect = el.getBoundingClientRect();
          const top = Math.round((rect.top - containerRect.top) * 2);
          const bottom = Math.round((rect.bottom - containerRect.top) * 2);
          const isForcedBreak = el.getAttribute("data-break") === "true";
          return { top, bottom, isForcedBreak };
        });

        // 2. Render to high-resolution canvas
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc: Document) => {
            // Strip external stylesheets with modern "lab()" colors while preserving Poppins font
            const styles = clonedDoc.querySelectorAll("style, link[rel='stylesheet']");
            styles.forEach((el) => {
              if (el.id === "google-font-poppins") return;
              const href = el.getAttribute("href") || "";
              if (href.includes("fonts.googleapis.com") || href.includes("fonts.gstatic.com")) return;
              el.remove();
            });

            clonedDoc.documentElement.style.backgroundColor = "#ffffff";
            clonedDoc.documentElement.style.color = "#0f172a";
            clonedDoc.body.style.backgroundColor = "#ffffff";
            clonedDoc.body.style.color = "#0f172a";

            const target = clonedDoc.getElementById("pdf-direct-export");
            if (target) {
              target.style.position = "static";
              target.style.zIndex = "1";
              target.style.visibility = "visible";
              target.style.opacity = "1";
            }
          },
        });

        document.body.removeChild(container);

        // 3. Slice canvas into A4 pages cleanly avoiding cutting text in half
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 16; // 16mm margins on all 4 sides
        const contentWidth = pageWidth - margin * 2; // 178mm
        const maxContentHeight = pageHeight - margin * 2; // 265mm

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const pxPerMm = canvasWidth / contentWidth;
        const maxPageHeightPx = maxContentHeight * pxPerMm;

        let renderedHeightPx = 0;
        let pageIndex = 0;

        while (renderedHeightPx < canvasHeight) {
          if (pageIndex > 0) {
            pdf.addPage();
          }

          let targetEndPx = renderedHeightPx + maxPageHeightPx;

          if (targetEndPx < canvasHeight) {
            // Check if any forced break exists on this page
            const forcedItem = items.find(
              (it) => it.isForcedBreak && it.top > renderedHeightPx + 40 && it.top <= targetEndPx
            );
            if (forcedItem) {
              targetEndPx = forcedItem.top;
            } else {
              // Find all items that cross targetEndPx on this page
              const straddled = items.filter(
                (it) => it.top >= renderedHeightPx && it.top < targetEndPx && it.bottom > targetEndPx
              );
              if (straddled.length > 0) {
                // Pick the earliest straddled item
                straddled.sort((a, b) => a.top - b.top);
                // Snap cleanly above it with a 6px buffer
                targetEndPx = Math.max(renderedHeightPx + 60, straddled[0].top - 6);
              }
            }
          } else {
            targetEndPx = canvasHeight;
          }

          const sliceHeightPx = targetEndPx - renderedHeightPx;

          if (sliceHeightPx > 0) {
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = canvasWidth;
            pageCanvas.height = sliceHeightPx;
            const pageCtx = pageCanvas.getContext("2d");

            if (pageCtx) {
              pageCtx.fillStyle = "#ffffff";
              pageCtx.fillRect(0, 0, canvasWidth, sliceHeightPx);
              pageCtx.drawImage(
                canvas,
                0,
                renderedHeightPx,
                canvasWidth,
                sliceHeightPx,
                0,
                0,
                canvasWidth,
                sliceHeightPx
              );

              const sliceImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
              const sliceHeightMm = sliceHeightPx / pxPerMm;

              pdf.addImage(sliceImgData, "JPEG", margin, margin, contentWidth, sliceHeightMm);
            }
          }

          renderedHeightPx = targetEndPx;
          pageIndex++;
        }

        // 4. Directly trigger download of the PDF file!
        pdf.save(`${sanitizedName}.pdf`);
        onClose();
      } catch (err) {
        console.error("PDF export error:", err);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    let content = "";
    let mimeType = "";
    let extension = selectedFormat;

    if (selectedFormat === "doc") {
      content = buildWordDocument();
      mimeType = "application/msword;charset=utf-8";
    } else {
      content = buildMarkdown();
      mimeType = "text/markdown;charset=utf-8";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizedName}.${extension}`;
    link.style.display = "none";
    // Stop event propagation so Next.js client router doesn't intercept the click as a page navigation
    link.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    document.body.appendChild(link);
    link.click();

    // Defer removal and object URL revocation so browser starts download stream without aborting or reloading
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 1500);

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-[560px] p-0 overflow-hidden border-border bg-card"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
              <FileText className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Export Meeting Document
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Download a structured document with full timestamped transcripts and final summary for AI MoM generation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* File Name Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="fileName"
                className={`text-xs font-semibold ${
                  isFileNameEmpty ? "text-destructive" : "text-foreground"
                }`}
              >
                File Name
              </Label>
              <span className="text-[11px] font-mono text-muted-foreground">
                Extension: .{selectedFormat}
              </span>
            </div>
            <div className="relative flex items-center">
              <Input
                id="fileName"
                autoFocus={false}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter file name..."
                className={`h-10 text-sm font-medium pr-16 bg-background shadow-xs transition-colors ${
                  isFileNameEmpty
                    ? "border-destructive focus-visible:ring-destructive/50 ring-1 ring-destructive/30"
                    : "border-border focus-visible:ring-1 focus-visible:ring-primary"
                }`}
              />
              <span className="absolute right-3 text-xs font-mono font-bold text-muted-foreground uppercase pointer-events-none bg-muted px-1.5 py-0.5 rounded border border-border/50">
                .{selectedFormat}
              </span>
            </div>
            {isFileNameEmpty && (
              <p className="text-[11px] font-medium text-destructive mt-1">
                Please enter a file name before exporting.
              </p>
            )}
          </div>

          {/* Format Selector Tabs */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">
              Document Format
            </Label>
            <Tabs
              value={selectedFormat}
              onValueChange={(val) => setSelectedFormat(val as any)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 h-10 w-full bg-muted/50 p-1 rounded-lg border border-border/50">
                <TabsTrigger
                  value="doc"
                  className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:shadow-xs"
                >
                  <FileText className="size-3.5 text-blue-500" />
                  <span>Word (.doc)</span>
                </TabsTrigger>
                <TabsTrigger
                  value="pdf"
                  className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:shadow-xs"
                >
                  <FileText className="size-3.5 text-rose-500" />
                  <span>PDF (.pdf)</span>
                </TabsTrigger>
                <TabsTrigger
                  value="md"
                  className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:shadow-xs"
                >
                  <Sparkles className="size-3.5 text-purple-500" />
                  <span>Markdown (.md)</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/70 bg-muted/20 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs cursor-pointer border-border"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={isFileNameEmpty || isGenerating}
            className="text-xs font-semibold gap-1.5 cursor-pointer shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>Download .{selectedFormat.toUpperCase()}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
