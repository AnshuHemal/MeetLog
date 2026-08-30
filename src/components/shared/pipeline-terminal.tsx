"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Trash2,
  Radio,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "ai" | "audio" | "storage";
  category: string;
  message: string;
}

interface PipelineTerminalProps {
  logs: TerminalLogEntry[];
  title?: string;
  isLive?: boolean;
  engineName?: string;
  onClear?: () => void;
  maxHeight?: string;
  defaultExpanded?: boolean;
}

export function PipelineTerminal({
  logs,
  title = "MeetLog AI Engine v3.5 • Live Pipeline Console",
  isLive = true,
  engineName = "Google Gemini 3.5",
  onClear,
  maxHeight = "320px",
  defaultExpanded = true,
}: PipelineTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    if (autoScroll && terminalEndRef.current && isExpanded) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, isExpanded]);

  // Handle user scroll (pause auto-scroll if scrolled up)
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const handleCopyLogs = () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.category.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getBadgeStyle = (level: TerminalLogEntry["level"]) => {
    switch (level) {
      case "success":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "error":
        return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "warning":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "ai":
        return "text-violet-400 bg-violet-500/10 border-violet-500/20";
      case "audio":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "storage":
        return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      default:
        return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div
      className={`w-full rounded-2xl border border-zinc-800/80 bg-zinc-950/95 text-zinc-300 font-mono shadow-2xl overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-4 z-50 flex flex-col h-[calc(100vh-2rem)] max-h-none border-primary/40 shadow-primary/10"
          : "relative"
      }`}
    >
      {/* ─── Terminal Header (macOS-style) ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800/80 select-none">
        {/* Left: Window Controls + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="size-3 rounded-full bg-rose-500/80 border border-rose-600/40" />
            <div className="size-3 rounded-full bg-amber-500/80 border border-amber-600/40" />
            <div className="size-3 rounded-full bg-emerald-500/80 border border-emerald-600/40" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Terminal className="size-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-zinc-200 truncate">{title}</span>
          </div>
        </div>

        {/* Right: Controls & Telemetry */}
        <div className="flex items-center gap-2 shrink-0">
          {isLive && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE PIPELINE</span>
            </div>
          )}

          {engineName && (
            <span className="hidden md:inline-flex text-[10px] text-zinc-500 px-2 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50">
              {engineName}
            </span>
          )}

          {/* Action Buttons */}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="size-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Copy Terminal Logs"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          </button>

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="size-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Clear Terminal"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="size-7 hidden sm:flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="size-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* ─── Terminal Body (Scrollable Output) ─────────────────────────── */}
      {isExpanded && (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          style={{ height: isFullscreen ? "100%" : maxHeight }}
          className="overflow-y-auto p-4 space-y-1.5 text-xs text-zinc-300 leading-relaxed font-mono custom-scrollbar"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600 space-y-2">
              <Terminal className="size-8 opacity-40 animate-pulse" />
              <p className="text-xs">Waiting for execution stream to initialize...</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-zinc-900/60 px-2 py-1 rounded-md transition-colors font-mono"
              >
                {/* Timestamp */}
                <span className="text-[10px] text-zinc-500 shrink-0 select-none pt-0.5">
                  [{log.timestamp}]
                </span>

                {/* Category Badge */}
                <span
                  className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border uppercase shrink-0 select-none ${getBadgeStyle(
                    log.level
                  )}`}
                >
                  {log.category}
                </span>

                {/* Message */}
                <span className="text-xs text-zinc-200 break-words flex-1 leading-snug">
                  {log.message}
                </span>
              </div>
            ))
          )}

          {/* Active Blinking Prompt */}
          {isLive && (
            <div className="flex items-center gap-2 pt-2 px-2 text-zinc-500 select-none text-xs">
              <span className="text-emerald-400 font-bold">➜</span>
              <span className="text-primary font-bold">meetlog-cluster</span>
              <span className="text-zinc-600">git:(pipeline)</span>
              <span className="inline-block size-2 bg-emerald-400 animate-pulse rounded-xs" />
            </div>
          )}

          <div ref={terminalEndRef} />
        </div>
      )}

      {/* ─── Terminal Footer (Status Bar) ─────────────────────────────── */}
      {isExpanded && (
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-t border-zinc-800/80 text-[10px] text-zinc-500 select-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Radio className="size-3 text-emerald-400 animate-pulse" />
              <span>{isLive ? "Telemetry Stream Connected" : "Execution Finished"}</span>
            </span>
            <span>•</span>
            <span>{logs.length} events logged</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`hover:underline cursor-pointer ${
                autoScroll ? "text-primary font-bold" : "text-zinc-500"
              }`}
            >
              Auto-scroll: {autoScroll ? "ON" : "PAUSED"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to generate a standardized timestamp
 */
export function formatTerminalTimestamp(date: Date = new Date()): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3
  )}`;
}