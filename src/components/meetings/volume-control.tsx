"use client";

import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Volume2, Volume1, VolumeX } from "lucide-react";

interface VolumeControlProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  initialVolume?: number;
}

export interface VolumeControlHandle {
  setVolumeLevel: (val: number) => void;
  getVolumeLevel: () => number;
  toggleMute: () => void;
}

export const VolumeControl = React.memo(
  forwardRef<VolumeControlHandle, VolumeControlProps>(function VolumeControl(
    { audioRef, initialVolume = 0.8 },
    ref
  ) {
    const [volume, setVolume] = useState(initialVolume);
    const [prevVolume, setPrevVolume] = useState(initialVolume);

    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.volume = volume;
      }
    }, [audioRef, volume]);

    const applyVolume = useCallback(
      (val: number) => {
        const clamped = Math.max(0, Math.min(1, Math.round(val * 100) / 100));
        setVolume(clamped);
        if (audioRef.current) {
          audioRef.current.volume = clamped;
        }
      },
      [audioRef]
    );

    const toggleMute = useCallback(() => {
      if (volume > 0) {
        setPrevVolume(volume);
        applyVolume(0);
      } else {
        applyVolume(prevVolume || 0.8);
      }
    }, [volume, prevVolume, applyVolume]);

    useImperativeHandle(
      ref,
      () => ({
        setVolumeLevel: (val: number) => applyVolume(val),
        getVolumeLevel: () => volume,
        toggleMute,
      }),
      [applyVolume, volume, toggleMute]
    );

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      applyVolume(val);
    };

    const renderVolumeIcon = () => {
      if (volume === 0) return <VolumeX className="size-4 shrink-0" />;
      if (volume < 0.5) return <Volume1 className="size-4 shrink-0" />;
      return <Volume2 className="size-4 shrink-0" />;
    };

    return (
      <div className="hidden md:flex items-center gap-2 text-muted-foreground shrink-0 w-32 justify-end">
        <button
          onClick={toggleMute}
          className="hover:text-primary transition-colors cursor-pointer flex items-center justify-center p-1 rounded-md hover:bg-muted/40 shrink-0"
          title={volume === 0 ? "Unmute (M)" : "Mute (M)"}
        >
          {renderVolumeIcon()}
        </button>

        {}
        <div className="relative flex items-center w-20 h-6 group cursor-pointer">
          {}
          <div className="absolute inset-x-0 h-1.5 bg-muted-foreground/25 dark:bg-muted-foreground/20 rounded-full overflow-hidden pointer-events-none">
            {}
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${volume * 100}%` }}
            />
          </div>

          {}
          <div
            className="absolute size-3 bg-white dark:bg-slate-100 rounded-full border-2 border-primary shadow-xs pointer-events-none transform -translate-x-1/2 group-hover:scale-125 transition-transform"
            style={{ left: `${volume * 100}%` }}
          />

          {}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleSliderChange}
            className="w-full h-full opacity-0 cursor-pointer z-10"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
        </div>
      </div>
    );
  })
);
