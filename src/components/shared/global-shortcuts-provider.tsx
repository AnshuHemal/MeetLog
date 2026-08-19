"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsModal } from "@/components/shared/keyboard-shortcuts-modal";
import { useWorkspaceSafe } from "@/components/providers/workspace-provider";
import { CommandPalette } from "@/components/shared/command-palette";

const GLOBAL_SHORTCUTS = [
  { keys: "?",   description: "Show keyboard shortcuts",  group: "General"    },
  { keys: "⌘k",  description: "Open search palette",      group: "General"    },
  { keys: "g h", description: "Go to workspace home",     group: "Navigation" },
  { keys: "g m", description: "Go to meetings list",      group: "Navigation" },
  { keys: "g a", description: "Go to analytics dashboard", group: "Navigation" },
  { keys: "g u", description: "Go to upload meeting",     group: "Navigation" },
  { keys: "g i", description: "Go to integrations settings", group: "Navigation" },
];

export function GlobalShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router   = useRouter();
  const pathname = usePathname();
  const ctx      = useWorkspaceSafe();

  const navigate = useCallback(
    (path: string) => { if (pathname !== path) router.push(path); },
    [router, pathname],
  );

  useEffect(() => {
    function handleGlobalKeys(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, []);

  useKeyboardShortcuts([
    {
      keys: "?",
      description: "Show keyboard shortcuts",
      group: "General",
      handler: () => setOpen((v) => !v),
    },
    {
      keys: "g h",
      description: "Go to workspace home",
      group: "Navigation",
      handler: () => {
        const slug = ctx?.workspaceSlug;
        if (slug) navigate(`/workspace/${slug}`);
      },
    },
    {
      keys: "g m",
      description: "Go to meetings list",
      group: "Navigation",
      handler: () => {
        const slug = ctx?.workspaceSlug;
        if (slug) navigate(`/workspace/${slug}/meetings`);
      },
    },
    {
      keys: "g a",
      description: "Go to analytics dashboard",
      group: "Navigation",
      handler: () => {
        const slug = ctx?.workspaceSlug;
        if (slug) navigate(`/workspace/${slug}/analytics`);
      },
    },
    {
      keys: "g u",
      description: "Go to upload meeting",
      group: "Navigation",
      handler: () => {
        const slug = ctx?.workspaceSlug;
        if (slug) navigate(`/workspace/${slug}/upload`);
      },
    },
    {
      keys: "g i",
      description: "Go to integrations settings",
      group: "Navigation",
      handler: () => {
        const slug = ctx?.workspaceSlug;
        if (slug) navigate(`/workspace/${slug}/settings/integrations`);
      },
    },
  ]);

  return (
    <>
      {children}
      <KeyboardShortcutsModal
        open={open}
        onClose={() => setOpen(false)}
        shortcuts={GLOBAL_SHORTCUTS}
      />
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}
