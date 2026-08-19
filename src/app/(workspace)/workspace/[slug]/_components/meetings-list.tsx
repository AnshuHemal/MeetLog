"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FileAudio, PlayCircle, AlertCircle, Loader2, List, LayoutGrid, Plus } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/hooks/use-view-mode";

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string;
  durationSeconds: number;
  status: string;
  numSpeakers: number | null;
  createdAt: Date | string;
}

interface MeetingsListProps {
  initialMeetings: Meeting[];
  workspaceSlug: string;
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

export function MeetingsList({ initialMeetings, workspaceSlug }: MeetingsListProps) {
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [viewMode, setViewMode] = useViewMode("grid");

  const activeJobIds = useMemo(() => {
    return meetings
      .filter((m) => m.status === "TRANSCRIBING" || m.status === "UPLOADED")
      .map((m) => m.id);
  }, [meetings]);

  useEffect(() => {
    if (activeJobIds.length === 0) return;

    let active = true;
    
    const checkStatus = async (id: string) => {
      try {
        const response = await axios.get(`/api/meetings/${id}/status`);
        const { status } = response.data;
        
        if (!active) return;
        
        if (status === "COMPLETED" || status === "FAILED") {
          setMeetings((prev) =>
            prev.map((m) => (m.id === id ? { ...m, status } : m))
          );
        }
      } catch (err) {
        console.error(`Failed to poll background status for meeting: ${id}`, err);
      }
    };

    activeJobIds.forEach((id) => checkStatus(id));
    const intervals = activeJobIds.map((id) => setInterval(() => checkStatus(id), 10000));

    return () => {
      active = false;
      intervals.forEach((interval) => clearInterval(interval));
    };
  }, [activeJobIds]);

  return (
    <div className="space-y-4">
      {}
      <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
        <h2 className="text-lg font-semibold text-foreground">Recent Recordings</h2>
        
        {meetings.length > 0 && (
          <div className="flex items-center gap-2">
            {}
            <Button variant="ghost" size="sm" asChild className="sm:hidden h-8 text-xs">
              <Link href={`/workspace/${workspaceSlug}/upload`}>
                <Plus className="mr-1 size-3.5" /> Upload
              </Link>
            </Button>

            <div className="flex items-center gap-1 border-l border-border pl-2 sm:border-0 sm:pl-0">
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
        )}
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center bg-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <FileAudio className="size-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No meetings uploaded</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Get started by uploading your first meeting audio file. We'll transcribe it with speaker labels and summarize it.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/workspace/${workspaceSlug}/upload`}>
              <Plus className="mr-2 size-4" /> Upload Meeting
            </Link>
          </Button>
        </div>
      ) : viewMode === "list" ? (
        <div className="grid gap-4">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border bg-card p-5 gap-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                  <FileAudio className="size-5 text-primary" />
                </div>
                <div>
                  {meeting.status === "COMPLETED" || meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED" ? (
                    <Link
                      href={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}
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
                  {meeting.status === "TRANSCRIBING" && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 animate-pulse">
                      Transcribing
                    </span>
                  )}
                  {meeting.status === "UPLOADED" && (
                    <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                      Queued
                    </span>
                  )}
                  {meeting.status === "FAILED" && (
                    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                      Failed
                    </span>
                  )}
                </div>

                {(meeting.status === "COMPLETED" || meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED") && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}>
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
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {meetings.map((meeting) => {
            const isCompleted = meeting.status === "COMPLETED";
            const isTranscribing = meeting.status === "TRANSCRIBING";
            const isQueued = meeting.status === "UPLOADED";
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
                      {isQueued && (
                        <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                          Queued
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
                    {(isCompleted || isTranscribing || isQueued) ? (
                      <Link
                        href={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}
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
                  {(isCompleted || isTranscribing || isQueued) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs px-2.5 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0 cursor-pointer border border-border group-hover:border-primary" asChild>
                      <Link href={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}>
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
    </div>
  );
}
