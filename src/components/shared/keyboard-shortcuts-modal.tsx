"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Keyboard, Navigation, FileText, LayoutDashboard,
  Zap, Globe, MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ShortcutEntry {
  keys: string;
  description: string;
  group: string;
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutEntry[];
}

const GROUP_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  General:    { icon: Globe,           color: "text-muted-foreground" },
  Navigation: { icon: Navigation,      color: "text-blue-500"         },
};

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn(
      "inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-border",
      "bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground",
      "shadow-[0_1px_0_0_hsl(var(--border))]",
      className,
    )}>
      {children}
    </kbd>
  );
}

export function KeySequence({ keys }: { keys: string }) {
  const parts = keys.split(" ");
  return (
    <div className="flex items-center gap-1">
      {parts.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          <Kbd>{k === "?" ? "?" : k.toUpperCase()}</Kbd>
          {i < parts.length - 1 && (
            <span className="text-[10px] font-medium text-muted-foreground/60">then</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ShortcutRow({ entry, index }: { entry: ShortcutEntry; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, delay: index * 0.025 }}
      className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <span className="text-sm text-foreground">{entry.description}</span>
      <KeySequence keys={entry.keys} />
    </motion.div>
  );
}

function GroupSection({
  group, entries, startIndex,
}: {
  group: string; entries: ShortcutEntry[]; startIndex: number;
}) {
  const config = GROUP_CONFIG[group] ?? { icon: Globe, color: "text-muted-foreground" };
  const Icon = config.icon;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className={cn("flex size-5 items-center justify-center rounded", "bg-muted/60")}>
          <Icon className={cn("size-3", config.color)} />
        </div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group}
        </h3>
      </div>
      <div className="flex flex-col gap-0.5">
        {entries.map((entry, i) => (
          <ShortcutRow key={entry.keys} entry={entry} index={startIndex + i} />
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({ open, onClose, shortcuts }: KeyboardShortcutsModalProps) {

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const groups = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});

  let runningIndex = 0;
  const groupsWithIndex = Object.entries(groups).map(([group, entries]) => {
    const start = runningIndex;
    runningIndex += entries.length;
    return { group, entries, start };
  });

  const half = Math.ceil(groupsWithIndex.length / 2);
  const leftGroups  = groupsWithIndex.slice(0, half);
  const rightGroups = groupsWithIndex.slice(half);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="shortcuts-panel"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                  <Keyboard className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Keyboard Shortcuts</h2>
                  <p className="text-sm text-muted-foreground">Speed up your workflow</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kbd className="text-muted-foreground">?</Kbd>
                <span className="text-sm text-muted-foreground">to toggle</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {}
            <div className="max-h-[65vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {}
                <div className="flex flex-col gap-6">
                  {leftGroups.map(({ group, entries, start }) => (
                    <GroupSection key={group} group={group} entries={entries} startIndex={start} />
                  ))}
                </div>
                {}
                <div className="flex flex-col gap-6">
                  {rightGroups.map(({ group, entries, start }) => (
                    <GroupSection key={group} group={group} entries={entries} startIndex={start} />
                  ))}
                </div>
              </div>
            </div>

            {}
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
              <p className="text-sm text-muted-foreground">
                Shortcuts are disabled when typing in an input field
              </p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Kbd>Esc</Kbd>
                  close
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
