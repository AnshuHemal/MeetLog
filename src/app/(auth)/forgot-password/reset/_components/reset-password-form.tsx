"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { LockKeyhole, Eye, EyeOff, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailOtp } from "@/lib/auth-client";
import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";

function getPasswordStrength(password: string): "empty" | "weak" | "fair" | "strong" {
  if (!password) return "empty";
  if (password.length < 8)  return "weak";
  if (password.length < 12) return "fair";
  return "strong";
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const otp   = searchParams.get("otp")   ?? "";

  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [isPending, setIsPending]       = useState(false);
  const [status, setStatus]             = useState<"idle" | "success" | "error">("idle");
  const [error, setError]               = useState<string | null>(null);

  function validate(): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsPending(true);

    const { error: authError } = await emailOtp.resetPassword({
      email,
      otp,
      password,
    });

    if (authError) {
      setError(authError.message ?? "Failed to reset password. Please try again.");
      setStatus("error");
      setIsPending(false);
      return;
    }

    setStatus("success");
    setTimeout(() => { window.location.href = "/login"; }, 1500);
  }

  const strength = getPasswordStrength(password);

  const strengthBarWidth =
    strength === "empty"  ? "0%"   :
    strength === "weak"   ? "33%"  :
    strength === "fair"   ? "66%"  :
    "100%";

  const strengthBarColor =
    strength === "weak"   ? "bg-destructive" :
    strength === "fair"   ? "bg-primary/50"  :
    "bg-primary";

  const isDisabled = isPending || status === "success";

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 shadow-md">

        {}
        <FadeIn direction="down" delay={0.05} className="mb-8 flex flex-col items-center gap-3 text-center">
          <motion.div
            className="flex size-14 items-center justify-center rounded-2xl bg-primary/10"
            animate={status === "success" ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.4 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {status === "success" ? (
                <motion.span
                  key="shield"
                  initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <ShieldCheck className="size-7 text-primary" />
                </motion.span>
              ) : (
                <motion.span
                  key="lock"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <LockKeyhole className="size-7 text-primary" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {status === "success" ? "Password reset!" : "Set new password"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {status === "success"
                ? "Redirecting you to login…"
                : "Choose a strong password for your account."}
            </p>
          </div>
        </FadeIn>

        {}
        <AnimatePresence>
          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary"
            >
              <ShieldCheck className="size-4 shrink-0" />
              Your password has been reset successfully.
            </motion.div>
          )}
        </AnimatePresence>

        {}
        {status !== "success" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {}
            <FadeIn delay={0.1} className="flex flex-col gap-1.5">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  disabled={isDisabled}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isDisabled}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {}
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-border">
                <motion.div
                  className={cn("h-full rounded-full transition-colors duration-300", strengthBarColor)}
                  animate={{ width: strengthBarWidth }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              </div>
            </FadeIn>

            {}
            <FadeIn delay={0.15} className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  name="confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  disabled={isDisabled}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(null);
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  disabled={isDisabled}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FadeIn>

            {}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  <XCircle className="size-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <FadeIn delay={0.2}>
              <Button type="submit" className="w-full" disabled={isDisabled}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                      className="inline-block"
                    >
                      <RotateCcw className="size-4" />
                    </motion.span>
                    Resetting…
                  </span>
                ) : (
                  "Reset password"
                )}
              </Button>
            </FadeIn>
          </form>
        )}

      </div>

      {}
      <FadeIn direction="none" delay={0.25}>
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </FadeIn>
    </FadeIn>
  );
}
