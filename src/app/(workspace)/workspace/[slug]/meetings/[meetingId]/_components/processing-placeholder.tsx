"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, AudioLines, Clock, CheckCircle2 } from "lucide-react";
import axios from "axios";

interface ProcessingPlaceholderProps {
  meetingId: string;
  workspaceSlug: string;
  title: string;
}

const PHASE_LABELS = [
  "Stream verification & chunk handshake",
  "Sarvam AI batch speech recognition",
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

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const msg = progressMessage.toLowerCase();
    if (msg.includes("wait") || msg.includes("queue") || msg.includes("handshake")) {
      setPhaseIndex(0);
    } else if (msg.includes("transcrib") || msg.includes("sarvam ai is")) {
      setPhaseIndex(1);
    } else if (msg.includes("download") || msg.includes("stabiliz")) {
      setPhaseIndex(2);
    } else if (msg.includes("gemini") || msg.includes("chapters") || msg.includes("summary")) {
      setPhaseIndex(3);
    } else if (msg.includes("save") || msg.includes("saving") || msg.includes("index") || msg.includes("final")) {
      setPhaseIndex(4);
    }
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
          window.location.reload();
        } else if (status === "FAILED") {
          window.location.reload();
        } else {
          setPollCount((c) => c + 1);
        }
      } catch (err) {
        console.error("Failed to check status", err);
      }
    }

    checkStatus();
    const pollInterval = setInterval(checkStatus, 8000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [meetingId, router]);

  const calculatedProgress = Math.min(
    98,
    Math.max(8, (phaseIndex * 20) + Math.min(18, (pollCount * 2)))
  );

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg text-center p-8 rounded-2xl border border-border bg-card shadow-xl relative overflow-hidden">
      {}
      <div className="absolute -top-24 -left-24 size-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 size-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative mb-6 flex items-center justify-center">
        <span className="absolute inset-0 size-20 rounded-full bg-primary/10 animate-ping" />
        <div className="relative z-10 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-inner">
          <AudioLines className="size-10 animate-pulse" />
        </div>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-3 shadow-2xs">
        <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
        <span>Long Audio Engine Active (4-5 Hour Recording)</span>
      </div>

      <h2 className="text-xl font-bold tracking-tight text-foreground">Processing Meeting Recording</h2>
      <p className="text-sm font-semibold text-primary mt-1 truncate max-w-full px-4">
        &quot;{title}&quot;
      </p>

      <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed max-w-sm">
        Processing audio chunks with Sarvam AI diarization and Gemini multi-chunk synthesis. You can safely close this page — your recording will keep processing in the background.
      </p>

      {}
      <div className="mt-6 w-full space-y-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground px-1">
          <span>Pipeline Progress</span>
          <span className="text-primary font-mono font-bold">{calculatedProgress}%</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden p-0.5 border border-border/50">
          <div
            className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${calculatedProgress}%` }}
          />
        </div>
      </div>

      {}
      <div className="mt-5 w-full bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/25 rounded-xl px-4 py-3 text-left">
        <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1">
          <Loader2 className="size-3 animate-spin" />
          <span>Active Operation</span>
        </div>
        <p className="text-xs text-foreground/80 font-medium leading-relaxed">
          {progressMessage}
        </p>
      </div>

      {}
      <div className="mt-5 w-full space-y-2 text-left">
        {PHASE_LABELS.map((label, i) => {
          const isDone = i < phaseIndex;
          const isCurrent = i === phaseIndex;

          return (
            <div
              key={label}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
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
              <span className="flex-1 truncate">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/60 border border-border px-3.5 py-1.5 rounded-full shadow-2xs">
        <Loader2 className="size-3 animate-spin text-primary" />
        <span>Status sync check #{pollCount}{dots}</span>
      </div>

      <div className="mt-8 flex gap-3 border-t border-border pt-6 w-full justify-center">
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
  );
}
