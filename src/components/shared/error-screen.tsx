"use client";

import { motion } from "motion/react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

interface ErrorScreenProps {

  error?: Error & { digest?: string };

  reset?: () => void;

  title?: string;

  description?: string;

  showHome?: boolean;
}

export function ErrorScreen({
  error,
  reset,
  title = "Something went wrong",
  description,
  showHome = true,
}: ErrorScreenProps) {
  const message = description ??
    (error?.message && !error.message.includes("NEXT_")
      ? error.message
      : "An unexpected error occurred. Our team has been notified.");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      {}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_40%,var(--background)_100%)]"
      />

      {}
      <div className="absolute left-6 top-6 z-10">
        <Logo size={24} />
      </div>

      {}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          {}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mb-6 flex justify-center"
          >
            <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <h1 className="mb-2 text-xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              {message}
            </p>
          </motion.div>

          {}
          {error?.digest && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-5 rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground"
            >
              Error ID: {error.digest}
            </motion.p>
          )}

          {}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.2 }}
            className="flex flex-col gap-2.5 sm:flex-row sm:justify-center"
          >
            {reset && (
              <Button onClick={reset} className="gap-2">
                <RefreshCw className="size-4" />
                Try again
              </Button>
            )}
            {showHome && (
              <Button
                variant={reset ? "outline" : "default"}
                className="gap-2"
                onClick={() => { window.location.href = "/dashboard"; }}
              >
                <Home className="size-4" />
                Go to dashboard
              </Button>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
