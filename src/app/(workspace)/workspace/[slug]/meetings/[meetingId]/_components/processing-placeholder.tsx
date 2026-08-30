"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, AudioLines, Clock, CheckCircle2, Terminal } from "lucide-react";
import axios from "axios";
import {
  PipelineTerminal,
  TerminalLogEntry,
  formatTerminalTimestamp,
} from "@/components/shared/pipeline-terminal";

interface ProcessingPlaceholderProps {
  meetingId: string;
  workspaceSlug: string;
  title: string;
}

const PHASE_LABELS = [
  "Stream verification & chunk handshake",
  "AI speech recognition & acoustic model",
  "Speaker separation & diarization matrix",
  "Gemini multi-chunk executive synthesis",
  "Finalizing workspace index & action items",
];

export function ProcessingPlaceholder({
  meetingId,
  workspaceSlug,
  title,
}: ProcessingPlaceholderProps) {
  const router = useRouter();
  const [dots, setDots] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>("Initializing status handshake...");
  const [activeTab, setActiveTab] = useState<"stages" | "terminal">("terminal");

  // Terminal log state
  const [logs, setLogs] = useState<TerminalLogEntry[]>(() => [
    {
      id: "init-1",
      timestamp: formatTerminalTimestamp(),
      level: "info",
      category: "pipeline",
      message: `Connecting to MeetLog execution cluster for meeting "${title}"...`,
    },
    {
      id: "init-2",
      timestamp: formatTerminalTimestamp(),
      level: "storage",
      category: "storage",
      message: `Audio file stream authenticated and mounted (Meeting ID: ${meetingId.slice(0, 12)}...)`,
    },
    {
      id: "init-3",
      timestamp: formatTerminalTimestamp(),
      level: "ai",
      category: "ai engine",
      message: "Allocating AI speech intelligence workers & verifying active API key pool...",
    },
  ]);

  const lastLoggedMessageRef = useRef<string>("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Update phase index and append new log lines whenever backend progressMessage changes
  useEffect(() => {
    const msg = progressMessage.trim();
    if (!msg || msg === lastLoggedMessageRef.current) return;
    lastLoggedMessageRef.current = msg;

    const lower = msg.toLowerCase();
    let level: TerminalLogEntry["level"] = "info";
    let category = "pipeline";

    if (lower.includes("wait") || lower.includes("queue") || lower.includes("handshake")) {
      setPhaseIndex(0);
      level = "info";
      category = "stream";
    } else if (lower.includes("transcrib") || lower.includes("sarvam ai") || lower.includes("gemini 3.5")) {
      setPhaseIndex(1);
      level = "ai";
      category = "transcribe";
    } else if (lower.includes("download") || lower.includes("stabiliz") || lower.includes("slice") || lower.includes("diariz")) {
      setPhaseIndex(2);
      level = "audio";
      category = "diarization";
    } else if (lower.includes("gemini") || lower.includes("chapters") || lower.includes("summary") || lower.includes("insight")) {
      setPhaseIndex(3);
      level = "ai";
      category = "synthesis";
    } else if (lower.includes("save") || lower.includes("saving") || lower.includes("index") || lower.includes("final")) {
      setPhaseIndex(4);
      level = "success";
      category = "indexing";
    }

    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatTerminalTimestamp(),
        level,
        category,
        message: msg,
      },
    ]);
  }, [progressMessage]);

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        const response = await axios.get(`/api/meetings/${meetingId}/status`);
        const { status, progressMessage: serverProgressMessage } = response.data;

        if (!active) return;

        if (serverProgressMessage) {
          setProgressMessage(serverProgressMessage);
        }

        if (status === "COMPLETED") {
          setLogs((prev) => [
            ...prev,
            {
              id: `done-${Date.now()}`,
              timestamp: formatTerminalTimestamp(),
              level: "success",
              category: "complete",
              message: "Meeting transcription & AI synthesis complete! Reloading viewer...",
            },
          ]);
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else if (status === "FAILED") {
          setLogs((prev) => [
            ...prev,
            {
              id: `fail-${Date.now()}`,
              timestamp: formatTerminalTimestamp(),
              level: "error",
              category: "error",
              message: `Processing failed: ${serverProgressMessage || "Unknown error"}`,
            },
          ]);
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          setPollCount((c) => c + 1);
        }
      } catch (err: any) {
        console.error("Failed to check status", err);
      }
    }

    checkStatus();
    const pollInterval = setInterval(checkStatus, 6000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [meetingId, router]);

  const calculatedProgress = Math.min(
    98,
    Math.max(8, phaseIndex * 20 + Math.min(18, pollCount * 2))
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ─── Top Header Card ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 rounded-2xl border border-border bg-card shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-inner">
            <span className="absolute inset-0 size-full rounded-2xl bg-primary/10 animate-ping opacity-75" />
            <AudioLines className="size-7 animate-pulse relative z-10" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shadow-2xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>AI Pipeline Active</span>
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                Sync #{pollCount}{dots}
              </span>
            </div>

            <h1 className="text-lg font-bold tracking-tight text-foreground truncate max-w-md md:max-w-xl">
              &quot;{title}&quot;
            </h1>
          </div>
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/40 shrink-0 self-start md:self-auto shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "terminal"
                ? "bg-card text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Terminal className="size-3.5 text-primary" />
            <span>Live Terminal</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stages")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "stages"
                ? "bg-card text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>Pipeline Stages</span>
          </button>
        </div>
      </div>

      {/* ─── Progress Bar & Active State ───────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="font-bold">{progressMessage}</span>
          </div>
          <span className="text-primary font-mono font-bold">{calculatedProgress}%</span>
        </div>

        <div className="h-2 w-full bg-muted rounded-full overflow-hidden p-0.5 border border-border/50">
          <div
            className="h-full bg-gradient-to-r from-primary via-emerald-500 to-primary bg-[length:200%_100%] animate-gradient rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${calculatedProgress}%` }}
          />
        </div>
      </div>

      {/* ─── Tab 1: Live Execution Terminal ───────────────────────────── */}
      {activeTab === "terminal" && (
        <div className="space-y-2">
          <PipelineTerminal
            logs={logs}
            title={`MeetLog Pipeline Engine • Live Execution Logs (${meetingId.slice(0, 8)})`}
            engineName="Google Gemini 3.5 & Sarvam Speech"
            isLive={true}
            maxHeight="380px"
            onClear={() => setLogs([])}
          />
        </div>
      )}

      {/* ─── Tab 2: Structured Stages Checklist ───────────────────────── */}
      {activeTab === "stages" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-foreground mb-4">Pipeline Milestones</h3>
          <div className="space-y-2.5">
            {PHASE_LABELS.map((label, i) => {
              const isDone = i < phaseIndex;
              const isCurrent = i === phaseIndex;

              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all ${
                    isDone
                      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20"
                      : isCurrent
                        ? "text-primary bg-primary/10 border border-primary/30 font-semibold shadow-2xs"
                        : "text-muted-foreground/40 bg-muted/20"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : isCurrent ? (
                    <Loader2 className="size-4 animate-spin shrink-0 text-primary" />
                  ) : (
                    <Clock className="size-4 shrink-0 opacity-40" />
                  )}
                  <span className="flex-1 text-xs font-semibold">{label}</span>
                  {isDone && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      COMPLETED
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-bold text-primary animate-pulse">
                      PROCESSING...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Bottom Actions ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          You can safely leave this page — transcription will continue processing in the cloud.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/workspace/${workspaceSlug}`)}
            className="inline-flex items-center justify-center rounded-xl text-xs font-bold border border-border bg-background hover:bg-muted h-9 px-4 transition-all shadow-2xs cursor-pointer"
          >
            Go to Dashboard
          </button>
          <button
            onClick={() => router.refresh()}
            className="inline-flex items-center justify-center rounded-xl text-xs font-bold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 h-9 px-4 transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Check Status
          </button>
        </div>
      </div>
    </div>
  );
}