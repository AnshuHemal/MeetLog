"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Kbd } from "@/components/shared/keyboard-shortcuts-modal";
import { cn } from "@/lib/utils";

interface ShortcutHintProps {

  shortcut: string;

  label?: string;

  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
}

export function ShortcutHint({
  shortcut,
  label,
  side = "bottom",
  children,
  className,
}: ShortcutHintProps) {
  const [visible, setVisible] = useState(false);

  const parts = shortcut.split(" ");

  const positionClasses = {
    top:    "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left:   "right-full top-1/2 mr-2 -translate-y-1/2",
    right:  "left-full top-1/2 ml-2 -translate-y-1/2",
  };

  const enterVariants = {
    top:    { opacity: 0, y: 4  },
    bottom: { opacity: 0, y: -4 },
    left:   { opacity: 0, x: 4  },
    right:  { opacity: 0, x: -4 },
  };

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ ...enterVariants[side], opacity: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ ...enterVariants[side], opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={cn(
              "pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap",
              "rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg",
              positionClasses[side],
            )}
          >
            {label && (
              <span className="text-sm text-foreground">{label}</span>
            )}
            <div className="flex items-center gap-1">
              {parts.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Kbd>{k === "?" ? "?" : k.toUpperCase()}</Kbd>
                  {i < parts.length - 1 && (
                    <span className="text-[10px] text-muted-foreground/60">then</span>
                  )}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
