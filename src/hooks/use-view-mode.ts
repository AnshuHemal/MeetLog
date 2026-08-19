"use client";

import { useState, useEffect, useCallback } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_KEY = "meetlog_view_mode_preference";

export function useViewMode(defaultMode: ViewMode = "grid"): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewModeState] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
      if (saved === "grid" || saved === "list") {
        setViewModeState(saved);
      }
    } catch {
    }
  }, []);

  const setViewMode = useCallback((newMode: ViewMode) => {
    setViewModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
    }
  }, []);

  return [viewMode, setViewMode];
}
