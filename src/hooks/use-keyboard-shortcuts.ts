"use client";

import { useEffect, useRef } from "react";

export interface ShortcutHandler {

  keys: string;

  description: string;

  group: string;

  handler: () => void;

  allowInInput?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function isInputFocused() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (el as HTMLElement).isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const inputFocused = isInputFocused();

      const sequence = pendingKey.current ? `${pendingKey.current} ${key}` : key;

      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }

      for (const shortcut of shortcuts) {
        if (shortcut.keys === sequence) {
          if (inputFocused && !shortcut.allowInInput) {
            pendingKey.current = null;
            return;
          }
          e.preventDefault();
          pendingKey.current = null;
          shortcut.handler();
          return;
        }
      }

      const couldBePrefix = shortcuts.some((s) => s.keys.startsWith(key + " "));
      if (couldBePrefix && !inputFocused) {
        pendingKey.current = key;

        pendingTimer.current = setTimeout(() => {
          pendingKey.current = null;
        }, 1000);
        return;
      }

      pendingKey.current = null;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [shortcuts]);
}
