"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  UploadCloud,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mic,
  Sparkles,
  Globe,
  Cpu,
  ExternalLink,
  Video,
  Film,
} from "lucide-react";
import { motion } from "motion/react";

import { WorkspaceTopbar } from "../_components/workspace-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createMeetingAction } from "./actions";
import { FadeIn } from "@/components/motion/fade-in";
import { uploadAudioToGoogleDrive, DriveAuthRequiredError } from "@/lib/gdrive-client-upload";
import { AudioStudioRecorder } from "@/components/shared/audio-studio-recorder";
import {
  PipelineTerminal,
  TerminalLogEntry,
  formatTerminalTimestamp,
} from "@/components/shared/pipeline-terminal";

export default function UploadMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [activeTab, setActiveTab] = useState<"upload" | "studio">("upload");
  const [provider, setProvider] = useState<"GEMINI" | "SARVAM">("GEMINI");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [numSpeakers, setNumSpeakers] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "submitting" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-app Google Drive OAuth state
  const [isGdriveAuthRequired, setIsGdriveAuthRequired] = useState(false);
  const [isAuthorizingGdrive, setIsAuthorizingGdrive] = useState(false);
  const [gdriveAuthUrl, setGdriveAuthUrl] = useState("/api/auth/gdrive/auth");

  const isVideoFile = (f: File | null) => {
    if (!f) return false;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    return (
      f.type.startsWith("video/") ||
      ["mp4", "webm", "mov", "mkv", "avi", "flv", "m4v", "wmv", "3gp", "ts"].includes(ext)
    );
  };

  const addLog = (
    level: TerminalLogEntry["level"],
    category: string,
    message: string
  ) => {
    setTerminalLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatTerminalTimestamp(),
        level,
        category,
        message,
      },
    ]);
  };

  useEffect(() => {
    setIsHydrated(true);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "GDRIVE_AUTH_SUCCESS") {
        setIsGdriveAuthRequired(false);
        setIsAuthorizingGdrive(false);
        setErrorMessage("");
        addLog("success", "auth", "Google Drive authorized successfully! Ready to resume upload.");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleOpenGdriveAuth = () => {
    setIsAuthorizingGdrive(true);
    addLog("info", "oauth", "Opening Google OAuth authorization window...");
    const width = 560;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      gdriveAuthUrl,
      "gdrive_auth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,location=no`
    );

    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setIsAuthorizingGdrive(false);
        fetch("/api/auth/gdrive/status")
          .then((r) => r.json())
          .then((d) => {
            if (d.isAuthorized) {
              setIsGdriveAuthRequired(false);
              setErrorMessage("");
              addLog("success", "oauth", `Google Drive connected (${d.email || "Active"}).`);
            }
          })
          .catch(() => {});
      }
    }, 1000);
  };

  const isBusy =
    uploadState === "uploading" ||
    uploadState === "submitting" ||
    uploadState === "success";

  const canSubmit =
    isHydrated && Boolean(file) && title.trim().length > 0 && !isBusy;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleStudioRecordingComplete = (recordedFile: File) => {
    setFile(recordedFile);
    if (!title) {
      setTitle(recordedFile.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage("Please select an audio file or record audio first.");
      return;
    }
    if (!title.trim()) {
      setErrorMessage("Please enter a title.");
      return;
    }

    try {
      setShowTerminal(true);
      setErrorMessage("");
      setUploadState("uploading");
      setProgress(0);
      setTerminalLogs([]);

      const isVideo = isVideoFile(file);
      addLog("info", "pipeline", `Starting pipeline execution for "${title}"`);
      if (isVideo) {
        addLog(
          "storage",
          "video",
          `Initializing 2MB resumable upload for ${(file.size / (1024 * 1024)).toFixed(1)}MB video file (${file.name.split(".").pop()?.toUpperCase()})...`
        );
        addLog("info", "pipeline", "Speech audio will be automatically extracted on the server via FFmpeg.");
      } else {
        addLog(
          "storage",
          "upload",
          `Initializing 2MB resumable upload for ${(file.size / (1024 * 1024)).toFixed(1)}MB audio file...`
        );
      }

      let lastReportedPercent = -1;
      const { audioUrl, duration } = await uploadAudioToGoogleDrive(file, (percent) => {
        setProgress(percent);
        if (percent !== lastReportedPercent && (percent % 20 === 0 || percent === 100)) {
          lastReportedPercent = percent;
          addLog("storage", "chunk", `Cloud transfer progress: ${percent}% completed`);
        }
      });

      if (!audioUrl) {
        throw new Error("Upload failed: no audio URL was returned.");
      }

      addLog("success", "storage", "Audio file successfully stored in cloud storage!");
      addLog("ai", "transcribe", `Submitting meeting to ${provider === "GEMINI" ? "Google Gemini 3.5 Transcribe" : "Sarvam AI"} cluster...`);

      setUploadState("submitting");
      const result = await createMeetingAction({
        workspaceSlug: slug,
        title,
        description: description || undefined,
        audioUrl,
        durationSeconds: duration || 0,
        languageCode: "unknown",
        numSpeakers: numSpeakers ? parseInt(numSpeakers, 10) : undefined,
        provider,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to initialize meeting.");
      }

      addLog("success", "pipeline", "Meeting registered in database! Redirecting to live intelligence monitor...");
      setUploadState("success");

      setTimeout(() => {
        if (result?.meetingId) {
          router.push(`/workspace/${slug}/meetings/${result.meetingId}`);
        } else {
          router.push(`/workspace/${slug}`);
        }
      }, 800);

    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadState("error");
      addLog("error", "error", error?.message || "Something went wrong during upload pipeline.");

      if (error?.requiresAuth || error instanceof DriveAuthRequiredError) {
        setIsGdriveAuthRequired(true);
        if (error.authUrl) setGdriveAuthUrl(error.authUrl);
        setErrorMessage("Google Drive authorization is required. Please connect your Google account below with 1-click.");
      } else {
        setErrorMessage(error?.message || "Something went wrong.");
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <WorkspaceTopbar
        workspaceName="Workspace"
        workspaceSlug={slug}
        pageTitle="Upload Meeting"
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full mx-auto space-y-6">
        <FadeIn direction="down" className="mb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Meeting Intelligence Studio</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload existing audio files or record live in-browser using our Studio Audio Spectrum Visualizer.
              </p>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl border border-border bg-muted/40 shrink-0 self-start md:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "upload"
                    ? "bg-card text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UploadCloud className="size-3.5 text-primary" />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("studio")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "studio"
                    ? "bg-card text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mic className="size-3.5 text-red-500 animate-pulse" />
                <span>Live Studio Record</span>
              </button>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-xs">

            {/* ─── Top 2-Column Section (Audio + Details) ───────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Audio / Video Input */}
              <div className="space-y-2 flex flex-col h-full">
                <Label className="text-sm font-semibold">
                  {activeTab === "upload" ? "Audio or Video Recording File" : "Studio Audio Input"}
                </Label>

                {activeTab === "upload" ? (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all min-h-[230px] ${
                      file
                        ? isVideoFile(file)
                          ? "border-purple-500/50 bg-purple-500/5"
                          : "border-primary/50 bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="audio/*,video/*,.mp4,.m4a,.webm,.mov,.mkv,.avi,.flv,.m4v,.wmv,.3gp"
                      className="hidden"
                      disabled={isBusy}
                    />

                    {file ? (
                      <div className="flex flex-col items-center text-center gap-3 w-full max-w-xs">
                        <div
                          className={`flex size-14 items-center justify-center rounded-xl relative transition-all ${
                            isVideoFile(file)
                              ? "bg-purple-500/15 text-purple-500 border border-purple-500/30 shadow-[0_0_24px_rgba(168,85,247,0.2)]"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {isVideoFile(file) ? <Video className="size-7" /> : <FileAudio className="size-7" />}
                          {file.size > 20 * 1024 * 1024 && (
                            <span
                              className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white shadow-xs"
                              title="Large Recording Detected"
                            >
                              ⚡
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1 w-full">
                          <p className="text-sm font-semibold truncate text-foreground">{file.name}</p>
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                            <span>•</span>
                            <span
                              className={
                                isVideoFile(file)
                                  ? "text-purple-600 dark:text-purple-400 font-semibold"
                                  : "text-emerald-600 dark:text-emerald-400 font-semibold"
                              }
                            >
                              {isVideoFile(file) ? "Video Container" : "Audio Recording"}
                            </span>
                          </div>
                        </div>

                        {isVideoFile(file) ? (
                          <div className="w-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 p-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-2xs">
                            <Film className="size-3.5 text-purple-500 shrink-0" />
                            <span>Speech audio auto-extracted on server</span>
                          </div>
                        ) : (
                          file.size > 20 * 1024 * 1024 && (
                            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-2xs">
                              <span className="size-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                              <span>Long Audio Streamer Verified (Up to 6 Hours)</span>
                            </div>
                          )
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs rounded-lg mt-1 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                            setTitle("");
                          }}
                          disabled={isBusy}
                        >
                          Change File
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 shadow-inner">
                          <UploadCloud className="size-6 text-primary animate-bounce" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          Drag &amp; drop audio or video here, or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                          Supports MP4, WEBM, M4A, MOV, MKV, MP3, WAV (Up to 2GB / 6 Hours)
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
                          {["MP4", "WEBM", "M4A", "MP3", "WAV", "MOV", "MKV"].map((fmt) => (
                            <span
                              key={fmt}
                              className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground border border-border/60"
                            >
                              {fmt}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-bold text-primary">
                          <span>⚡ Video-to-Audio Auto Extraction &amp; Chunking Enabled</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <AudioStudioRecorder
                    onRecordingComplete={handleStudioRecordingComplete}
                    disabled={isBusy}
                  />
                )}
              </div>

              {/* Right Column: Meeting Info Inputs */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold">Meeting Title</Label>
                  <Input
                    id="title"
                    placeholder="E.g., Q3 Planning & Product Sync"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={isBusy}
                    className="bg-card text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-semibold">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide context or summary details..."
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isBusy}
                    className="bg-card text-sm resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="speakers" className="text-sm font-semibold">Expected Speakers (Optional)</Label>
                  <Input
                    id="speakers"
                    type="number"
                    placeholder="Auto-detect number of speakers in the recording"
                    min={1}
                    max={20}
                    value={numSpeakers}
                    onChange={(e) => setNumSpeakers(e.target.value)}
                    disabled={isBusy}
                    className="bg-card text-sm"
                  />
                </div>
              </div>

            </div>

            {/* ─── AI Transcription Engine Selection ────────────────────────── */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Cpu className="size-4 text-primary" />
                  <span>AI Transcription & Diarization Engine</span>
                </Label>
                <span className="text-xs text-muted-foreground">Select processing pipeline</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Option 1: Gemini 3.5 Transcribe (Recommended) */}
                <motion.div
                  whileHover={{ scale: isBusy ? 1 : 1.01 }}
                  whileTap={{ scale: isBusy ? 1 : 0.99 }}
                  onClick={() => !isBusy && setProvider("GEMINI")}
                  className={`relative flex flex-col p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
                    provider === "GEMINI"
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/5 dark:shadow-primary/10"
                      : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-foreground">Google Gemini 3.5</h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/15 text-primary border border-primary/20">
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Multimodal Audio Intelligence</p>
                      </div>
                    </div>
                    <div className={`size-4 rounded-full border flex items-center justify-center transition-colors ${
                      provider === "GEMINI" ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {provider === "GEMINI" && <div className="size-1.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                    High-speed transcription with smart disfluency cleaning (filters filler words), 85+ global languages, and millisecond speaker diarization.
                  </p>
                </motion.div>

                {/* Option 2: Sarvam AI */}
                <motion.div
                  whileHover={{ scale: isBusy ? 1 : 1.01 }}
                  whileTap={{ scale: isBusy ? 1 : 0.99 }}
                  onClick={() => !isBusy && setProvider("SARVAM")}
                  className={`relative flex flex-col p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
                    provider === "SARVAM"
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/5 dark:shadow-primary/10"
                      : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        <Globe className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-foreground">Sarvam AI</h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/20">
                            Indic Dialects
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Saaras:v3 Speech Engine</p>
                      </div>
                    </div>
                    <div className={`size-4 rounded-full border flex items-center justify-center transition-colors ${
                      provider === "SARVAM" ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {provider === "SARVAM" && <div className="size-1.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                    Specialized speech-to-text with diarization tailored for Indian vernacular languages and regional accented dialogues.
                  </p>
                </motion.div>
              </div>
            </div>

            {/* ─── Upload State & Feedback ──────────────────────────────────── */}
            {uploadState !== "idle" && (
              <div className="border border-border rounded-lg p-4 bg-muted/40 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {uploadState === "uploading" && "Uploading file to cloud storage..."}
                    {uploadState === "submitting" && (
                      provider === "GEMINI"
                        ? "Initializing Google Gemini 3.5 pipeline..."
                        : "Submitting transcription job to Sarvam AI..."
                    )}
                    {uploadState === "success" && "Meeting registered successfully!"}
                    {uploadState === "error" && "An error occurred"}
                  </span>
                  {uploadState === "uploading" && (
                    <span className="text-muted-foreground font-mono font-bold">{progress}%</span>
                  )}
                </div>

                {uploadState === "uploading" && (
                  <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-emerald-500 h-full transition-all duration-300 shadow-xs"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {uploadState === "submitting" && (
                  <div className="flex items-center text-sm text-muted-foreground gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>
                      {provider === "GEMINI"
                        ? "Registering meeting in intelligence pipeline..."
                        : "Communicating with Sarvam AI cluster... Please do not close this window."}
                    </span>
                  </div>
                )}

                {uploadState === "success" && (
                  <div className="flex items-center text-sm text-green-600 dark:text-green-400 gap-2">
                    <CheckCircle2 className="size-4" />
                    <span>Redirecting to your live dashboard monitor...</span>
                  </div>
                )}

                {uploadState === "error" && (
                  <div className="flex flex-col gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start text-sm text-destructive gap-2">
                      <AlertCircle className="size-5 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-line text-xs font-medium leading-relaxed">{errorMessage}</span>
                    </div>

                    {isGdriveAuthRequired && (
                      <Button
                        type="button"
                        onClick={handleOpenGdriveAuth}
                        disabled={isAuthorizingGdrive}
                        size="sm"
                        className="bg-primary text-primary-foreground text-xs font-bold gap-2 self-start mt-1"
                      >
                        {isAuthorizingGdrive ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
                        {isAuthorizingGdrive ? "Authorizing in popup..." : "Connect Google Drive (1-Click)"}
                      </Button>
                    )}
                  </div>
                )}

                {/* ─── Real-Time Live Pipeline Terminal ────────────────────── */}
                {showTerminal && (
                  <div className="pt-2">
                    <PipelineTerminal
                      logs={terminalLogs}
                      title="Live Cloud Execution Stream"
                      engineName={provider === "GEMINI" ? "Gemini 3.5" : "Sarvam Saaras"}
                      isLive={uploadState !== "error" && uploadState !== "success"}
                      maxHeight="220px"
                      onClear={() => setTerminalLogs([])}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push(`/workspace/${slug}`)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
              >
                {uploadState === "uploading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" /> Uploading ({progress}%)
                  </>
                ) : uploadState === "submitting" ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" /> Initializing AI...
                  </>
                ) : (
                  "Upload & Process"
                )}
              </Button>
            </div>

          </form>
        </FadeIn>
      </main>
    </div>
  );
}