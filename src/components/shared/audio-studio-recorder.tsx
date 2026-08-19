"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Pause, Play, RotateCcw, Volume2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioStudioRecorderProps {
  onRecordingComplete: (recordedFile: File, durationSeconds: number) => void;
  disabled?: boolean;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AudioStudioRecorder({
  onRecordingComplete,
  disabled = false,
}: AudioStudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (recordingState === "recording") {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [recordingState]);

  useEffect(() => {
    return () => {
      stopCanvasAnimation();
      cleanupAudioNodes();
    };
  }, []);

  function stopCanvasAnimation() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }

  function cleanupAudioNodes() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  function startCanvasVisualizer(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        animFrameRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) - 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, "rgba(59, 130, 246, 0.4)");
          gradient.addColorStop(0.5, "rgba(147, 51, 234, 0.8)");
          gradient.addColorStop(1, "rgba(236, 72, 153, 1)");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth, Math.max(barHeight, 4), 4);
          ctx.fill();

          x += barWidth + 2;
        }
      };

      draw();
    } catch (err) {
      console.error("Canvas Visualizer Init Error:", err);
    }
  }

  async function startRecording() {
    try {
      setErrorMessage("");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopCanvasAnimation();
        cleanupAudioNodes();

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const nowStr = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([audioBlob], `Studio_Recording_${nowStr}.webm`, { type: "audio/webm" });

        setRecordingState("stopped");
        onRecordingComplete(file, timerSeconds);
      };

      mediaRecorder.start(250);
      setRecordingState("recording");
      setTimerSeconds(0);

      startCanvasVisualizer(stream);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Microphone access was denied by your browser settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setErrorMessage("No microphone hardware device was detected on your system.");
      } else {
        setErrorMessage(err.message || "Could not start microphone recording.");
      }
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current && recordingState === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && (recordingState === "recording" || recordingState === "paused")) {
      mediaRecorderRef.current.stop();
    }
  }

  function resetRecorder() {
    stopCanvasAnimation();
    cleanupAudioNodes();
    setRecordingState("idle");
    setTimerSeconds(0);
    setErrorMessage("");
    audioChunksRef.current = [];
  }

  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-primary/30 rounded-2xl p-8 bg-card/80 shadow-xs space-y-6 relative overflow-hidden">
      
      {}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <div className={`size-3 rounded-full ${recordingState === "recording" ? "bg-red-500 animate-ping" : "bg-muted-foreground"}`} />
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            {recordingState === "idle" && "Studio Voice Recorder"}
            {recordingState === "recording" && "Live Studio Recording"}
            {recordingState === "paused" && "Recording Paused"}
            {recordingState === "stopped" && "Recording Complete"}
          </span>
        </div>

        {}
        <div className="text-xl font-extrabold font-mono text-foreground tracking-widest bg-muted/40 px-3 py-1 rounded-lg border border-border shadow-3xs">
          {formatTimer(timerSeconds)}
        </div>
      </div>

      {}
      <div className="w-full h-36 bg-background/90 border border-border rounded-xl flex items-center justify-center p-2 overflow-hidden relative shadow-inner">
        {recordingState === "idle" && (
          <div className="flex flex-col items-center justify-center text-center space-y-2">
            <Mic className="size-8 text-primary/40 animate-pulse" />
            <p className="text-xs font-semibold text-muted-foreground">
              Click "Start Studio Record" to capture audio directly from your microphone
            </p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          className={`w-full h-full ${recordingState === "idle" ? "hidden" : "block"}`}
        />
      </div>

      {}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-foreground space-y-3 w-full animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive font-bold">
              <AlertCircle className="size-4 shrink-0" />
              <span>Microphone Access Required</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startRecording}
              className="h-7 text-xs font-bold gap-1 cursor-pointer border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="size-3" />
              <span>Try Again</span>
            </Button>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            Your browser blocked microphone access. Follow these 2 quick steps to enable recording:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-medium bg-background/60 p-2.5 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-bold">1</span>
              <span>Click lock/tune icon near URL bar</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-bold">2</span>
              <span>Set Microphone to <strong>Allow</strong> & click Try Again</span>
            </div>
          </div>
        </div>
      )}

      {}
      <div className="flex items-center gap-4">
        {recordingState === "idle" && (
          <Button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="h-11 px-6 font-extrabold gap-2 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-md cursor-pointer"
          >
            <Mic className="size-4 animate-pulse" />
            <span>Start Studio Record</span>
          </Button>
        )}

        {recordingState === "recording" && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={pauseRecording}
              className="h-10 px-4 font-bold gap-1.5 cursor-pointer"
            >
              <Pause className="size-4" />
              <span>Pause</span>
            </Button>

            <Button
              type="button"
              onClick={stopRecording}
              className="h-10 px-5 font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
            >
              <Square className="size-4" />
              <span>Stop & Process</span>
            </Button>
          </>
        )}

        {recordingState === "paused" && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={resumeRecording}
              className="h-10 px-4 font-bold gap-1.5 cursor-pointer"
            >
              <Play className="size-4" />
              <span>Resume</span>
            </Button>

            <Button
              type="button"
              onClick={stopRecording}
              className="h-10 px-5 font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
            >
              <Square className="size-4" />
              <span>Stop & Process</span>
            </Button>
          </>
        )}

        {recordingState === "stopped" && (
          <Button
            type="button"
            variant="outline"
            onClick={resetRecorder}
            className="h-10 px-4 font-bold gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-4" />
            <span>Record Again</span>
          </Button>
        )}
      </div>

    </div>
  );
}
