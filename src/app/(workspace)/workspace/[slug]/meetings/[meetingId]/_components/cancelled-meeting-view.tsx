"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  RotateCcw,
  Trash2,
  LayoutDashboard,
  Loader2,
  Sparkles,
  Info,
  Clock,
  AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { retranscribeMeetingAction } from "../actions";
import { deleteMeetingAction } from "../../actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CancelledMeetingViewProps {
  meetingId: string;
  workspaceSlug: string;
  title: string;
  durationSeconds?: number;
}

export function CancelledMeetingView({
  meetingId,
  workspaceSlug,
  title,
  durationSeconds,
}: CancelledMeetingViewProps) {
  const router = useRouter();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "Unknown duration";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const handleRestart = async (provider: "GEMINI" | "SARVAM" = "GEMINI") => {
    setIsRestarting(true);
    try {
      const res = await retranscribeMeetingAction(meetingId, workspaceSlug, provider);
      if (res.success) {
        toast.success("Transcription restarted! Allocating AI workers...");
        setTimeout(() => {
          window.location.replace(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
        }, 500);
      } else {
        toast.error(res.error || "Failed to restart transcription.");
        setIsRestarting(false);
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred while restarting.");
      setIsRestarting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteMeetingAction(meetingId, workspaceSlug);
      if (res.success) {
        toast.success("Meeting deleted successfully.");
        router.push(`/workspace/${workspaceSlug}`);
      } else {
        toast.error(res.error || "Failed to delete meeting.");
        setIsDeleting(false);
        setDeleteDialogOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete meeting.");
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        className="rounded-3xl border border-border bg-card shadow-lg overflow-hidden relative"
      >
        {/* Ambient Top Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-amber-500/10 dark:bg-amber-400/5 blur-3xl"
        />

        <div className="p-8 sm:p-10 space-y-8 relative z-10">
          {/* Header Badge & Icon */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 shadow-inner">
                <Ban className="size-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Job Cancelled
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    ID: {meetingId.slice(0, 8)}
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground mt-1 line-clamp-1">
                  &quot;{title}&quot;
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/workspace/${workspaceSlug}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto cursor-pointer"
            >
              <LayoutDashboard className="size-3.5" />
              <span>Dashboard</span>
            </button>
          </div>

          {/* Details Card */}
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Info className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="font-semibold text-foreground">
                  Transcription was halted by user request
                </p>
                <p className="mt-1">
                  All active AI speech recognition workers and audio chunk streams were immediately
                  terminated. No audio segments or summaries were committed to your workspace.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 flex flex-wrap items-center gap-6 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary" />
                <span>Audio Duration: {formatDuration(durationSeconds)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AudioLines className="size-3.5 text-primary" />
                <span>Media: Preserved in cloud storage</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary: Restart with Gemini */}
              <Button
                type="button"
                onClick={() => handleRestart("GEMINI")}
                disabled={isRestarting || isDeleting}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:bg-primary/90 gap-2 cursor-pointer transition-all"
              >
                {isRestarting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Restarting Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>Restart Transcription</span>
                  </>
                )}
              </Button>

              {/* Secondary: Delete Meeting */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isRestarting || isDeleting}
                className="w-full h-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold gap-2 cursor-pointer transition-all"
              >
                <Trash2 className="size-4" />
                <span>Delete Meeting</span>
              </Button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              You can restart anytime. The uploaded audio file is safely retained until you delete it.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="size-5" />
              Permanently delete this meeting?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to delete &quot;{title}&quot;? This will remove the audio recording
              and meeting metadata from your workspace. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl">
              Keep Meeting
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Yes, Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
