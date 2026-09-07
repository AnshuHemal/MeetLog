"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  AudioLines,
  Ban,
  ExternalLink,
  Loader2,
  X,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  getActiveTranscriptionsAction,
  cancelTranscriptionAction,
} from "@/app/(workspace)/workspace/[slug]/meetings/[meetingId]/actions";

interface ActiveMeetingJob {
  id: string;
  title: string;
  progressMessage: string | null;
  createdAt: Date | string;
}

interface GlobalTranscriptionDockProps {
  workspaceSlug: string;
}

export function GlobalTranscriptionDock({ workspaceSlug }: GlobalTranscriptionDockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeJobs, setActiveJobs] = useState<ActiveMeetingJob[]>([]);
  const [selectedJobToCancel, setSelectedJobToCancel] = useState<ActiveMeetingJob | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Poll for any active transcription jobs in this workspace
  useEffect(() => {
    let active = true;

    async function fetchJobs() {
      try {
        const jobs = await getActiveTranscriptionsAction(workspaceSlug);
        if (active) {
          setActiveJobs(jobs || []);
        }
      } catch {
        // Silently ignore polling errors
      }
    }

    fetchJobs();
    const interval = setInterval(fetchJobs, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [workspaceSlug, pathname]);

  // Don't show floating dock if the user is already on that exact meeting's processing page
  const visibleJobs = activeJobs.filter(
    (job) => !pathname.includes(`/meetings/${job.id}`)
  );

  if (visibleJobs.length === 0) {
    return null;
  }

  const primaryJob = visibleJobs[0];

  const handleCancelJob = async () => {
    if (!selectedJobToCancel) return;
    setIsCancelling(true);

    try {
      const res = await cancelTranscriptionAction(selectedJobToCancel.id, workspaceSlug);
      if (res.success) {
        toast.success(`Transcription cancelled for "${selectedJobToCancel.title}".`);
        setActiveJobs((prev) => prev.filter((j) => j.id !== selectedJobToCancel.id));
        setSelectedJobToCancel(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to cancel transcription.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel transcription.");
    } finally {
      setIsCancelling(false);
      setSelectedJobToCancel(null);
    }
  };

  return (
    <>
      <aside aria-label="Active transcription progress" className="fixed bottom-5 right-5 z-50 pointer-events-auto">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-80 sm:w-96 rounded-2xl border border-primary/25 bg-card/95 backdrop-blur-md shadow-2xl p-4 space-y-3 relative overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 size-36 rounded-full bg-primary/15 blur-2xl"
            />

            {/* Header Row */}
            <div className="flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex size-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                </span>
                <span className="text-xs font-bold text-foreground tracking-tight truncate">
                  Active Transcription ({visibleJobs.length})
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsMinimized((v) => !v)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  title={isMinimized ? "Expand" : "Minimize"}
                >
                  {isMinimized ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Body */}
            {!isMinimized && (
              <div className="space-y-3 relative z-10">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                    <AudioLines className="size-4 animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-foreground truncate" title={primaryJob.title}>
                      {primaryJob.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {primaryJob.progressMessage || "Processing audio intelligence pipeline..."}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedJobToCancel(primaryJob)}
                    className="h-8 px-3 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs font-bold gap-1.5 cursor-pointer transition-all"
                  >
                    <Ban className="size-3.5" />
                    <span>Cancel Job</span>
                  </Button>

                  <Button
                    size="sm"
                    asChild
                    className="h-8 px-3 rounded-lg text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
                  >
                    <Link href={`/workspace/${workspaceSlug}/meetings/${primaryJob.id}`}>
                      <span>View Live</span>
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </aside>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog
        open={Boolean(selectedJobToCancel)}
        onOpenChange={(open) => {
          if (!open) setSelectedJobToCancel(null);
        }}
      >
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              Cancel transcription?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to cancel the transcription for &quot;{selectedJobToCancel?.title}&quot;? All speech processing will be halted immediately and resources will be released.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling} className="rounded-xl">
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelJob();
              }}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Yes, Cancel Job"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
