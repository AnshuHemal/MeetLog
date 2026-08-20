"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, ChevronLeft, Volume2, Volume1, VolumeX, Search, Edit2, Check, User, ListTodo, FileText, PieChart, Loader2, RotateCcw, RotateCw, Compass, Mail, Copy, Share, Globe, Lock, Send, Bot, Highlighter, MessageSquare, Trash2, Sparkles, Scissors, Download } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { renameSpeakerAction, editSegmentAction, toggleActionItemAction, draftMeetingEmailAction, toggleMeetingPublicAction, askMeetingAIAction, updateSegmentAnnotationAction, analyzeMeetingSentimentAction, pingUserPresenceAction, syncMeetingDurationAction } from "../actions";
import { exportToSlackAction, exportToJiraAction, exportToLinearAction } from "../export-actions";
import { AudioSnippetClipperModal } from "@/components/meetings/audio-snippet-clipper";
import { MeetingExportModal } from "@/components/meetings/meeting-export-modal";
import { ModernWaveformVisualizer } from "@/components/meetings/modern-waveform-visualizer";
import { VolumeControl, VolumeControlHandle } from "@/components/meetings/volume-control";
import { formatSecondsToTime, formatDurationHuman } from "@/lib/time-utils";
import ReactMarkdown from "react-markdown";

interface Segment {
  id: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
  index: number;
  highlightColor?: string | null;
  noteText?: string | null;
  sentiment?: string | null;
  isEdited?: boolean | null;
}

function getOptimizedAudioUrl(url: string, shareToken?: string | null): string {
  if (!url) return "";

  if (url.includes("drive.google.com")) {
    let fileId = "";
    try {
      const urlObj = new URL(url);
      fileId = urlObj.searchParams.get("id") || "";
    } catch (e) {}

    if (!fileId) {
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match) fileId = match[1];
    }

    if (fileId) {
      const tokenQuery = shareToken ? `&shareToken=${shareToken}` : "";
      return `/api/audio/gdrive?fileId=${fileId}${tokenQuery}`;
    }
  }

  return url;
}

interface SpeakerPalette {
  bg: string;
  text: string;
  border: string;
  rawHex: string;
}

const SPEAKER_PALETTES: SpeakerPalette[] = [
  { bg: "rgba(56, 189, 248, 0.16)", text: "#38bdf8", border: "rgba(56, 189, 248, 0.4)", rawHex: "#38bdf8" },
  { bg: "rgba(129, 140, 248, 0.16)", text: "#818cf8", border: "rgba(129, 140, 248, 0.4)", rawHex: "#818cf8" },
  { bg: "rgba(168, 85, 247, 0.16)", text: "#a855f7", border: "rgba(168, 85, 247, 0.4)", rawHex: "#a855f7" },
  { bg: "rgba(52, 211, 153, 0.16)", text: "#34d399", border: "rgba(52, 211, 153, 0.4)", rawHex: "#34d399" },
  { bg: "rgba(251, 191, 36, 0.16)", text: "#fbbf24", border: "rgba(251, 191, 36, 0.4)", rawHex: "#fbbf24" },
  { bg: "rgba(251, 113, 133, 0.16)", text: "#fb7185", border: "rgba(251, 113, 133, 0.4)", rawHex: "#fb7185" },
  { bg: "rgba(45, 212, 191, 0.16)", text: "#2dd4bf", border: "rgba(45, 212, 191, 0.4)", rawHex: "#2dd4bf" },
  { bg: "rgba(244, 114, 182, 0.16)", text: "#f472b6", border: "rgba(244, 114, 182, 0.4)", rawHex: "#f472b6" },
];

function getSpeakerColor(speakerId: string): SpeakerPalette {
  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = speakerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % SPEAKER_PALETTES.length;
  return SPEAKER_PALETTES[idx];
}

