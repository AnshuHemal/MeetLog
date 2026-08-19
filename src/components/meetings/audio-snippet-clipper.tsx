"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Scissors, Play, Pause, Copy, Check, Share2, Code,
  Volume2, Sparkles, X, RotateCcw, Sliders
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface AudioSnippetClipperModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string;
  meetingTitle: string;
  initialStartTime: number;
  initialEndTime: number;
  segmentText: string;
  speakerName?: string;
}

import { formatPrecisionTime } from "@/lib/time-utils";

function formatTime(seconds: number): string {
  return formatPrecisionTime(seconds);
}

export function AudioSnippetClipperModal({
  isOpen,
  onClose,
  audioUrl,
  meetingTitle,
  initialStartTime,
  initialEndTime,
  segmentText,
  speakerName = "Speaker",
}: AudioSnippetClipperModalProps) {
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(Math.max(initialEndTime, initialStartTime + 3));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialStartTime);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setStartTime(initialStartTime);
    setEndTime(Math.max(initialEndTime, initialStartTime + 3));
    setCurrentTime(initialStartTime);
  }, [initialStartTime, initialEndTime, isOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.currentTime >= endTime) {
        audio.pause();
        audio.currentTime = startTime;
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [startTime, endTime]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime < startTime || audio.currentTime >= endTime) {
        audio.currentTime = startTime;
      }
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const shareableUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}?t=${Math.floor(startTime)}&clip=true`
    : "";

  const embedCode = `<iframe src="${shareableUrl}" width="100%" height="180" frameborder="0" allow="autoplay"></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  const clipDuration = Math.max(0.5, endTime - startTime).toFixed(1);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden shadow-2xl rounded-2xl">
        
        {}
        <audio ref={audioRef} src={audioUrl} preload="metadata" />

        {}
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
              <Scissors className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                <span>Audio Highlight Clipper</span>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {clipDuration}s Clip
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Trim key meeting quotes and share audio clips with animated captions.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {}
          <div className="w-full h-44 rounded-2xl bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 p-6 flex flex-col justify-between relative overflow-hidden shadow-inner border border-purple-500/20 text-white">
            
            {}
            <div className={`absolute -top-12 -left-12 size-40 rounded-full bg-primary/20 blur-2xl transition-all duration-700 ${isPlaying ? "scale-125 opacity-100" : "opacity-40"}`} />

            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-purple-400 animate-pulse" />
                <span className="text-[11px] font-extrabold tracking-widest uppercase text-purple-300">
                  {meetingTitle}
                </span>
              </div>
              <span className="text-xs font-mono font-bold bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">
                {formatTime(currentTime)} / {formatTime(endTime)}
              </span>
            </div>

            {}
            <div className="z-10 my-auto text-center space-y-1">
              <span className="text-[11px] font-bold text-purple-300/80 uppercase tracking-wider block">
                {speakerName}
              </span>
              <p className="text-base sm:text-lg font-extrabold leading-relaxed line-clamp-3 text-white drop-shadow-md">
                "{segmentText}"
              </p>
            </div>

            {}
            <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden z-10">
              <div
                className="h-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-100"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, ((currentTime - startTime) / (endTime - startTime)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {}
          <div className="space-y-4 border border-border p-4 rounded-xl bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Sliders className="size-4 text-primary" />
                <span>Fine-Tune Clip Range</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono font-bold text-muted-foreground">
                <span>Start: <strong className="text-foreground">{formatTime(startTime)}</strong></span>
                <span>End: <strong className="text-foreground">{formatTime(endTime)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Clip Start (Seconds)</Label>
                <input
                  type="range"
                  min={Math.max(0, initialStartTime - 15)}
                  max={Math.max(0, endTime - 1)}
                  step={0.5}
                  value={startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setStartTime(val);
                    setCurrentTime(val);
                    if (audioRef.current) audioRef.current.currentTime = val;
                  }}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Clip End (Seconds)</Label>
                <input
                  type="range"
                  min={startTime + 1}
                  max={initialEndTime + 15}
                  step={0.5}
                  value={endTime}
                  onChange={(e) => setEndTime(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          {}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            
            <Button
              type="button"
              onClick={togglePlayPause}
              className="h-11 px-6 font-extrabold gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md cursor-pointer"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
              <span>{isPlaying ? "Pause Clip" : "Preview Clip"}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="h-10 text-xs font-bold gap-1.5 cursor-pointer rounded-xl"
              >
                {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Share2 className="size-3.5" />}
                <span>{copiedLink ? "Link Copied!" : "Copy Clip Link"}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyEmbed}
                className="h-10 text-xs font-bold gap-1.5 cursor-pointer rounded-xl"
              >
                {copiedEmbed ? <Check className="size-3.5 text-emerald-500" /> : <Code className="size-3.5" />}
                <span>{copiedEmbed ? "Code Copied!" : "Copy Embed Code"}</span>
              </Button>
            </div>

          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
