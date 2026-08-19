"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, FileAudio, Clock, ArrowRight, Loader2, X, Command } from "lucide-react";
import { useRouter } from "next/navigation";
import { searchWorkspaceMeetingsAction, type SearchResults } from "@/app/(workspace)/workspace/[slug]/search/actions";
import { useWorkspaceSafe } from "@/components/providers/workspace-provider";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const ctx = useWorkspaceSafe();
  const workspaceSlug = ctx?.workspaceSlug;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ meetings: [], segments: [] });
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ meetings: [], segments: [] });
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !workspaceSlug) {
      setResults({ meetings: [], segments: [] });
      return;
    }

    const delay = setTimeout(() => {
      startTransition(async () => {
        try {
          const data = await searchWorkspaceMeetingsAction(workspaceSlug, trimmed);
          setResults(data);
        } catch (e) {
          console.error("Command palette search failed", e);
        }
      });
    }, 200);

    return () => clearTimeout(delay);
  }, [query, workspaceSlug]);

  function handleLinkClick(href: string) {
    router.push(href);
    onClose();
  }

  function highlightText(text: string, search: string) {
    if (!search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-primary/20 text-foreground font-semibold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  }

  const hasResults = results.meetings.length > 0 || results.segments.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            ref={modalRef}
            className="w-full max-w-xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col h-[400px] max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-muted/20 shrink-0">
              <Search className="size-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type keywords to search across meetings..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 text-base bg-transparent border-none outline-none placeholder:text-muted-foreground text-foreground focus:ring-0 focus:outline-none"
              />
              {isPending ? (
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
              ) : (
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin select-none">
              {query.trim() ? (
                <>
                  {!isPending && !hasResults && (
                    <div className="text-center py-10">
                      <Search className="size-7 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-bold text-foreground">No matches found</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Try keywords like summary, tasks, or names.</p>
                    </div>
                  )}

                  {}
                  {results.meetings.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2">Meetings</p>
                      {results.meetings.map((meeting) => (
                        <div
                          key={meeting.id}
                          onClick={() => handleLinkClick(`/workspace/${workspaceSlug}/meetings/${meeting.id}`)}
                          className="group flex items-center justify-between px-2 py-2 rounded-lg hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileAudio className="size-4 text-primary shrink-0" />
                            <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {highlightText(meeting.title, query)}
                            </span>
                          </div>
                          <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}

                  {}
                  {results.segments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2">Transcript Matches</p>
                      {results.segments.map((seg) => (
                        <div
                          key={seg.id}
                          onClick={() => handleLinkClick(`/workspace/${workspaceSlug}/meetings/${seg.meetingId}?t=${seg.startTime}`)}
                          className="group flex flex-col gap-1 p-2 rounded-lg hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <span className="text-foreground">{seg.speakerName}</span>
                              <span>in</span>
                              <span className="text-primary truncate max-w-[200px]">{seg.meetingTitle}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border/50 shrink-0">
                              Jump link
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80 line-clamp-1 italic pl-2 border-l-2 border-primary/20">
                            {highlightText(seg.text, query)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Command className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">MeetLog Quick Search</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Start typing to search titles and transcripts globally.</p>
                  </div>
                </div>
              )}
            </div>

            {}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>Search matches will highlight keywords automatically</span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[11px]">esc</kbd> to close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
