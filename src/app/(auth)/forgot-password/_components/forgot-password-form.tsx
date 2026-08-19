"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { KeyRound, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailOtp } from "@/lib/auth-client";
import { FadeIn } from "@/components/motion/fade-in";
import { checkEmailExists } from "../actions";

export function ForgotPasswordForm() {
  const [email, setEmail]         = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const trimmedEmail = email.toLowerCase().trim();

    const { exists, error: checkError } = await checkEmailExists(trimmedEmail);

    if (checkError) {
      setError(checkError);
      setIsPending(false);
      return;
    }

    if (!exists) {

      setError("If this email is registered, you'll receive a reset code shortly.");
      setIsPending(false);
      return;
    }

    const { error: authError } = await emailOtp.sendVerificationOtp({
      email: trimmedEmail,
      type: "forget-password",
    });

    if (authError) {
      setError(authError.message ?? "Failed to send reset code. Please try again.");
      setIsPending(false);
      return;
    }

    window.location.href = `/forgot-password/verify?email=${encodeURIComponent(trimmedEmail)}`;
  }

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 shadow-md">

        {}
        <FadeIn direction="down" delay={0.05} className="mb-8 flex flex-col items-center gap-3 text-center">
          <motion.div
            className="flex size-14 items-center justify-center rounded-2xl bg-primary/10"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <KeyRound className="size-7 text-primary" />
          </motion.div>

          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Forgot your password?
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a reset code.
            </p>
          </div>
        </FadeIn>

        {}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FadeIn delay={0.1} className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={isPending}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
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

          <FadeIn delay={0.15}>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    className="inline-block"
                  >
                    <RotateCcw className="size-4" />
                  </motion.span>
                  Sending…
                </span>
              ) : (
                "Send reset code"
              )}
            </Button>
          </FadeIn>
        </form>

      </div>

      {}
      <FadeIn direction="none" delay={0.2}>
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
