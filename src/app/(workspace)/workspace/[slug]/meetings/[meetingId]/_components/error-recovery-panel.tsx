"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  RotateCcw,
  Upload,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { retryMeetingAction } from "../actions";

interface ErrorRecoveryPanelProps {
  meetingId: string;
  workspaceSlug: string;
  lastError: string | null;
  retryCount: number;
}

export function ErrorRecoveryPanel({
  meetingId,
  workspaceSlug,
  lastError,
  retryCount,
}: ErrorRecoveryPanelProps) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryResult(null);

    try {
      const result = await retryMeetingAction(meetingId, workspaceSlug);
      setRetryResult(result);

      if (result.success) {
        setTimeout(() => {
          router.refresh();
        }, 1200);
      }
    } catch (err: any) {
      setRetryResult({ success: false, error: err.message });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full max-w-lg mx-auto"
    >
      <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
        {}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-foreground">
                Transcription Failed
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                The audio could not be processed after {retryCount}{" "}
                {retryCount === 1 ? "attempt" : "attempts"}.
              </p>
            </div>
          </div>
        </div>

        {}
        {lastError && (
          <div className="px-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {showDetails ? "Hide" : "Show"} error details
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs font-mono text-muted-foreground leading-relaxed break-all">
                      {lastError}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {}
        <div className="px-6 py-5 space-y-3">
          {}
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full gap-2"
            size="lg"
          >
            {isRetrying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Restarting Transcription...
              </>
            ) : (
              <>
                <RotateCcw className="size-4" />
                Retry Transcription
              </>
            )}
          </Button>

          {}
          <Button
            variant="outline"
            className="w-full gap-2"
            size="lg"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("open-upload-replacement", {
                  detail: { meetingId },
                }),
              );
            }}
          >
            <Upload className="size-4" />
            Upload Different Audio
          </Button>

          {}
          <AnimatePresence>
            {retryResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
                    retryResult.success
                      ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                      : "bg-destructive/5 text-destructive"
                  }`}
                >
                  {retryResult.success ? (
                    <>
                      <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                      <span>
                        Transcription restarted! Redirecting to processing
                        view...
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <span>{retryResult.error}</span>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex items-start gap-2">
            <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Retry will re-submit your audio to Sarvam AI. If the issue
              persists, try uploading a different audio file or contact{" "}
              <a
                href="mailto:support@meetlog.app"
                className="underline hover:text-foreground transition-colors"
              >
                support
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
