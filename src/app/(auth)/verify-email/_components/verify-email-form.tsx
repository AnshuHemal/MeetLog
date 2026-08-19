"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Mail, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailOtp, signIn } from "@/lib/auth-client";
import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const email    = searchParams.get("email")    ?? "";
  const password = searchParams.get("password") ?? "";

  const [otp, setOtp]               = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [status, setStatus]         = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending]       = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  function handleChange(index: number, value: string) {
    const char = value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-1);
    const next = [...otp];
    next[index] = char;
    setOtp(next);
    setErrorMsg(null);

    if (char && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (char && next.every(Boolean) && next.join("").length === OTP_LENGTH) {
      handleVerify(next.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const next = [...otp];
        next[index] = "";
        setOtp(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft"  && index > 0)              inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, OTP_LENGTH);

    if (!pasted) return;

    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((char, i) => { next[i] = char; });
    setOtp(next);
    setErrorMsg(null);

    const nextEmpty = next.findIndex((c) => !c);
    inputRefs.current[nextEmpty === -1 ? OTP_LENGTH - 1 : nextEmpty]?.focus();

    if (pasted.length === OTP_LENGTH) handleVerify(pasted);
  }

  const handleVerify = useCallback(async (code: string) => {
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setErrorMsg(null);

    const { error: verifyError } = await emailOtp.verifyEmail({ email, otp: code });

    if (verifyError) {
      setStatus("error");
      setErrorMsg(
        verifyError.message === "TOO_MANY_ATTEMPTS"
          ? "Too many incorrect attempts. Please request a new code."
          : "Invalid or expired code. Please try again.",
      );
      setOtp(Array(OTP_LENGTH).fill(""));
      setTimeout(() => {
        setStatus("idle");
        inputRefs.current[0]?.focus();
      }, 700);
      return;
    }

    if (password) {
      const { error: signInError } = await signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      });

      if (!signInError) {
        setStatus("success");
        setTimeout(() => { window.location.href = "/dashboard"; }, 1000);
        return;
      }

    }

    setStatus("success");
    setTimeout(() => { window.location.href = "/login"; }, 1000);
  }, [email, password, status]);

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg(null);

    const { error } = await emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });

    setIsResending(false);

    if (error) {
      setErrorMsg("Failed to resend code. Please try again.");
      return;
    }

    setResendCooldown(RESEND_COOLDOWN);
    setOtp(Array(OTP_LENGTH).fill(""));
    inputRefs.current[0]?.focus();
  }

  const filledCount = otp.filter(Boolean).length;
  const isComplete  = filledCount === OTP_LENGTH;

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
                  key="mail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Mail className="size-7 text-primary" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {status === "success" ? "Email verified!" : "Check your email"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {status === "success"
                ? "Signing you in…"
                : "We sent a 6-character code to"}
            </p>
            {status !== "success" && (
              <p className="text-sm font-semibold text-foreground">
                {email || "your email address"}
              </p>
            )}
          </div>
        </FadeIn>

        {}
        <FadeIn delay={0.1} className="mb-6">
          <div
            className="flex items-center justify-center gap-2.5"
            onPaste={handlePaste}
            role="group"
            aria-label="Verification code"
          >
            {otp.map((char, i) => (
              <motion.input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={char}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={status === "loading" || status === "success"}
                aria-label={`Code character ${i + 1}`}
                animate={
                  status === "error"
                    ? { x: [0, -8, 8, -5, 5, 0] }
                    : status === "success"
                      ? { scale: [1, 1.12, 1], y: [0, -4, 0] }
                      : {}
                }
                transition={{ duration: 0.45, delay: status === "success" ? i * 0.05 : 0 }}
                className={cn(
                  "h-12 w-11 rounded-xl border-2 text-center text-lg font-bold uppercase tracking-widest outline-none transition-all duration-150",
                  "focus:border-primary focus:ring-2 focus:ring-primary/20",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  char && status !== "error" && status !== "success"
                    ? "border-primary/50 bg-primary/5 text-foreground"
                    : "border-border bg-background text-foreground",
                  status === "error"   && "border-destructive/60 bg-destructive/5 text-destructive",
                  status === "success" && "border-primary bg-primary/10 text-primary",
                )}
              />
            ))}
          </div>

          {}
          <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-border">
            <motion.div
              className={cn(
                "h-full rounded-full",
                status === "error" ? "bg-destructive" : "bg-primary",
              )}
              animate={{ width: `${(filledCount / OTP_LENGTH) * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
        </FadeIn>

        {}
        <AnimatePresence mode="wait">
          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary"
            >
              <ShieldCheck className="size-4 shrink-0" />
              Verified! Signing you in…
            </motion.div>
          )}

          {(status === "error" || (status === "idle" && errorMsg)) && errorMsg && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <XCircle className="size-4 shrink-0" />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {}
        <FadeIn delay={0.15}>
          <Button
            className="w-full"
            disabled={!isComplete || status === "loading" || status === "success"}
            onClick={() => handleVerify(otp.join(""))}
          >
            {status === "loading" ? (
              <span className="flex items-center gap-2">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  className="inline-block"
                >
                  <RotateCcw className="size-4" />
                </motion.span>
                Verifying…
              </span>
            ) : status === "success" ? (
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Verified!
              </span>
            ) : (
              "Verify email"
            )}
          </Button>
        </FadeIn>

        {}
        <FadeIn direction="none" delay={0.2} className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the code?{" "}
            {resendCooldown > 0 ? (
              <span className="tabular-nums font-medium text-muted-foreground">
                Resend in {resendCooldown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || status === "loading" || status === "success"}
                className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                {isResending ? "Sending…" : "Resend code"}
              </button>
            )}
          </p>
        </FadeIn>

      </div>

      {}
      <FadeIn direction="none" delay={0.25}>
        <p className="text-center text-sm text-muted-foreground">
          Wrong email?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Go back
          </Link>
        </p>
      </FadeIn>
    </FadeIn>
  );
}
