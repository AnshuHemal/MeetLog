"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { formatSecondsToTime } from "@/lib/time-utils";

interface Chapter {
  title: string;
  startTime: number;
}

interface ModernWaveformVisualizerProps {
  waveformBars: Array<{ height: number; isSilent: boolean }>;
  currentTime: number;
  audioDuration: number;
  chapters?: Chapter[];
  onSeek: (seconds: number) => void;
}

export const ModernWaveformVisualizer = React.memo(function ModernWaveformVisualizer({
  waveformBars,
  currentTime,
  audioDuration,
  chapters = [],
  onSeek,
}: ModernWaveformVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const lastSeekTimestampRef = useRef<number>(0);

  const [hoverState, setHoverState] = useState<{
    visible: boolean;
    x: number;
    time: number;
  }>({
    visible: false,
    x: 0,
    time: 0,
  });

  const renderCanvas = useCallback(
    (hoverPercent: number | null = null) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight || 44;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const barWidth = 3;
      const barGap = 2;
      const slotWidth = barWidth + barGap;
      const totalBars = Math.max(10, Math.floor(width / slotWidth));

      const activePercent = audioDuration > 0 ? currentTime / audioDuration : 0;

      const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
      const unplayedColor = isDark ? "rgba(148, 163, 184, 0.45)" : "rgba(100, 116, 139, 0.40)";
      const hoverFillColor = "rgba(59, 130, 246, 0.65)";
      const playedColor = "#3b82f6";

      for (let i = 0; i < totalBars; i++) {
        const x = i * slotWidth;
        const barPct = i / totalBars;

        const dataIdx = Math.floor((i / totalBars) * waveformBars.length);
        const dataBar = waveformBars[dataIdx] || { height: 25, isSilent: true };

        const normalizedHeight = Math.max(0.20, (dataBar.height || 25) / 100);
        const barHeight = Math.max(7, Math.round(normalizedHeight * (height - 8)));
        const y = height - barHeight - 2;

        const isPassed = barPct <= activePercent;
        const isHovered = hoverPercent !== null && barPct <= hoverPercent;

        if (isPassed) {
          ctx.fillStyle = playedColor;
        } else if (isHovered) {
          ctx.fillStyle = hoverFillColor;
        } else {
          ctx.fillStyle = unplayedColor;
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      if (audioDuration > 0 && chapters.length > 0) {
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(15, 23, 42, 0.6)";
        chapters.forEach((chapter) => {
          if (chapter.startTime <= 0) return;
          const chapterPct = chapter.startTime / audioDuration;
          if (chapterPct > 0 && chapterPct < 1) {
            const cx = Math.round(chapterPct * width);
            ctx.fillRect(cx - 1, 0, 2, height);
          }
        });
      }

      ctx.restore();
    },
    [waveformBars, currentTime, audioDuration, chapters]
  );

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      renderCanvas();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [renderCanvas]);

  const handlePointer = useCallback(
    (clientX: number, isClick = false) => {
      const container = containerRef.current;
      if (!container || audioDuration <= 0) return;

      const rect = container.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const percent = relativeX / rect.width;
      const targetTime = percent * audioDuration;

      setHoverState({
        visible: true,
        x: relativeX,
        time: targetTime,
      });

      renderCanvas(percent);

      if (isClick) {
        pendingSeekTimeRef.current = null;
        lastSeekTimestampRef.current = Date.now();
        onSeek(targetTime);
      } else if (isDraggingRef.current) {
        pendingSeekTimeRef.current = targetTime;
        const now = Date.now();
        if (now - lastSeekTimestampRef.current > 100) {
          lastSeekTimestampRef.current = now;
          onSeek(targetTime);
        }
      }
    },
    [audioDuration, onSeek, renderCanvas]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-11 flex items-center cursor-pointer select-none py-1 group"
      onPointerDown={(e) => {
        isDraggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        handlePointer(e.clientX, true);
      }}
      onPointerMove={(e) => {
        handlePointer(e.clientX, false);
      }}
      onPointerUp={(e) => {
        isDraggingRef.current = false;
        try {
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {}
        if (pendingSeekTimeRef.current !== null) {
          onSeek(pendingSeekTimeRef.current);
          pendingSeekTimeRef.current = null;
        }
      }}
      onPointerLeave={() => {
        if (!isDraggingRef.current) {
          setHoverState((prev) => ({ ...prev, visible: false }));
          renderCanvas(null);
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />

      {}
      {hoverState.visible && audioDuration > 0 && (
        <div
          className="absolute -top-7 -translate-x-1/2 bg-popover text-popover-foreground border border-border px-2 py-0.5 rounded text-[11px] font-bold shadow-lg pointer-events-none font-mono z-40 whitespace-nowrap"
          style={{
            left: `${hoverState.x}px`,
          }}
        >
          {formatSecondsToTime(hoverState.time, audioDuration >= 3600)}
        </div>
      )}
    </div>
  );
});
