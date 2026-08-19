"use client";

import { useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import {
  checkSlugAvailable,
  createWorkspace,
  type CreateWorkspaceResult,
} from "../actions";

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

interface StepWorkspaceProps {
  onComplete: (result: CreateWorkspaceResult) => void;
}

export function StepWorkspace({ onComplete }: StepWorkspaceProps) {
  const [name, setName]               = useState("");
  const [slug, setSlug]               = useState("");
  const [slugEdited, setSlugEdited]   = useState(false);
  const [slugStatus, setSlugStatus]   = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    setFieldErrors((p) => ({ ...p, name: "" }));
    if (!slugEdited) {
      const derived = nameToSlug(value);
      setSlug(derived);
      triggerSlugCheck(derived);
    }
  }

  function triggerSlugCheck(value: string) {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    if (!value || value.length < 2) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    slugDebounceRef.current = setTimeout(async () => {
      const { available } = await checkSlugAvailable(value);
      setSlugStatus(available ? "available" : "taken");
    }, 400);
  }

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlugEdited(true);
    setSlug(cleaned);
    setFieldErrors((p) => ({ ...p, slug: "" }));
    triggerSlugCheck(cleaned);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    startTransition(async () => {
      const result = await createWorkspace({ name, slug });
      if (!result.success) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (result.error) setServerError(result.error);
        return;
      }
      onComplete(result.data!);
    });
  }

  const canSubmit =
    name.trim().length >= 2 &&
    slug.trim().length >= 2 &&
    slugStatus !== "taken" &&
    slugStatus !== "checking" &&
    !isPending;

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
          <Building2 className="size-7 text-primary" />
        </motion.div>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Create your workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            A workspace is where your team&apos;s meetings and transcripts live.
          </p>
        </div>
      </FadeIn>

      {}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {}
        <FadeIn delay={0.1} className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            type="text"
            placeholder="Acme Inc."
            autoComplete="off"
            required
            disabled={isPending}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={cn(fieldErrors.name && "border-destructive")}
          />
          <AnimatePresence mode="wait">
            {fieldErrors.name && (
              <motion.p key="name-err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive">
                {fieldErrors.name}
              </motion.p>
            )}
          </AnimatePresence>
        </FadeIn>

        {}
        <FadeIn delay={0.15} className="flex flex-col gap-1.5">
          <Label htmlFor="ws-slug">Workspace URL</Label>
          <div className={cn(
            "flex items-center rounded-md border bg-background transition-all",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
            fieldErrors.slug || slugStatus === "taken" ? "border-destructive" : "border-border",
          )}>
            <span className="select-none border-r border-border px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
              meetlog.app/
            </span>
            <div className="flex flex-1 items-center">
              <input
                id="ws-slug"
                type="text"
                placeholder="acme-inc"
                autoComplete="off"
                required
                disabled={isPending}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="pr-3">
                <AnimatePresence mode="wait">
                  {slugStatus === "checking" && (
                    <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </motion.span>
                  )}
                  {slugStatus === "available" && (
                    <motion.span key="a" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <CheckCircle2 className="size-4 text-primary" />
                    </motion.span>
                  )}
                  {slugStatus === "taken" && (
                    <motion.span key="t" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <XCircle className="size-4 text-destructive" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {fieldErrors.slug ? (
              <motion.p key="fe" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive">{fieldErrors.slug}</motion.p>
            ) : slugStatus === "taken" ? (
              <motion.p key="tk" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive">This URL is already taken.</motion.p>
            ) : slugStatus === "available" ? (
              <motion.p key="av" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-primary">This URL is available.</motion.p>
            ) : (
              <motion.p key="ht" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted-foreground">Only lowercase letters, numbers, and hyphens.</motion.p>
            )}
          </AnimatePresence>
        </FadeIn>

        {}
        <AnimatePresence mode="wait">
          {serverError && (
            <motion.div key="se" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" />{serverError}
            </motion.div>
          )}
        </AnimatePresence>

        <FadeIn delay={0.2}>
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isPending
              ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Creating workspace…</span>
              : "Create workspace"
            }
          </Button>
        </FadeIn>
      </form>
    </div>
  );
}
