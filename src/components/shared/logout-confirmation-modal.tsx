"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LogOut, X, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";

interface LogoutConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  redirectUrl?: string;
}

function getInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "U";
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

export function LogoutConfirmationModal({
  open,
  onClose,
  user,
  redirectUrl = "/",
}: LogoutConfirmationModalProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Close on ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !isLoggingOut) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isLoggingOut, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setIsLoggingOut(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleConfirmLogout() {
    try {
      setIsLoggingOut(true);
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = redirectUrl;
          },
          onError: () => {
            setIsLoggingOut(false);
            window.location.href = redirectUrl;
          },
        },
      });
    } catch {
      setIsLoggingOut(false);
      window.location.href = redirectUrl;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => {
              if (!isLoggingOut) onClose();
            }}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
          >
            {/* Top decorative accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={isLoggingOut}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </button>

            <div className="p-6">
              {/* Icon Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-xs">
                  <LogOut className="size-6" />
                </div>
                <div>
                  <h3 id="logout-title" className="text-lg font-bold text-foreground">
                    Sign out of MeetLog?
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Are you sure you want to end your active session?
                  </p>
                </div>
              </div>

              {/* User Account Card */}
              {user && (
                <div className="my-4 flex items-center gap-3 rounded-xl border border-border/80 bg-muted/40 p-3">
                  <Avatar className="size-10 border border-border shrink-0">
                    <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                      {getInitials(user.name ?? user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {user.name ?? "Current User"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.email ?? "No email provided"}
                    </div>
                  </div>
                </div>
              )}

              {/* Info text */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                You will need to sign back in with your credentials to access your workspaces, meeting summaries, and AI action items.
              </p>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isLoggingOut}
                  className="rounded-xl px-4 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmLogout}
                  disabled={isLoggingOut}
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  {isLoggingOut ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="size-3.5" />
                      Sign out
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