function getInitials(name: string): string {
  if (!name) return "SP";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function highlightMatchedText(text: string, query: string) {
  if (!query || query.trim().length < 2) return text;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length <= 1) return text;
  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark key={index} className="bg-primary/25 text-primary font-semibold px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

interface ActionItem {
  id: string;
  taskDescription: string;
  assigneeName: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
}

interface MeetingViewerClientProps {
  meeting: {
    id: string;
    title: string;
    description: string | null;
    audioUrl: string;
    durationSeconds: number;
    status: string;
    summaryMarkdown: string | null;
    chaptersJson?: string | null;
    isPublic?: boolean;
    shareToken?: string | null;
  };
  segments: Segment[];
  speakerMap: Record<string, string>;
  actionItems: ActionItem[];
  workspaceSlug: string;
  isReadOnly?: boolean;
}

export function MeetingViewerClient({
  meeting,
  segments: initialSegments,
  speakerMap: initialSpeakerMap,
  actionItems: initialActionItems,
  workspaceSlug,
  isReadOnly = false,
}: MeetingViewerClientProps) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>(initialSpeakerMap);
  const [actionItems, setActionItems] = useState<ActionItem[]>(initialActionItems);
  
  const [searchInputValue, setSearchInputValue] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const trimmed = searchInputValue.trim();

    if (trimmed.length < 2) {
      setIsSearching(false);
      setDebouncedSearchQuery("");
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(() => {
      React.startTransition(() => {
        setDebouncedSearchQuery(trimmed);
        setIsSearching(false);
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInputValue]);

  const [clipperState, setClipperState] = useState<{
    isOpen: boolean;
    startTime: number;
    endTime: number;
    text: string;
    speakerName: string;
  }>({
    isOpen: false,
    startTime: 0,
    endTime: 0,
    text: "",
    speakerName: "",
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const chapters = useMemo(() => {
    if (!meeting.chaptersJson) return [];
    try {
      return JSON.parse(meeting.chaptersJson) as Array<{
        startTime: number;
        endTime: number;
        title: string;
        summary: string;
      }>;
    } catch (e) {
      console.error("Failed to parse chapters JSON", e);
      return [];
    }
  }, [meeting.chaptersJson]);

  const [isDraftingEmail, setIsDraftingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);

  const [isSlackExporting, setIsSlackExporting] = useState(false);
  const [isJiraExporting, setIsJiraExporting] = useState(false);
  const [isLinearExporting, setIsLinearExporting] = useState(false);
  const [exportToast, setExportToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const triggerExportToast = (type: "success" | "error", message: string) => {
    setExportToast({ type, message });
    setTimeout(() => setExportToast(null), 4000);
  };

  const handleSlackExport = async () => {
    setIsSlackExporting(true);
    try {
      const res = await exportToSlackAction(meeting.id, workspaceSlug);
      if (res.success) {
        triggerExportToast("success", "Successfully posted meeting summary and action items to Slack!");
      } else {
        triggerExportToast("error", res.error || "Failed to export to Slack.");
      }
    } catch (e: any) {
      triggerExportToast("error", e.message || "An unexpected error occurred.");
    } finally {
      setIsSlackExporting(false);
    }
  };

  const handleJiraExport = async () => {
    setIsJiraExporting(true);
    try {
      const res = await exportToJiraAction(meeting.id, workspaceSlug);
      if (res.success) {
        triggerExportToast("success", `Successfully created ${res.created?.length || 0} issues in Jira!`);
      } else {
        triggerExportToast("error", res.error || "Failed to export to Jira.");
      }
    } catch (e: any) {
      triggerExportToast("error", e.message || "An unexpected error occurred.");
    } finally {
      setIsJiraExporting(false);
    }
  };

  const handleLinearExport = async () => {
    setIsLinearExporting(true);
    try {
      const res = await exportToLinearAction(meeting.id, workspaceSlug);
      if (res.success) {
        triggerExportToast("success", `Successfully created issues in Linear!`);
      } else {
        triggerExportToast("error", res.error || "Failed to export to Linear.");
      }
    } catch (e: any) {
      triggerExportToast("error", e.message || "An unexpected error occurred.");
    } finally {
      setIsLinearExporting(false);
    }
  };

  const [isPublic, setIsPublic] = useState(meeting.isPublic || false);
  const [shareToken, setShareToken] = useState(meeting.shareToken || null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    { sender: "ai", text: "Hello! I am MeetLog AI. Ask me any question about this meeting, and I will search the transcript for answers." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await askMeetingAIAction(
        meeting.id,
        userText,
        workspaceSlug
      );
      if (response.success && response.answer) {
        setChatMessages((prev) => [...prev, { sender: "ai", text: response.answer }]);
      } else {
        setChatMessages((prev) => [...prev, { sender: "ai", text: "I'm sorry, I encountered an issue retrieving the answer. Please try again." }]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [...prev, { sender: "ai", text: "An error occurred while communicating with Gemini." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleToggleShare = async () => {
    const nextPublic = !isPublic;
    setIsPublic(nextPublic);
    try {
      const response = await toggleMeetingPublicAction(
        meeting.id,
        nextPublic,
        workspaceSlug
      );
      if (response.success) {
        setShareToken(response.shareToken);
      } else {
        setIsPublic(!nextPublic);
      }
    } catch (e) {
      console.error(e);
      setIsPublic(!nextPublic);
    }
  };

  const [activeUsers, setActiveUsers] = useState<Array<{ id: string; name: string; image: string | null; email: string }>>([]);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);

  useEffect(() => {
    if (isReadOnly) return;

    const fetchPresence = async () => {
      try {
        const res = await pingUserPresenceAction(meeting.id, workspaceSlug);
        if (res.success && res.activeUsers) {
          setActiveUsers(res.activeUsers);
        }
      } catch (err) {
        console.error("Presence sync failed", err);
      }
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, [meeting.id, workspaceSlug, isReadOnly]);

  const getShareLink = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/share/${shareToken}`;
  };

  const handleCopyShareLink = () => {
    const link = getShareLink();
    navigator.clipboard.writeText(link);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  const handleDraftEmail = async () => {
    setDraftLoading(true);
    setIsDraftingEmail(true);
    setEmailDraft("");
    try {
      const response = await draftMeetingEmailAction(
        meeting.id,
        meeting.title,
        meeting.summaryMarkdown || "",
        workspaceSlug
      );
      if (response.success && response.emailDraft) {
        setEmailDraft(response.emailDraft);
      } else {
        setEmailDraft("Failed to generate email draft. Please verify your API keys.");
      }
    } catch (e) {
      console.error(e);
      setEmailDraft("An unexpected error occurred while generating the email draft.");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailDraft);
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  const audioRef = useRef<HTMLAudioElement>(null);
  const volumeControlRef = useRef<VolumeControlHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const maxSegmentDuration = useMemo(() => {
    return segments.reduce((max, s) => Math.max(max, s.endTime || 0), 0);
  }, [segments]);

  const initialDuration = useMemo(() => {
    if (maxSegmentDuration > 0) return maxSegmentDuration;
    return meeting.durationSeconds || 0;
  }, [maxSegmentDuration, meeting.durationSeconds]);

  const [audioDuration, setAudioDuration] = useState(initialDuration);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timeParam = params.get("t");
    if (timeParam) {
      const seconds = parseFloat(timeParam);
      if (!isNaN(seconds)) {
        const timer = setTimeout(() => {
          seekTo(seconds);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingSpeakerName, setEditingSpeakerName] = useState("");

  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState("");

  const originalTextMap = useRef<Record<string, string>>(
    initialSegments.reduce((acc, seg) => {
      acc[seg.id] = seg.text.trim();
      return acc;
    }, {} as Record<string, string>)
  );

  const [editingNoteSegmentId, setEditingNoteSegmentId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const tabsListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = tabsListRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleSaveHighlight = async (segmentId: string, color: string | null) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === segmentId ? { ...seg, highlightColor: color } : seg))
    );
    const segment = segments.find(s => s.id === segmentId);
    const currentNote = segment?.noteText || null;
    try {
      await updateSegmentAnnotationAction(segmentId, meeting.id, color, currentNote, workspaceSlug);
    } catch (e) {
      console.error("Highlight save failed", e);
    }
  };

  const handleSaveNote = async (segmentId: string) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === segmentId ? { ...seg, noteText: editingNoteText.trim() || null } : seg))
    );
    const segment = segments.find(s => s.id === segmentId);
    const currentHighlight = segment?.highlightColor || null;
    setEditingNoteSegmentId(null);
    try {
      await updateSegmentAnnotationAction(
        segmentId,
        meeting.id,
        currentHighlight,
        editingNoteText.trim() || null,
        workspaceSlug
      );
    } catch (e) {
      console.error("Note save failed", e);
    }
  };

  const handleDeleteNote = async (segmentId: string) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === segmentId ? { ...seg, noteText: null } : seg))
    );
    const segment = segments.find(s => s.id === segmentId);
    const currentHighlight = segment?.highlightColor || null;
    try {
      await updateSegmentAnnotationAction(segmentId, meeting.id, currentHighlight, null, workspaceSlug);
    } catch (e) {
      console.error("Note delete failed", e);
    }
  };

  const [isSentimentLoading, setIsSentimentLoading] = useState(false);
  const [sentimentDone, setSentimentDone] = useState(
    () => segments.some((s) => s.sentiment != null)
  );

  const handleAnalyzeSentiment = async () => {
    if (isSentimentLoading) return;
    setIsSentimentLoading(true);
    try {
      const result = await analyzeMeetingSentimentAction(meeting.id, workspaceSlug);
      if (result.success) {
        window.location.reload();
      }
    } catch (e) {
      console.error("Sentiment analysis failed", e);
    } finally {
      setIsSentimentLoading(false);
      setSentimentDone(true);
    }
  };

  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const activeSegmentIndex = useMemo(() => {
    return segments.findIndex(
      (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
  }, [segments, currentTime]);

  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>([]);

  const allSpeakers = useMemo(() => {
    const uniqueIds = Array.from(new Set(segments.map(s => s.speakerId)));
    return uniqueIds.map(id => ({
      id,
      name: speakerMap[id] || id,
      colors: getSpeakerColor(id)
    }));
  }, [segments, speakerMap]);

  const waveformBars = useMemo(() => {
    const numBars = 120;
    const effectiveDuration = audioDuration || maxSegmentDuration || meeting.durationSeconds || 1;
    const interval = effectiveDuration / numBars;

    const bars = [];
    for (let i = 0; i < numBars; i++) {
      const barStart = i * interval;
      const barEnd = barStart + interval;

      const overlappingSeg = segments.find(
        (seg) =>
          (seg.startTime >= barStart && seg.startTime < barEnd) ||
          (seg.endTime > barStart && seg.endTime <= barEnd) ||
          (seg.startTime <= barStart && seg.endTime >= barEnd)
      );

      if (overlappingSeg) {
        const charSum = overlappingSeg.speakerId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const pseudoWave = Math.sin(i * 0.45) * 16 + Math.cos(i * 0.8) * 10;
        const baseHeight = 46 + ((charSum * 11 + i * 17) % 36);
        const clampedHeight = Math.max(30, Math.min(100, Math.round(baseHeight + pseudoWave)));
        bars.push({ height: clampedHeight, isSilent: false });
      } else {
        const ambientHeight = 20 + ((i * 7) % 6);
        bars.push({ height: ambientHeight, isSilent: true });
      }
    }
    return bars;
  }, [segments, audioDuration, maxSegmentDuration, meeting.durationSeconds]);

  const speakerAnalytics = useMemo(() => {
    const uniqueIds = Array.from(new Set(segments.map((s) => s.speakerId)));
    const totalDuration = segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0) || 1;

    return uniqueIds.map((id) => {
      const speakerSegs = segments.filter((s) => s.speakerId === id);
      const duration = speakerSegs.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
      const percentage = Math.round((duration / totalDuration) * 100);
      const wordCount = speakerSegs.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
      const segCount = speakerSegs.length;

      const positive = speakerSegs.filter((s) => s.sentiment === "positive").length;
      const negative = speakerSegs.filter((s) => s.sentiment === "negative").length;
      const neutral = speakerSegs.filter((s) => s.sentiment === "neutral").length;
      const sentimentTotal = positive + negative + neutral || 1;

      return {
        speakerId: id,
        name: speakerMap[id] || id,
        colors: getSpeakerColor(id),
        duration,
        percentage,
        wordCount,
        segCount,
        sentiment: {
          positive: Math.round((positive / sentimentTotal) * 100),
          negative: Math.round((negative / sentimentTotal) * 100),
          neutral: Math.round((neutral / sentimentTotal) * 100),
          raw: { positive, negative, neutral },
        },
      };
    });
  }, [segments, speakerMap]);

  const meetingPulse = useMemo(() => {
    const withSentiment = segments.filter((s) => s.sentiment);
    if (withSentiment.length === 0) return null;
    const pos = withSentiment.filter((s) => s.sentiment === "positive").length;
    const neg = withSentiment.filter((s) => s.sentiment === "negative").length;
    const ratio = pos / (pos + neg + 1);
    if (ratio > 0.6) return { label: "Highly Productive", color: "emerald", icon: "🚀" };
    if (ratio > 0.4) return { label: "Well Balanced", color: "sky", icon: "⚖️" };
    return { label: "Needs Attention", color: "rose", icon: "⚠️" };
  }, [segments]);

  const filteredSegments = useMemo(() => {
    const seen = new Set<string>();
    const query = debouncedSearchQuery.toLowerCase().trim();

    return segments.filter((seg) => {
      const key = `${seg.speakerId}_${Math.floor(seg.startTime)}_${seg.text.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);

      const matchesSearch = query.length >= 2
        ? seg.text.toLowerCase().includes(query) ||
          (speakerMap[seg.speakerId] || seg.speakerId)
            .toLowerCase()
            .includes(query)
        : true;
      
      const matchesSpeaker = selectedSpeakers.length === 0 || selectedSpeakers.includes(seg.speakerId);
      
      return matchesSearch && matchesSpeaker;
    });
  }, [segments, debouncedSearchQuery, speakerMap, selectedSpeakers]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const browserDuration = audioRef.current.duration;
      if (browserDuration && !isNaN(browserDuration) && browserDuration !== Infinity && browserDuration > 0) {
        setAudioDuration(browserDuration);
        if (Math.abs((meeting.durationSeconds || 0) - browserDuration) > 15 && !isReadOnly) {
          syncMeetingDurationAction(meeting.id, browserDuration, workspaceSlug).catch(console.error);
        }
      } else if (maxSegmentDuration > 0) {
        setAudioDuration(maxSegmentDuration);
      } else if (meeting.durationSeconds && meeting.durationSeconds > 0) {
        setAudioDuration(meeting.durationSeconds);
      }
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const seekToAndPlay = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      if (audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
      }
    }
  };

  const skipBackward = () => {
    if (audioRef.current) {
      const target = Math.max(0, audioRef.current.currentTime - 10);
      audioRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const skipForward = () => {
    if (audioRef.current) {
      const target = Math.min(audioDuration, audioRef.current.currentTime + 10);
      audioRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seekTo(time);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
         activeEl.tagName === "TEXTAREA" ||
         activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          skipForward();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (audioRef.current) {
            const next = Math.min(1, audioRef.current.volume + 0.05);
            volumeControlRef.current?.setVolumeLevel(next);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (audioRef.current) {
            const next = Math.max(0, audioRef.current.volume - 0.05);
            volumeControlRef.current?.setVolumeLevel(next);
          }
          break;
        case "KeyM":
          e.preventDefault();
          volumeControlRef.current?.toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [audioDuration]);

  useEffect(() => {
    if (!autoScroll || activeSegmentIndex === -1) return;

    const activeSeg = segments[activeSegmentIndex];
    if (!activeSeg) return;

    const element = document.getElementById(`segment-${activeSeg.id}`);
    const container = transcriptContainerRef.current;

    if (element && container) {
      const containerTop = container.getBoundingClientRect().top;
      const elementTop = element.getBoundingClientRect().top;
      const relativeTop = elementTop - containerTop + container.scrollTop;

      container.scrollTo({
        top: relativeTop - 12,
        behavior: "smooth",
      });
    }
  }, [activeSegmentIndex, autoScroll, segments]);

  const handleRenameSpeaker = async (speakerId: string) => {
    if (!editingSpeakerName.trim()) return;
    
    setSpeakerMap((prev) => ({ ...prev, [speakerId]: editingSpeakerName.trim() }));
    setEditingSpeakerId(null);

    try {
      await renameSpeakerAction(meeting.id, speakerId, editingSpeakerName.trim(), workspaceSlug);
    } catch (err) {
      console.error("Rename failed", err);
      setSpeakerMap(initialSpeakerMap);
    }
  };

  const handleEditSegment = async (segmentId: string) => {
    const trimmedNewText = editingSegmentText.trim();
    if (!trimmedNewText) return;

    const originalText = originalTextMap.current[segmentId] || "";
    const willBeEdited = trimmedNewText !== originalText;

    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId
          ? { ...seg, text: trimmedNewText, isEdited: willBeEdited }
          : seg
      )
    );
    setEditingSegmentId(null);

    try {
      await editSegmentAction(
        segmentId,
        trimmedNewText,
        meeting.id,
        workspaceSlug,
        willBeEdited
      );
    } catch (err) {
      console.error("Segment text update failed", err);
      setSegments(initialSegments);
    }
  };

  const handleToggleActionItem = async (itemId: string, currentStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED") => {
    const nextStatus = currentStatus === "PENDING" ? "COMPLETED" : "PENDING";
    
    setActionItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, status: nextStatus } : item))
    );

    try {
      await toggleActionItemAction(itemId, nextStatus === "COMPLETED", meeting.id, workspaceSlug);
    } catch (err) {
      console.error("Failed to toggle action item status", err);
      setActionItems(initialActionItems);
    }
  };

  const formatTime = (secs: number) => {
    const isLong = (audioDuration || meeting.durationSeconds || 0) >= 3600;
    return formatSecondsToTime(secs, isLong);
  };

  const renderInsightsDashboard = () => {
    return (
      <Tabs defaultValue="summary" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-2.5 py-2 border-b border-border bg-muted/30 shrink-0">
          <TabsList
            ref={tabsListRef}
            className="flex w-full h-9 bg-muted/20 p-1 overflow-x-auto overflow-y-hidden scrollbar-none [&&::-webkit-scrollbar]:hidden gap-0.5 shrink-0 rounded-lg"
          >
            <TabsTrigger value="summary" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <FileText className="size-3.5" /> Summary
            </TabsTrigger>
            <TabsTrigger value="chapters" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <Compass className="size-3.5" /> Chapters
            </TabsTrigger>
            <TabsTrigger value="ask-ai" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <Bot className="size-3.5" /> Ask AI
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <ListTodo className="size-3.5" /> Actions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <PieChart className="size-3.5" /> Stats
            </TabsTrigger>
            <TabsTrigger value="export" className="text-[10px] sm:text-[11px] lg:text-xs font-semibold flex items-center justify-center gap-1 h-7 px-1 sm:px-1.5 flex-1 shrink-0 select-none whitespace-nowrap">
              <Share className="size-3.5" /> Export
            </TabsTrigger>
          </TabsList>
        </div>

        {}
        <TabsContent value="chapters" className="flex-1 overflow-y-auto p-5 focus-visible:ring-0 m-0">
          <h3 className="text-base font-bold text-foreground border-b border-border pb-2 mb-4">
            Meeting Chapters
          </h3>
          
          {chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No chapters generated for this meeting.
            </p>
          ) : (
            <div className="space-y-3">
              {chapters.map((chapter, idx) => {
                const isActive = currentTime >= chapter.startTime && currentTime <= chapter.endTime;
                return (
                  <div
                    key={idx}
                    onClick={() => seekToAndPlay(chapter.startTime)}
                    className={`group flex flex-col gap-1.5 rounded-lg border p-3 shadow-xs hover:border-primary/50 transition-all cursor-pointer select-none ${
                      isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                        {chapter.title}
                      </span>
                      <span className="text-xs font-mono font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-md border border-border/50 shrink-0">
                        {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
                      </span>
                    </div>
                    {chapter.summary && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {chapter.summary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {}
        <TabsContent value="ask-ai" className="flex-1 flex flex-col overflow-hidden m-0 focus-visible:ring-0">
          {}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-muted/5 scrollbar-thin">
            {chatMessages.map((msg, index) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={index}
                  className={`flex items-start gap-2.5 max-w-[85%] ${
                    isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                  }`}
                >
                  {}
                  <div
                    className={`size-7 rounded-lg flex items-center justify-center shrink-0 border text-3xs font-bold font-mono ${
                      isUser
                        ? "bg-muted text-muted-foreground border-border/80"
                        : "bg-primary/10 text-primary border-primary/20"
                    }`}
                  >
                    {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>

                  {}
                  <div
                    className={`rounded-xl p-3 border text-sm leading-relaxed shadow-2xs select-text ${
                      isUser
                        ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none"
                        : "bg-card text-foreground border-border rounded-tl-none"
                    }`}
                  >
                    {isUser ? (
                      msg.text
                    ) : (
                      <div className="space-y-2">
                        {msg.text.split("\n\n").map((para, i) => {
                          if (para.startsWith("- ") || para.startsWith("* ")) {
                            return (
                              <ul key={i} className="list-disc pl-4 space-y-1 my-1">
                                {para.split("\n").map((line, j) => {
                                  const cleanLine = line.replace(/^[\-\*]\s+/, "");
                                  return (
                                    <li key={j}>
                                      {cleanLine.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
                                        if (part.startsWith("**") && part.endsWith("**")) {
                                          return <strong key={idx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                                        }
                                        return part;
                                      })}
                                    </li>
                                  );
                                })}
                              </ul>
                            );
                          }
                          return (
                            <p key={i} className="leading-relaxed">
                              {para.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
                                if (part.startsWith("**") && part.endsWith("**")) {
                                  return <strong key={idx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                                }
                                return part;
                              })}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {}
            {chatLoading && (
              <div className="flex items-start gap-2.5 max-w-[85%] mr-auto">
                <div className="size-7 rounded-lg flex items-center justify-center shrink-0 border bg-primary/10 text-primary border-primary/20">
                  <Bot className="size-3.5 animate-bounce" />
                </div>
                <div className="bg-card text-foreground border border-border rounded-xl rounded-tl-none p-3 shadow-2xs flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-foreground/30 animate-bounce" />
                  <span className="size-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.2s]" />
                  <span className="size-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          {}
          <form
            onSubmit={handleSendChatMessage}
            className="px-4 py-3 border-t border-border bg-card flex items-center gap-2 shrink-0"
          >
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this meeting..."
              className="h-9 text-sm bg-muted/30 focus-visible:ring-primary focus-visible:ring-1"
              disabled={chatLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="size-8 rounded-lg cursor-pointer shrink-0"
              disabled={!chatInput.trim() || chatLoading}
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </TabsContent>

        {}
        <TabsContent value="summary" className="flex-1 overflow-y-auto p-5 focus-visible:ring-0 m-0 space-y-4">
          {}
          {!isReadOnly && meeting.summaryMarkdown && (
            <Button
              onClick={handleDraftEmail}
              className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all h-9 text-sm font-semibold rounded-lg cursor-pointer"
            >
              <Mail className="size-3.5" /> Draft Follow-up Email
            </Button>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
            {meeting.summaryMarkdown ? (
              <div className="text-[15px] leading-relaxed space-y-4">
                <ReactMarkdown
                  components={{
                    h1: ({ node, ...props }) => <h1 className="text-xl font-extrabold text-foreground mt-6 mb-3 border-b border-border/80 pb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-foreground mt-5 mb-2.5 border-b border-border/40 pb-1" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-base font-bold text-foreground mt-4 mb-2" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-3 text-foreground/80 leading-relaxed" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3.5 space-y-1.5 text-foreground/80" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3.5 space-y-1.5 text-foreground/80" {...props} />,
                    li: ({ node, ...props }) => <li className="pl-0.5" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-foreground" {...props} />,
                    em: ({ node, ...props }) => <em className="italic text-foreground/90" {...props} />,
                  }}
                >
                  {meeting.summaryMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-[15px] text-muted-foreground">No executive summary generated.</p>
            )}
          </div>
        </TabsContent>

        {}
        <TabsContent value="actions" className="flex-1 overflow-y-auto p-5 focus-visible:ring-0 m-0">
          <h3 className="text-base font-bold text-foreground border-b border-border pb-2 mb-4 flex items-center justify-between">
            <span>Action Item Tracker</span>
            <span className="text-xs font-normal text-muted-foreground">
              {actionItems.filter((a) => a.status === "COMPLETED").length}/{actionItems.length} completed
            </span>
          </h3>
          
          {actionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No action items extracted from this meeting.</p>
          ) : (
            <div className="space-y-3">
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-xs hover:border-primary/30 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={item.status === "COMPLETED"}
                    onChange={() => {
                      if (!isReadOnly) {
                        handleToggleActionItem(item.id, item.status);
                      }
                    }}
                    disabled={isReadOnly}
                    className="mt-1 size-4 shrink-0 rounded border-input text-primary focus:ring-ring disabled:opacity-75"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-relaxed text-foreground ${
                      item.status === "COMPLETED" ? "line-through text-muted-foreground" : ""
                    }`}>
                      {item.taskDescription}
                    </p>
                    {item.assigneeName && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-secondary/80 px-2 py-0.5 text-xs font-medium text-secondary-foreground border border-border">
                        {item.assigneeName}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {}
        <TabsContent value="analytics" className="flex-1 overflow-y-auto focus-visible:ring-0 m-0">
          <div className="p-5 space-y-5">

            {}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Meeting Intelligence</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Talk time, sentiment & engagement analytics</p>
              </div>
              {!isReadOnly && (
                <button
                  onClick={handleAnalyzeSentiment}
                  disabled={isSentimentLoading}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer overflow-hidden ${
                    sentimentDone
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                  } disabled:opacity-70 disabled:cursor-not-allowed`}
                >
                  {isSentimentLoading && (
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
                  )}
                  {isSentimentLoading ? (
                    <><Loader2 className="size-3 animate-spin" /> Analyzing...</>
                  ) : sentimentDone ? (
                    <><Check className="size-3" /> Re-analyze</>
                  ) : (
                    <><PieChart className="size-3" /> Analyze Sentiment</>
                  )}
                </button>
              )}
            </div>

            {}
            {meetingPulse && (
              <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                meetingPulse.color === "emerald"
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : meetingPulse.color === "sky"
                  ? "bg-sky-500/5 border-sky-500/20"
                  : "bg-rose-500/5 border-rose-500/20"
              }`}>
                <span className="text-2xl">{meetingPulse.icon}</span>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Meeting Pulse</p>
                  <p className={`text-base font-bold ${
                    meetingPulse.color === "emerald" ? "text-emerald-700 dark:text-emerald-400"
                    : meetingPulse.color === "sky" ? "text-sky-700 dark:text-sky-400"
                    : "text-rose-700 dark:text-rose-400"
                  }`}>{meetingPulse.label}</p>
                </div>
              </div>
            )}

            {}
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border pb-1.5">Talk Time Distribution</p>

              {speakerAnalytics.map((item, idx) => (
                <div key={item.speakerId} className="space-y-2">
                  {}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="size-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: item.colors.bg, color: item.colors.text }}
                      >
                        {getInitials(item.name)}
                      </div>
                      <span className="text-sm font-semibold truncate text-foreground">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground font-mono">
                      <span className="font-bold text-foreground">{item.percentage}%</span>
                      <span>{formatTime(item.duration)}</span>
                    </div>
                  </div>

                  {}
                  <div className="w-full bg-border/50 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.colors.text,
                        animationDelay: `${idx * 100}ms`,
                      }}
                    />
                  </div>

                  {}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{item.wordCount.toLocaleString()} words</span>
                    <span>·</span>
                    <span>{item.segCount} segments</span>
                    {item.sentiment.raw.positive + item.sentiment.raw.negative + item.sentiment.raw.neutral > 0 && (
                      <>
                        <span>·</span>
                        {}
                        <div className="flex-1 flex h-1.5 rounded-full overflow-hidden gap-px">
                          <div
                            className="bg-emerald-500 transition-all duration-700 rounded-l-full"
                            style={{ width: `${item.sentiment.positive}%` }}
                            title={`Positive: ${item.sentiment.positive}%`}
                          />
                          <div
                            className="bg-muted-foreground/40 transition-all duration-700"
                            style={{ width: `${item.sentiment.neutral}%` }}
                            title={`Neutral: ${item.sentiment.neutral}%`}
                          />
                          <div
                            className="bg-rose-500 transition-all duration-700 rounded-r-full"
                            style={{ width: `${item.sentiment.negative}%` }}
                            title={`Negative: ${item.sentiment.negative}%`}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {}
            {speakerAnalytics.some(s => s.sentiment.raw.positive + s.sentiment.raw.negative > 0) && (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border pb-1.5">Sentiment Breakdown</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 shrink-0" />Positive</div>
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/40 shrink-0" />Neutral</div>
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rose-500 shrink-0" />Negative</div>
                </div>
              </div>
            )}

            {}
            {!sentimentDone && !isReadOnly && (
              <div className="rounded-xl border border-dashed border-border p-6 flex flex-col items-center justify-center gap-3 text-center">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <PieChart className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">No Sentiment Data Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Analyze Sentiment" above to classify each speaker's tone using AI.</p>
                </div>
              </div>
            )}

          </div>
        </TabsContent>

        {}
        <TabsContent value="export" className="flex-1 overflow-y-auto focus-visible:ring-0 m-0">
          <div className="p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-foreground">Project Management Exports</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Export summary and action items to your favorite PM tools</p>
            </div>

            {exportToast && (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs font-semibold animate-in fade-in duration-200 ${
                exportToast.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
              }`}>
                {exportToast.type === "success" ? "✅" : "⚠️"}
                <div className="flex-1 leading-normal">{exportToast.message}</div>
              </div>
            )}

            <div className="space-y-3">
              {}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Download className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                      <span>Multi-Format Export Engine</span>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        PDF · SRT · Notion
                      </span>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Export printable PDF reports, .srt/.vtt subtitles, or Notion markdown</p>
                  </div>
                </div>
                <Button
                  onClick={() => setIsExportModalOpen(true)}
                  className="w-full h-9 text-xs font-extrabold gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
                >
                  <Download className="size-3.5" />
                  <span>Open Export Hub</span>
                </Button>
              </div>

              {}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs hover:border-primary/20 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xl shrink-0">
                    💬
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-foreground">Slack Integration</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Post summary and actions to a Slack channel webhook</p>
                  </div>
                </div>
                <Button
                  onClick={handleSlackExport}
                  disabled={isSlackExporting || isReadOnly}
                  className="w-full h-8 text-xs font-semibold gap-1.5"
                >
                  {isSlackExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {isSlackExporting ? "Exporting to Slack..." : "Export to Slack"}
                </Button>
              </div>

              {}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs hover:border-primary/20 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-xl shrink-0">
                    🔵
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-foreground">Jira Integration</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Convert pending actions into issues in Jira Project</p>
                  </div>
                </div>
                <Button
                  onClick={handleJiraExport}
                  disabled={isJiraExporting || isReadOnly}
                  className="w-full h-8 text-xs font-semibold gap-1.5"
                >
                  {isJiraExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {isJiraExporting ? "Creating Issues..." : "Export Action Items"}
                </Button>
              </div>

              {}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs hover:border-primary/20 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-xl shrink-0">
                    🟣
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-foreground">Linear Integration</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Convert pending actions into issues in your Linear Team</p>
                  </div>
                </div>
                <Button
                  onClick={handleLinearExport}
                  disabled={isLinearExporting || isReadOnly}
                  className="w-full h-8 text-xs font-semibold gap-1.5"
                >
                  {isLinearExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {isLinearExporting ? "Creating Issues..." : "Export Action Items"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-3 rounded-lg border border-border/50">
              💡 <strong>Tip:</strong> You can configure webhooks and API tokens in the <Link href={`/workspace/${workspaceSlug}/settings/integrations`} className="text-primary hover:underline font-semibold">Integrations settings page</Link>.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {}
      <audio
        ref={audioRef}
        src={getOptimizedAudioUrl(meeting.audioUrl, meeting.shareToken)}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        crossOrigin="anonymous"
      />

      {}
      <div className="flex flex-1 overflow-hidden">
        
        {}
        <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
          
          {}
          <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0 bg-muted/20 gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild className="size-8">
                <Link href={`/workspace/${workspaceSlug}`}>
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
              <h2 className="text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">{meeting.title}</h2>
            </div>
            
            <div className="flex items-center gap-2 max-w-md w-full justify-end">
              {}
              <Button
                onClick={() => setAutoScroll(!autoScroll)}
                variant="ghost"
                size="sm"
                className={`h-8 text-xs flex items-center gap-1.5 cursor-pointer px-2.5 rounded-lg border shrink-0 transition-all ${
                  autoScroll
                    ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                    : "bg-card text-muted-foreground border-border hover:bg-muted/10"
                }`}
                title="Toggle Auto-Scroll active text into view"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {autoScroll && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${autoScroll ? "bg-primary" : "bg-muted-foreground/60"}`}></span>
                </span>
                <span className="text-[11px] font-semibold">Follow Text</span>
              </Button>

              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search transcript..."
                  className="pl-8 pr-7 h-8 text-xs bg-card w-full"
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                />
                {searchInputValue && (
                  <button
                    onClick={() => {
                      setSearchInputValue("");
                      setDebouncedSearchQuery("");
                      setIsSearching(false);
                    }}
                    className="absolute right-2 top-2 size-4 text-muted-foreground hover:text-foreground text-xs font-bold rounded-full flex items-center justify-center cursor-pointer"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {}
              {!isReadOnly && activeUsers.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {activeUsers.slice(0, 3).map((user) => (
                      <Avatar key={user.id} className="size-6 border-2 border-background ring-1 ring-border shadow-xs" title={user.name}>
                        <AvatarImage src={user.image || undefined} alt={user.name} />
                        <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {activeUsers.length > 3 && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full shrink-0">
                      +{activeUsers.length - 3}
                    </span>
                  )}
                  <span className="h-4 w-px bg-border mx-1" />
                </div>
              )}

              {}
              {!isReadOnly && (
                <div className="relative">
                  <Button
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs flex items-center gap-1.5 cursor-pointer bg-card px-2.5"
                    title="Share Meeting"
                  >
                    <Share className="size-3.5 text-muted-foreground" />
                    <span className="hidden sm:inline">Share</span>
                  </Button>

                  {showShareMenu && (
                    <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-2.5">
                          <span className="text-xs font-bold text-foreground">Share this meeting</span>
                          <button
                            onClick={() => setShowShareMenu(false)}
                            className="text-2xs text-muted-foreground hover:text-foreground cursor-pointer px-1.5 py-0.5 rounded hover:bg-muted font-semibold"
                          >
                            Done
                          </button>
                        </div>

                        {}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isPublic ? (
                              <Globe className="size-4 text-green-600 animate-pulse" />
                            ) : (
                              <Lock className="size-4 text-muted-foreground" />
                            )}
                            <div className="flex flex-col">
                              <span className="text-2xs font-semibold text-foreground">Public Access</span>
                              <span className="text-[10px] text-muted-foreground">Anyone with the link can view</span>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={handleToggleShare}
                            className="size-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                          />
                        </div>

                        {}
                        {isPublic && (
                          <div className="space-y-1.5 pt-2 border-t border-border">
                            <Label className="text-[10px] font-bold text-muted-foreground">Share Link</Label>
                            <div className="flex gap-1">
                              <Input
                                readOnly
                                value={getShareLink()}
                                className="h-7 text-[10px] bg-muted/40 font-mono"
                              />
                              <Button
                                onClick={handleCopyShareLink}
                                size="sm"
                                className="h-7 text-[10px] px-2 rounded-lg cursor-pointer shrink-0"
                              >
                                {copiedShareLink ? "Copied" : "Copy"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {}
          {allSpeakers.length > 1 && (
            <div className="flex items-center gap-2 px-6 py-2.5 bg-muted/10 border-b border-border shrink-0 text-xs overflow-x-auto scrollbar-none">
              <span className="text-muted-foreground font-semibold shrink-0 mr-1">Filter speakers:</span>
              <button
                onClick={() => setSelectedSpeakers([])}
                className={`px-3 py-1 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
                  selectedSpeakers.length === 0
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                All ({allSpeakers.length})
              </button>
              {allSpeakers.map((sp) => {
                const isSelected = selectedSpeakers.includes(sp.id);
                const isCurrentlySpeaking = segments[activeSegmentIndex]?.speakerId === sp.id;
                return (
                  <button
                    key={sp.id}
                    onClick={() => {
                      setSelectedSpeakers((prev) =>
                        prev.includes(sp.id)
                          ? prev.filter((id) => id !== sp.id)
                          : [...prev, sp.id]
                      );
                    }}
                    className={`px-3 py-1 rounded-full font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border text-xs ${
                      isCurrentlySpeaking
                        ? "ring-2 ring-primary ring-offset-1 scale-[1.02] shadow-xs"
                        : ""
                    }`}
                    style={{
                      backgroundColor: isSelected ? sp.colors.bg : (isCurrentlySpeaking ? sp.colors.bg : "transparent"),
                      color: isSelected ? sp.colors.text : (isCurrentlySpeaking ? sp.colors.text : "inherit"),
                      borderColor: isCurrentlySpeaking ? sp.colors.text : (isSelected ? sp.colors.border : "hsl(var(--border))")
                    }}
                  >
                    <span className={`size-2 rounded-full shrink-0 ${isCurrentlySpeaking ? "animate-pulse" : ""}`} style={{ backgroundColor: sp.colors.text }} />
                    <span>{sp.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {}
          <div
            ref={transcriptContainerRef}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-6 relative"
          >
            {}
            {isSearching && (
              <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-4 px-6 pt-3 pb-2.5 bg-background/95 backdrop-blur-md border-b border-primary/20 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs text-primary font-semibold mb-1.5">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    Searching transcript for &ldquo;<span className="font-bold">{searchInputValue}</span>&rdquo;...
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">Filtering {segments.length} sentences</span>
                </div>
                {}
                <div className="h-1.5 w-full bg-primary/15 rounded-full overflow-hidden relative">
                  <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            {}
            {!isSearching && debouncedSearchQuery.length >= 2 && (
              <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-4 px-6 py-2.5 bg-background/95 backdrop-blur-md border-b border-border flex items-center justify-between shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    Found <span className="text-primary font-bold">{filteredSegments.length}</span> matching {filteredSegments.length === 1 ? "sentence" : "sentences"} for &ldquo;<span className="text-primary font-bold">{debouncedSearchQuery}</span>&rdquo;
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearchInputValue("");
                    setDebouncedSearchQuery("");
                    setIsSearching(false);
                  }}
                  className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Clear search
                </Button>
              </div>
            )}

            {}
            {!isSearching && debouncedSearchQuery.length >= 2 && filteredSegments.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-3">
                <div className="p-3 bg-muted/40 rounded-full border border-border">
                  <Search className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No sentences found matching &ldquo;{debouncedSearchQuery}&rdquo;</p>
                <p className="text-xs text-muted-foreground max-w-sm">Try searching for a different keyword, sentence fragment, or speaker name.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInputValue("");
                    setDebouncedSearchQuery("");
                  }}
                  className="text-xs h-8 cursor-pointer"
                >
                  Reset search
                </Button>
              </div>
            )}

            {filteredSegments.map((seg) => {
              const isActive = segments[activeSegmentIndex]?.id === seg.id;
              const displayName = speakerMap[seg.speakerId] || seg.speakerId;
              const colors = getSpeakerColor(seg.speakerId);
              
              const highlightClasses =
                seg.highlightColor === "yellow" ? "bg-yellow-500/10 border-yellow-500/35 ring-yellow-500/10 border-l-4 border-l-yellow-500"
                : seg.highlightColor === "pink" ? "bg-pink-500/10 border-pink-500/35 ring-pink-500/10 border-l-4 border-l-pink-500"
                : seg.highlightColor === "green" ? "bg-emerald-500/10 border-emerald-500/35 ring-emerald-500/10 border-l-4 border-l-emerald-500"
                : seg.highlightColor === "blue" ? "bg-sky-500/10 border-sky-500/35 ring-sky-500/10 border-l-4 border-l-sky-500"
                : isActive
                ? "border-primary/50 bg-primary/8 shadow-xs ring-1 ring-primary/20 border-l-4 border-l-primary"
                : "border-transparent hover:bg-muted/30";

              return (
                <div
                  key={seg.id}
                  id={`segment-${seg.id}`}
                  className={`group flex items-start gap-4 rounded-xl p-3 border transition-all ${highlightClasses}`}
                >
                  {}
                  <button
                    onClick={() => seekToAndPlay(seg.startTime)}
                    className={`group/avatar flex size-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 shadow-xs cursor-pointer text-xs font-bold font-mono relative overflow-hidden ${
                      isActive && isPlaying
                        ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/30 scale-105"
                        : isActive
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "hover:scale-105"
                    }`}
                    style={
                      !isActive
                        ? {
                            backgroundColor: colors.bg,
                            color: colors.text,
                            borderColor: colors.border,
                          }
                        : undefined
                    }
                    title={isActive && isPlaying ? "Pause audio" : "Play from this sentence"}
                  >
                    {}
                    {isActive && isPlaying ? (
                      <div className="flex items-center justify-center w-full h-full">
                        <span className="group-hover/avatar:hidden flex items-end justify-center gap-0.5 h-3.5">
                          <span className="w-0.5 h-3 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-0.5 h-3.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-0.5 h-2 bg-current rounded-full animate-bounce" />
                        </span>
                        <Pause className="size-3.5 fill-current hidden group-hover/avatar:block" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full h-full">
                        <span className="group-hover/avatar:hidden">
                          {getInitials(displayName)}
                        </span>
                        <Play className="size-3.5 fill-current ml-0.5 hidden group-hover/avatar:block" />
                      </div>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-1.5 mb-1.5">
                      <div className="flex items-center gap-2">
                        {}
                        {!isReadOnly && editingSpeakerId === seg.speakerId ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Input
                              className="h-7 text-xs bg-card px-2 py-1 max-w-[120px]"
                              value={editingSpeakerName}
                              onChange={(e) => setEditingSpeakerName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSpeaker(seg.speakerId);
                                if (e.key === "Escape") setEditingSpeakerId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 rounded-md cursor-pointer hover:bg-muted text-green-600"
                              onClick={() => handleRenameSpeaker(seg.speakerId)}
                            >
                              <Check className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onDoubleClick={() => {
                              if (!isReadOnly) {
                                setEditingSpeakerId(seg.speakerId);
                                setEditingSpeakerName(displayName);
                              }
                            }}
                            className={`font-bold text-xs hover:text-primary transition-colors cursor-pointer ${
                              isActive ? "text-primary scale-[1.02] transform origin-left" : "text-foreground"
                            }`}
                          >
                            {displayName}
                          </button>
                        )}

                        {}
                        <button
                          onClick={() => seekTo(seg.startTime)}
                          className="text-xs text-primary font-medium hover:underline bg-primary/10 px-1.5 py-0.5 rounded"
                        >
                          {formatTime(seg.startTime)}
                        </button>

                        {}
                        {seg.sentiment && (
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              seg.sentiment === "positive"
                                ? "bg-emerald-500"
                                : seg.sentiment === "negative"
                                ? "bg-rose-500"
                                : "bg-muted-foreground/40"
                            }`}
                            title={`Sentiment: ${seg.sentiment}`}
                          />
                        )}
                      </div>

                      {}
                      {!isReadOnly && (
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {}
                          <button
                            onClick={() =>
                              setClipperState({
                                isOpen: true,
                                startTime: seg.startTime,
                                endTime: seg.endTime,
                                text: seg.text,
                                speakerName: displayName,
                              })
                            }
                            className="h-6 px-2 text-[10px] font-bold gap-1 rounded-md border border-border bg-card hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors flex items-center cursor-pointer shadow-2xs"
                            title="Create Shareable Audio Clip"
                          >
                            <Scissors className="size-3 text-primary" />
                            <span>Clip</span>
                          </button>

                          {}
                          <div className="flex items-center gap-1 border border-border bg-card px-1.5 py-0.5 rounded-lg shadow-2xs">
                            <button
                              onClick={() => handleSaveHighlight(seg.id, "yellow")}
                              className={`size-3 rounded-full bg-yellow-400 hover:scale-125 transition-transform cursor-pointer border ${
                                seg.highlightColor === "yellow" ? "ring-2 ring-primary ring-offset-1" : "border-border/30"
                              }`}
                              title="Highlight Yellow"
                            />
                            <button
                              onClick={() => handleSaveHighlight(seg.id, "pink")}
                              className={`size-3 rounded-full bg-pink-400 hover:scale-125 transition-transform cursor-pointer border ${
                                seg.highlightColor === "pink" ? "ring-2 ring-primary ring-offset-1" : "border-border/30"
                              }`}
                              title="Highlight Pink"
                            />
                            <button
                              onClick={() => handleSaveHighlight(seg.id, "green")}
                              className={`size-3 rounded-full bg-emerald-400 hover:scale-125 transition-transform cursor-pointer border ${
                                seg.highlightColor === "green" ? "ring-2 ring-primary ring-offset-1" : "border-border/30"
                              }`}
                              title="Highlight Green"
                            />
                            <button
                              onClick={() => handleSaveHighlight(seg.id, "blue")}
                              className={`size-3 rounded-full bg-sky-400 hover:scale-125 transition-transform cursor-pointer border ${
                                seg.highlightColor === "blue" ? "ring-2 ring-primary ring-offset-1" : "border-border/30"
                              }`}
                              title="Highlight Blue"
                            />
                            {seg.highlightColor && (
                              <button
                                onClick={() => handleSaveHighlight(seg.id, null)}
                                className="size-3 rounded-full bg-muted border border-border hover:bg-muted-foreground/30 flex items-center justify-center cursor-pointer"
                                title="Clear Highlight"
                              >
                                <Trash2 className="size-2 text-muted-foreground" />
                              </button>
                            )}
                          </div>

                          {}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingNoteSegmentId(seg.id);
                              setEditingNoteText(seg.noteText || "");
                            }}
                            className={`size-6 rounded-md cursor-pointer hover:bg-muted ${
                              seg.noteText ? "text-primary bg-primary/5" : "text-muted-foreground"
                            }`}
                            title={seg.noteText ? "Edit sticky note" : "Add sticky note"}
                          >
                            <MessageSquare className="size-3" />
                          </Button>

                          {}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingSegmentId(seg.id);
                              setEditingSegmentText(seg.text);
                            }}
                            className="size-6 rounded-md cursor-pointer hover:bg-muted text-muted-foreground"
                            title="Edit text"
                          >
                            <Edit2 className="size-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {}
                    <div className="mt-1.5 text-sm text-foreground/90 leading-relaxed">
                      {}
                      {!isReadOnly && editingSegmentId === seg.id ? (
                        <div className="flex flex-col gap-2 mt-2">
                          <textarea
                            className="text-sm bg-card p-3 resize-none w-full border border-input rounded-md"
                            value={editingSegmentText}
                            onChange={(e) => setEditingSegmentText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleEditSegment(seg.id);
                              }
                              if (e.key === "Escape") setEditingSegmentId(null);
                            }}
                            rows={2}
                            autoFocus
                          />
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingSegmentId(null)}
                              className="h-7 text-xs rounded-lg cursor-pointer"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleEditSegment(seg.id)}
                              className="h-7 text-xs rounded-lg cursor-pointer"
                            >
                              Save Changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          onDoubleClick={() => {
                            if (!isReadOnly) {
                              setEditingSegmentId(seg.id);
                              setEditingSegmentText(seg.text);
                            }
                          }}
                          className={`text-sm leading-relaxed mt-1 text-foreground/90 ${
                            isActive ? "font-medium" : ""
                          }`}
                        >
                          {highlightMatchedText(seg.text, debouncedSearchQuery)}
                          {seg.isEdited && (
                            <span className="ml-1.5 inline-flex items-center text-[10px] text-muted-foreground select-none font-normal italic">
                              (edited)
                            </span>
                          )}
                        </p>
                      )}

                      {}
                      {seg.noteText && (
                        <div className="mt-2.5 group/note bg-yellow-500/5 dark:bg-yellow-500/10 border border-yellow-500/20 text-foreground/80 rounded-lg p-2.5 text-xs flex items-start gap-1.5 shadow-2xs transition-all duration-200 hover:border-yellow-500/40 hover:bg-yellow-500/8">
                          <span className="text-yellow-600 shrink-0 text-sm">💡</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-yellow-600 block mb-0.5">Sticky Note</span>
                            <p className="leading-relaxed select-text">{seg.noteText}</p>
                          </div>
                          {!isReadOnly && (
                            <div className="flex items-center gap-0.5 shrink-0 ml-1 opacity-0 group-hover/note:opacity-100 transition-opacity duration-150">
                              {}
                              <button
                                onClick={() => {
                                  setEditingNoteSegmentId(seg.id);
                                  setEditingNoteText(seg.noteText || "");
                                }}
                                title="Edit note"
                                className="p-1 rounded hover:bg-yellow-500/15 text-yellow-600 hover:text-yellow-700 transition-colors cursor-pointer"
                              >
                                <Edit2 className="size-3" />
                              </button>
                              {}
                              <button
                                onClick={() => handleDeleteNote(seg.id)}
                                title="Delete note"
                                className="p-1 rounded hover:bg-rose-500/15 text-yellow-600/60 hover:text-rose-600 transition-colors cursor-pointer"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {}
                      {!isReadOnly && editingNoteSegmentId === seg.id && (
                        <div className="mt-2.5 border border-border bg-card rounded-lg p-3 space-y-2">
                          <Label className="text-[10px] font-bold text-muted-foreground">Add annotation comment</Label>
                          <textarea
                            className="w-full text-xs bg-muted/40 border border-border rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
                            placeholder="Type sticky note details..."
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                          />
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingNoteSegmentId(null)}
                              className="h-7 text-xs rounded hover:bg-muted"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveNote(seg.id)}
                              className="h-7 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/95"
                            >
                              Save Note
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {}
        <div className="w-[480px] hidden md:flex flex-col border-l border-border bg-muted/10 overflow-hidden">
          {renderInsightsDashboard()}
        </div>

      </div>

      {}
      {!isReadOnly && (
        <div className="md:hidden fixed bottom-28 right-4 z-40">
          <Button
            onClick={() => setMobileInsightsOpen(true)}
            className="rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5 h-10 px-4 text-xs font-bold cursor-pointer animate-pulse ring-4 ring-primary/10"
          >
            <Sparkles className="size-4" />
            <span>AI Insights</span>
          </Button>
        </div>
      )}

      {}
      {mobileInsightsOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center">
          {}
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
            onClick={() => setMobileInsightsOpen(false)}
          />
          {}
          <div className="relative w-full bg-card border-t border-border rounded-t-2xl shadow-2xl flex flex-col h-[70vh] max-h-[80vh] z-10 animate-in slide-in-from-bottom duration-300">
            {}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20 shrink-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AI Insights & Dashboard</span>
              <button
                onClick={() => setMobileInsightsOpen(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1 rounded bg-muted/60"
              >
                Close
              </button>
            </div>

            {}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {renderInsightsDashboard()}
            </div>
          </div>
        </div>
      )}

      {}
      <footer className="h-24 md:h-20 border-t border-border bg-card px-4 md:px-6 flex flex-col md:flex-row items-center justify-center md:justify-between gap-2 md:gap-4 shrink-0">
        
        {}
        <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <Button
              onClick={skipBackward}
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              title="Skip backward 10s (ArrowLeft)"
            >
              <RotateCcw className="size-4.5" />
            </Button>

            <Button
              onClick={togglePlay}
              size="icon"
              className="size-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center shrink-0 shadow cursor-pointer transition-transform active:scale-95"
              aria-label={isPlaying ? "Pause" : "Play"}
              title="Play/Pause (Spacebar)"
            >
              {isBuffering ? (
                <Loader2 className="size-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 fill-current ml-0.5" />
              )}
            </Button>

            <Button
              onClick={skipForward}
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              title="Skip forward 10s (ArrowRight)"
            >
              <RotateCw className="size-4.5" />
            </Button>
          </div>
          
          <div className="text-right md:text-left min-w-0">
            <p className="hidden md:block text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Currently Playing</p>
            <p className="text-xs font-semibold truncate text-foreground w-[120px] sm:w-[150px]" title={meeting.title}>{meeting.title}</p>
          </div>
        </div>

        {}
        <div className="w-full flex-1 flex items-center gap-3">
          <span className="text-xs font-semibold font-mono text-muted-foreground min-w-[54px] text-right shrink-0 select-none">
            {formatTime(currentTime)}
          </span>
          
          <div className="relative flex-1 flex items-center h-11">
            <ModernWaveformVisualizer
              waveformBars={waveformBars}
              currentTime={currentTime}
              audioDuration={audioDuration}
              chapters={chapters}
              onSeek={seekTo}
            />
          </div>

          <span className="text-xs font-semibold font-mono text-muted-foreground min-w-[54px] shrink-0 select-none">
            {formatTime(audioDuration)}
          </span>
        </div>

        {}
        <VolumeControl ref={volumeControlRef} audioRef={audioRef} initialVolume={0.8} />

      </footer>

      {}
      {isDraftingEmail && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col h-[500px] max-h-[85vh] animate-in zoom-in-95 duration-200">
            
            {}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">AI Email Draftsman</h3>
              </div>
              <button
                onClick={() => setIsDraftingEmail(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-semibold p-1 hover:bg-muted rounded-md transition-colors"
              >
                Close
              </button>
            </div>

            {}
            <div className="flex-1 overflow-y-auto p-5">
              {draftLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                  <Loader2 className="size-8 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground font-medium">Gemini is drafting your email...</p>
                </div>
              ) : (
                <pre className="text-xs font-sans text-foreground whitespace-pre-wrap leading-relaxed select-text bg-muted/40 p-4 border border-border rounded-lg h-full overflow-y-auto select-all">
                  {emailDraft}
                </pre>
              )}
            </div>

            {}
            {!draftLoading && (
              <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex items-center justify-end gap-2 shrink-0">
                <Button
                  onClick={handleCopyEmail}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 flex items-center gap-1.5 cursor-pointer"
                >
                  {isCopying ? (
                    <>
                      <Check className="size-3.5 text-green-600" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" /> Copy Draft
                    </>
                  )}
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="text-xs h-8 flex items-center gap-1.5 cursor-pointer"
                  disabled={!emailDraft || emailDraft.includes("Failed")}
                >
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`Follow-up: ${meeting.title}`)}&body=${encodeURIComponent(emailDraft)}`}
                  >
                    <Mail className="size-3.5" /> Open Mail App
                  </a>
                </Button>
              </div>
            )}

          </div>
        </div>
      )}

      {}
      <AudioSnippetClipperModal
        isOpen={clipperState.isOpen}
        onClose={() => setClipperState((prev) => ({ ...prev, isOpen: false }))}
        audioUrl={getOptimizedAudioUrl(meeting.audioUrl, meeting.shareToken)}
        meetingTitle={meeting.title}
        initialStartTime={clipperState.startTime}
        initialEndTime={clipperState.endTime}
        segmentText={clipperState.text}
        speakerName={clipperState.speakerName}
      />

      {}
      <MeetingExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        meeting={meeting}
        segments={segments}
        actionItems={actionItems}
        speakerMap={speakerMap}
        workspaceName="Workspace"
      />

    </div>
  );
}
