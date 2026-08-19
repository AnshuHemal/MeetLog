"use client";

import React, { useState, useTransition, useEffect, useRef } from "react";
import { Search, FileAudio, MessageSquare, Clock, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchWorkspaceMeetingsAction, type SearchResults } from "../actions";
import { WorkspaceTopbar } from "../../_components/workspace-topbar";

interface SearchPageClientProps {
  workspaceSlug: string;
  workspaceName: string;
}

import { formatDurationHuman, formatSecondsToTime } from "@/lib/time-utils";

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function SearchPageClient({ workspaceSlug, workspaceName }: SearchPageClientProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ meetings: [], segments: [] });
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"all" | "meetings" | "segments">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ meetings: [], segments: [] });
      return;
    }

    const delay = setTimeout(() => {
      startTransition(async () => {
        try {
          const data = await searchWorkspaceMeetingsAction(workspaceSlug, trimmed);
          setResults(data);
        } catch (e) {
          console.error("Search failed", e);
        }
      });
    }, 300);

    return () => clearTimeout(delay);
  }, [query, workspaceSlug]);

  function highlightText(text: string, search: string) {
    if (!search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${escapeRegExp(search)})`, "gi");
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
    <div className="flex flex-1 flex-col overflow-y-auto bg-background">
      <WorkspaceTopbar
        workspaceName={workspaceName}
        workspaceSlug={workspaceSlug}
        pageTitle="Global Search"
      />

      <main className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        {}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search across all meeting summaries, titles, and spoken transcripts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-11 pr-12 h-12 text-sm bg-card border-border focus-visible:ring-primary shadow-xs rounded-xl"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-bold text-muted-foreground">
                  <span>⌘</span>K
                </kbd>
              )}
            </div>
          </div>
        </div>

        {query.trim() && (
          <div className="space-y-6">
            {}
            <div className="flex border-b border-border gap-6">
              {[
                { id: "all", label: "All Results" },
                { id: "meetings", label: `Meetings (${results.meetings.length})` },
                { id: "segments", label: `Transcript Matches (${results.segments.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer relative ${
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {}
            {!isPending && !hasResults && (
              <div className="text-center py-12 rounded-xl border border-dashed border-border bg-card/50">
                <Search className="size-8 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-bold text-foreground">No matches found</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Try searching for a different keyword or checking your spelling.
                </p>
              </div>
            )}

            <div className="space-y-6">
              {}
              {(activeTab === "all" || activeTab === "meetings") && results.meetings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Matching Recordings
                  </h3>
                  <div className="grid gap-3">
                    {results.meetings.map((meeting) => (
                      <Link
                        key={meeting.id}
                        href={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}
                        className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/5 transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <FileAudio className="size-4.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {highlightText(meeting.title, query)}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-lg">
                              {meeting.description
                                ? highlightText(meeting.description, query)
                                : "No description."}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="size-3.5" />
                            {formatDurationHuman(meeting.durationSeconds)}
                          </span>
                          <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {}
              {(activeTab === "all" || activeTab === "segments") && results.segments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Transcripts & Conversations
                  </h3>
                  <div className="space-y-2.5">
                    {results.segments.map((seg) => (
                      <Link
                        key={seg.id}
                        href={`/workspace/${workspaceSlug}/meetings/${seg.meetingId}?t=${seg.startTime}`}
                        className="group block p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/5 transition-all shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <span className="text-foreground font-bold">{seg.speakerName}</span>
                            <span>in</span>
                            <span className="text-primary hover:underline">{seg.meetingTitle}</span>
                          </div>
                          <span className="text-xs font-mono font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50 shrink-0 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                            Jump to {formatSecondsToTime(seg.startTime)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 mt-2.5 leading-relaxed pl-3 border-l-2 border-primary/20 group-hover:border-primary/50 transition-colors">
                          {highlightText(seg.text, query)}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {}
        {!query.trim() && (
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-foreground">💡 Search Tips & Tricks</h3>
            <div className="grid gap-3 sm:grid-cols-2 text-xs text-muted-foreground">
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Search by Keywords</p>
                <p>Find specific sentences spoken, such as "pricing", "deadline", or "design".</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Filter by Speakers</p>
                <p>Locate what a specific speaker said by typing their name or identifier.</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Track Meeting Topics</p>
                <p>Search meeting titles and descriptions to find context instantly.</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Keyboard Shortcuts</p>
                <p>Press `⌘K` or `Ctrl+K` from any dashboard page to trigger search overlay.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
