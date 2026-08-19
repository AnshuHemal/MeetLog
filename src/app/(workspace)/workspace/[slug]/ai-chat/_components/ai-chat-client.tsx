"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, Send, Bot, User, ArrowRight, Clock,
  Loader2, RefreshCw, FileText, CheckCircle2, MessageSquare, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { askWorkspaceAIAction, clearWorkspaceAIChatHistoryAction, type Citation, type DBMessageItem } from "../actions";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  citations?: Citation[];
  createdAt: string;
}

const STARTER_PROMPTS = [
  "What technical decisions were made this week?",
  "Summarize key action items across all meetings",
  "What client feedback or objections were discussed?",
  "List key roadmap features planned for next sprint",
];

function getDateHeaderLabel(dateIsoStr: string): string {
  if (!dateIsoStr) return "Today";
  const date = new Date(dateIsoStr);
  if (isNaN(date.getTime())) return "Today";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeOnly(dateIsoStr: string): string {
  if (!dateIsoStr) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = new Date(dateIsoStr);
  if (isNaN(date.getTime())) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderFormattedMessage(text: string) {
  if (!text) return null;
  
  const lines = text.split("\n");
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        const isBullet = trimmed.startsWith("* ") || trimmed.startsWith("- ");
        const contentToParse = isBullet ? trimmed.slice(2) : line;

        const parts = contentToParse.split(/(\*\*[^*]+\*\*)/g);

        const renderedLine = (
          <span key={lineIdx}>
            {parts.map((part, partIdx) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                const inner = part.slice(2, -2);
                return (
                  <strong key={partIdx} className="font-bold text-foreground">
                    {inner}
                  </strong>
                );
              }
              return part;
            })}
          </span>
        );

        if (isBullet) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2">
              <span className="text-primary font-bold select-none">•</span>
              <div className="flex-1">{renderedLine}</div>
            </div>
          );
        }

        return <div key={lineIdx}>{renderedLine}</div>;
      })}
    </div>
  );
}

export function AIChatClient({
  workspaceSlug,
  workspaceName,
  initialMessages = [],
}: {
  workspaceSlug: string;
  workspaceName: string;
  initialMessages?: DBMessageItem[];
}) {
  const defaultWelcomeMsg: Message = {
    id: "welcome-1",
    sender: "ai",
    text: `Hello! I am your **${workspaceName}** Intelligence Assistant. Ask me anything about decisions, action items, or discussions recorded across your workspace meetings!`,
    createdAt: new Date().toISOString(),
  };

  const [messages, setMessages] = useState<Message[]>(
    initialMessages.length > 0 ? initialMessages : [defaultWelcomeMsg]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleClearChat() {
    setMessages([defaultWelcomeMsg]);
    try {
      await clearWorkspaceAIChatHistoryAction(workspaceSlug);
    } catch (e) {
      console.error("Failed to clear DB chat history:", e);
    }
  }

  async function handleSend(promptText?: string) {
    const query = (promptText || input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput("");
    setLoading(true);

    try {
      const res = await askWorkspaceAIAction(workspaceSlug, query);
      if (res.success && res.answer) {
        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: res.answer,
          citations: res.citations || [],
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: Message = {
          id: `ai-err-${Date.now()}`,
          sender: "ai",
          text: `⚠️ ${res.error || "Sorry, I could not complete that query. Please try again."}`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err) {
      console.error("AI Assistant Error:", err);
    } finally {
      setLoading(false);
    }
  }

  const groupedMessages: Array<{ dateLabel: string; msgs: Message[] }> = [];
  messages.forEach((msg) => {
    const label = getDateHeaderLabel(msg.createdAt);
    let lastGroup = groupedMessages[groupedMessages.length - 1];
    if (!lastGroup || lastGroup.dateLabel !== label) {
      groupedMessages.push({ dateLabel: label, msgs: [msg] });
    } else {
      lastGroup.msgs.push(msg);
    }
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300">
      
      {}
      <div className="flex items-center justify-between border-b border-border p-6 bg-card shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-foreground">{workspaceName} AI Assistant</h1>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                RAG Database Sync
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Synthesizes insights across all recorded transcripts with interactive timestamp citations.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 cursor-pointer"
          onClick={handleClearChat}
        >
          <RefreshCw className="size-3.5" />
          <span>Clear Chat</span>
        </Button>
      </div>

      {}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
        
        {}
        {messages.length <= 1 && (
          <div className="w-full my-4 space-y-3">
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground text-center mb-4">
              Suggested Starter Queries
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left text-xs font-semibold text-foreground group shadow-2xs cursor-pointer"
                >
                  <span>{prompt}</span>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        )}

        {}
        {groupedMessages.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-6">
            
            {}
            <div className="flex items-center justify-center my-4">
              <span className="text-[11px] font-bold text-muted-foreground bg-muted/60 border border-border px-3 py-1 rounded-full shadow-3xs uppercase tracking-wider">
                {group.dateLabel}
              </span>
            </div>

            {}
            {group.msgs.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3.5 w-full ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
              >
                {}
                <div
                  className={`size-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-foreground border-border"
                  }`}
                >
                  {msg.sender === "user" ? <User className="size-4.5" /> : <Bot className="size-4.5 text-primary" />}
                </div>

                {}
                <div className={`space-y-2 min-w-0 flex-1 ${msg.sender === "user" ? "flex flex-col items-end" : ""}`}>
                  <div className={`flex items-center gap-2 ${msg.sender === "user" ? "justify-end" : ""}`}>
                    <span className="text-xs font-bold text-foreground">
                      {msg.sender === "user" ? "You" : "Workspace AI"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{formatTimeOnly(msg.createdAt)}</span>
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed border shadow-3xs ${
                      msg.sender === "user"
                        ? "bg-primary text-primary-foreground border-primary/20 w-fit max-w-[85%] ml-auto"
                        : "bg-card text-foreground border-border w-fit max-w-[90%]"
                    }`}
                  >
                    {renderFormattedMessage(msg.text)}
                  </div>

                  {}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Source Citations & Audio Jumps:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((c, i) => (
                          <Button
                            key={i}
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 bg-muted/40 hover:bg-primary/10 hover:border-primary/30 border-border rounded-lg transition-colors cursor-pointer font-mono"
                          >
                            <Link href={`/workspace/${workspaceSlug}/meetings/${c.meetingId}?t=${c.timestampSeconds}`}>
                              <Clock className="size-3 text-primary shrink-0" />
                              <span className="truncate max-w-[160px] font-bold text-foreground">{c.meetingTitle}</span>
                              <span className="text-primary font-bold">({c.timestampFormatted})</span>
                              <ExternalLink className="size-3 text-muted-foreground" />
                            </Link>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ))}

        {}
        {loading && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              <Loader2 className="size-4.5 animate-spin" />
            </div>
            <span className="text-xs font-semibold">Analyzing workspace meeting context & synthesizing answer...</span>
          </div>
        )}

      </div>

      {}
      <div className="border-t border-border p-4 bg-card shrink-0 w-full">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-3 w-full"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask anything about discussions across ${workspaceName}...`}
            disabled={loading}
            className="flex-1 h-11 text-sm bg-background border-border focus-visible:ring-primary w-full"
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-11 px-5 font-bold gap-2 shrink-0 cursor-pointer"
          >
            <span>Ask AI</span>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>

    </div>
  );
}
