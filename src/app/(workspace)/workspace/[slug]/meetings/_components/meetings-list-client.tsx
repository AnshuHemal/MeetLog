"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Search, FileAudio, PlayCircle, Plus, AlertCircle, RefreshCw, List, LayoutGrid, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeIn } from "@/components/motion/fade-in";
import { MeetingDeleteButton } from "@/components/meetings/delete-meeting-dialog";
import { useWorkspaceSafe } from "@/components/providers/workspace-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewMode } from "@/hooks/use-view-mode";

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  status: string;
  numSpeakers: number | null;
  createdAt: Date;
}

interface MeetingsListClientProps {
  meetings: Meeting[];
  slug: string;
}

import { formatDurationHuman } from "@/lib/time-utils";

function formatDuration(seconds: number): string {
  return formatDurationHuman(seconds);
}

function formatUploadedDateTime(createdAt: Date | string): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function MeetingsListClient({ meetings: initialMeetings, slug }: MeetingsListClientProps) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETED" | "TRANSCRIBING" | "FAILED">("ALL");
  const [viewMode, setViewMode] = useViewMode("grid");
  const [, startTransition] = useTransition();
  const workspace = useWorkspaceSafe();
  const canDelete = workspace?.currentUserRole !== "VIEWER";

  const handleMeetingDeleted = (meetingId: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
  };

  const filteredMeetings = meetings.filter((meeting) => {
    const matchesSearch =
      meeting.title.toLowerCase().includes(search.toLowerCase()) ||
      (meeting.description && meeting.description.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === "ALL" ||
      meeting.status === statusFilter ||
      (statusFilter === "TRANSCRIBING" && meeting.status === "UPLOADED");

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {}
      <FadeIn direction="down" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Recordings Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, search, and manage all the recorded sessions in this workspace.
          </p>
        </div>
        <Button asChild>
          <Link href={`/workspace/${slug}/upload`}>
            <Plus className="mr-2 size-4" /> Upload Recording
          </Link>
        </Button>
      </FadeIn>

      {}
      <FadeIn delay={0.05} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-border bg-card p-4 rounded-xl shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title or details..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
          />
        </div>

        {}
        <div className="flex items-center gap-3">
          {}
          <div className="flex flex-wrap items-center gap-1.5 bg-muted p-1 rounded-lg">
            {(["ALL", "COMPLETED", "TRANSCRIBING", "FAILED"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  statusFilter === filter
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter.charAt(0) + filter.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {}
          <div className="flex items-center gap-1 border-l border-border pl-3">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-lg cursor-pointer hover:bg-muted"
              onClick={() => setViewMode("list")}
              title="List View"
            >
              <List className="size-4 text-foreground" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-lg cursor-pointer hover:bg-muted"
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <LayoutGrid className="size-4 text-foreground" />
            </Button>
          </div>
        </div>
      </FadeIn>

      {}
      <FadeIn delay={0.1}>
        {filteredMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-16 text-center bg-card">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <FileAudio className="size-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No recordings found</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {search || statusFilter !== "ALL"
                ? "Try adjusting your search query or status filter to see other recordings."
                : "Get started by uploading your first meeting audio file. We'll transcribe it with speaker labels."}
            </p>
            {!(search || statusFilter !== "ALL") && (
              <Button asChild className="mt-6">
                <Link href={`/workspace/${slug}/upload`}>
                  <Plus className="mr-2 size-4" /> Upload Meeting
                </Link>
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="grid gap-4">
            {filteredMeetings.map((meeting) => (
              <div
                key={meeting.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border bg-card p-5 gap-4 hover:border-primary/50 hover:shadow-xs transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <FileAudio className="size-5 text-primary" />
                  </div>
                  <div>
                    {meeting.status === "COMPLETED" || meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED" ? (
                      <Link
                        href={`/workspace/${slug}/meetings/${meeting.id}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors text-base"
                      >
                        {meeting.title}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground text-base">
                        {meeting.title}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>Duration: {formatDuration(meeting.durationSeconds)}</span>
                      <span>•</span>
                      <span>{formatUploadedDateTime(meeting.createdAt)}</span>
                      {meeting.numSpeakers && (
                        <>
                          <span>•</span>
                          <span>Speakers: {meeting.numSpeakers}</span>
                        </>
                      )}
                    </div>
                    {meeting.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                        {meeting.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 pt-3 sm:pt-0 border-border">
                  {}
                  <div>
                    {meeting.status === "COMPLETED" && (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                        Completed
                      </span>
                    )}
                    {(meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED") && (
                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 animate-pulse">
                        Transcribing
                      </span>
                    )}
                    {meeting.status === "FAILED" && (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                        Failed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(meeting.status === "COMPLETED" || meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED") && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/workspace/${slug}/meetings/${meeting.id}`}>
                          {meeting.status === "COMPLETED" ? (
                            <>
                              <PlayCircle className="mr-1.5 size-4" /> View
                            </>
                          ) : (
                            <>
                              <Loader2 className="mr-1.5 size-4 animate-spin text-primary" /> View Status
                            </>
                          )}
                        </Link>
                      </Button>
                    )}
                    {meeting.status === "FAILED" && (
                      <div className="flex items-center text-xs text-destructive gap-1">
                        <AlertCircle className="size-3.5" />
                        <span>Processing failed</span>
                      </div>
                    )}

                    {canDelete && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            aria-label="Meeting actions"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <MeetingDeleteButton
                              meetingId={meeting.id}
                              meetingTitle={meeting.title}
                              workspaceSlug={slug}
                              variant="menu-item"
                              className="w-full"
                              onDeleted={() => handleMeetingDeleted(meeting.id)}
                            />
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredMeetings.map((meeting) => {
              const isCompleted = meeting.status === "COMPLETED";
              const isTranscribing = meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED";
              const isFailed = meeting.status === "FAILED";

              return (
                <div
                  key={meeting.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all hover:shadow-xs h-[210px] justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileAudio className={`size-5 text-primary ${isTranscribing ? "animate-pulse" : ""}`} />
                      </div>
                      {}
                      <div>
                        {isCompleted && (
                          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                            Completed
                          </span>
                        )}
                        {isTranscribing && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 animate-pulse">
                            Transcribing
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                            Failed
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      {(isCompleted || isTranscribing) ? (
                        <Link
                          href={`/workspace/${slug}/meetings/${meeting.id}`}
                          className="font-bold text-foreground hover:text-primary transition-colors text-sm sm:text-base line-clamp-2 leading-snug"
                          title={meeting.title}
                        >
                          {meeting.title}
                        </Link>
                      ) : (
                        <span className="font-bold text-foreground text-sm sm:text-base line-clamp-2 leading-snug">
                          {meeting.title}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground mt-2 font-medium">
                        {formatUploadedDateTime(meeting.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4 mt-auto">
                    <span className="text-xs text-muted-foreground font-semibold">
                      {formatDuration(meeting.durationSeconds)}
                    </span>
                    {(isCompleted || isTranscribing) && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs px-2.5 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0 cursor-pointer border border-border group-hover:border-primary" asChild>
                        <Link href={`/workspace/${slug}/meetings/${meeting.id}`}>
                          {isCompleted ? "Open Viewer" : "View Status"}
                        </Link>
                      </Button>
                    )}
                    {isFailed && (
                      <span className="text-xs text-destructive font-medium">Failed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FadeIn>
    </div>
  );
}
