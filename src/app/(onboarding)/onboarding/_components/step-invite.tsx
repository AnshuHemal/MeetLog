"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, X, Loader2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import { sendInvites } from "../actions";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

interface StepInviteProps {
  workspaceId: string;
  workspaceName: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function StepInvite({ workspaceId, workspaceName, onComplete, onSkip }: StepInviteProps) {
  const [emails, setEmails]           = useState<string[]>([""]);
  const [touched, setTouched]         = useState<boolean[]>([false]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

  function updateEmail(i: number, v: string) { setEmails((p) => p.map((e, j) => j === i ? v : e)); setServerError(null); }
  function markTouched(i: number)            { setTouched((p) => p.map((t, j) => j === i ? true : t)); }
  function addEmail()                        { setEmails((p) => [...p, ""]); setTouched((p) => [...p, false]); }
  function removeEmail(i: number)            { setEmails((p) => p.filter((_, j) => j !== i)); setTouched((p) => p.filter((_, j) => j !== i)); }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setTouched(emails.map(() => true));
    const valid = emails.filter((e) => isValidEmail(e));
    if (valid.length === 0) { setServerError("Please enter at least one valid email address."); return; }
    startTransition(async () => {
      const result = await sendInvites({ workspaceId, emails: valid });
      if (!result.success) { setServerError(result.error ?? "Failed to send invitations."); return; }
      onComplete();
    });
  }

  const hasAnyValid = emails.some((e) => isValidEmail(e));

  return (
    <div className="flex flex-col gap-6">

      {}
      <FadeIn direction="down" delay={0.05} className="flex flex-col items-center gap-3 text-center">
        <motion.div
          className="flex size-14 items-center justify-center rounded-2xl bg-primary/10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Users className="size-7 text-primary" />
        </motion.div>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Invite your team
          </h2>
          <p className="text-sm text-muted-foreground">
            Add teammates to{" "}
            <span className="font-semibold text-foreground">{workspaceName}</span>.
            You can always do this later.
          </p>
        </div>
      </FadeIn>

      {}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <FadeIn delay={0.1} className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {emails.map((email, i) => {
              const showError = touched[i] && email.trim() !== "" && !isValidEmail(email);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder={`teammate${i + 1}@company.com`}
                      value={email}
                      disabled={isPending}
                      onChange={(e) => updateEmail(i, e.target.value)}
                      onBlur={() => markTouched(i)}
                      className={cn("flex-1", showError && "border-destructive")}
                    />
                    {emails.length > 1 && (
                      <button type="button" onClick={() => removeEmail(i)} disabled={isPending} aria-label="Remove"
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {showError && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-sm text-destructive">
                        Please enter a valid email address.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {emails.length < 10 && (
            <button type="button" onClick={addEmail} disabled={isPending}
              className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Plus className="size-4" />Add another
            </button>
          )}
        </FadeIn>

        <AnimatePresence mode="wait">
          {serverError && (
            <motion.div key="se" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" />{serverError}
            </motion.div>
          )}
        </AnimatePresence>

        <FadeIn delay={0.15}>
          <Button type="submit" className="w-full" disabled={!hasAnyValid || isPending}>
            {isPending
              ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Sending invites…</span>
              : <span className="flex items-center gap-2">Send invites<ArrowRight className="size-4" /></span>
            }
          </Button>
        </FadeIn>
      </form>

      {}
      <FadeIn direction="none" delay={0.2} className="text-center">
        <button type="button" onClick={onSkip} disabled={isPending}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors disabled:opacity-50">
          Skip for now
        </button>
      </FadeIn>
    </div>
  );
}
