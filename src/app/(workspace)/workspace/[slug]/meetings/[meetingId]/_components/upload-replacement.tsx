"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  FileAudio,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CloudUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "motion/react";
import { uploadAudioToGoogleDrive } from "@/lib/gdrive-client-upload";
import { replaceMeetingAudioAction } from "../actions";

interface UploadReplacementProps {
  meetingId: string;
  workspaceSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
];

const MAX_SIZE_MB = 2048;

export function UploadReplacement({
  meetingId,
  workspaceSlug,
  open,
  onOpenChange,
}: UploadReplacementProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<
    "select" | "uploading" | "processing" | "success" | "error"
  >("select");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setProgress(0);
    setPhase("select");
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type) && !selected.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
      setErrorMsg("Unsupported file type. Use MP3, WAV, WebM, OGG, or M4A.");
      return;
    }

    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setErrorMsg(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setFile(selected);
    setErrorMsg(null);
  };

  const handleSubmit = async () => {
    if (!file) return;

    setPhase("uploading");
    setProgress(0);

    try {
      const { audioUrl, duration } = await uploadAudioToGoogleDrive(
        file,
        (pct) => setProgress(pct),
      );

      setPhase("processing");

      const result = await replaceMeetingAudioAction(
        meetingId,
        workspaceSlug,
        audioUrl,
        duration,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to start transcription.");
      }

      setPhase("success");
      setTimeout(() => onOpenChange(false), 1800);
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err.message || "Upload failed. Please try again.");
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (dropped) {
        const fakeEvent = {
          target: { files: [dropped] },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFileSelect(fakeEvent);
      }
    },
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Replace Audio
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a new audio file to re-transcribe
                  </p>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {}
              <div className="px-6 py-5">
                <AnimatePresence mode="wait">
                  {}
                  {phase === "select" && (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        className="group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 cursor-pointer hover:border-foreground/30 hover:bg-muted/50 transition-all"
                      >
                        <div className="flex size-12 items-center justify-center rounded-xl bg-muted group-hover:bg-foreground/5 transition-colors">
                          <CloudUpload className="size-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-foreground">
                            Drop audio file here or{" "}
                            <span className="text-primary underline underline-offset-2">
                              browse
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            MP3, WAV, WebM, OGG, M4A — up to {MAX_SIZE_MB >= 1024 ? `${MAX_SIZE_MB / 1024} GB` : `${MAX_SIZE_MB} MB`}
                          </p>
                        </div>
                      </div>

                      <input
                        ref={inputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      {file && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                        >
                          <FileAudio className="size-5 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / (1024 * 1024)).toFixed(1)} MB
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                            }}
                            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <X className="size-3.5" />
                          </button>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {}
                  {phase === "uploading" && (
                    <motion.div
                      key="uploading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-3">
                        <Loader2 className="size-5 text-primary animate-spin" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Uploading to Google Drive...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file?.name}
                          </p>
                        </div>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">
                        {progress}%
                      </p>
                    </motion.div>
                  )}

                  {}
                  {phase === "processing" && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3"
                    >
                      <Loader2 className="size-5 text-primary animate-spin" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Starting transcription...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This may take a moment
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {}
                  {phase === "success" && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-3"
                    >
                      <CheckCircle2 className="size-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Transcription started!
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Redirecting to processing view...
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {}
                  {phase === "error" && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Upload Failed
                          </p>
                          <p className="text-xs text-destructive mt-1 whitespace-pre-line">
                            {errorMsg}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={reset}
                        className="w-full"
                      >
                        Try Again
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {}
                {phase === "select" && errorMsg && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/5 p-3">
                    <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{errorMsg}</p>
                  </div>
                )}
              </div>

              {}
              {phase === "select" && (
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!file}
                    onClick={handleSubmit}
                    className="gap-2"
                  >
                    <Upload className="size-3.5" />
                    Upload & Transcribe
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
