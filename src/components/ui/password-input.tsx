"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends React.ComponentProps<"input"> {
  /** Optional wrapper container class name */
  wrapperClassName?: string;
  /** Whether to display the show/hide password toggle button */
  showToggle?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, wrapperClassName, showToggle = true, disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className={cn("relative flex items-center w-full", wrapperClassName)}>
        <Input
          type={showPassword ? "text" : "password"}
          className={cn(showToggle && "pr-10", className)}
          disabled={disabled}
          ref={ref}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted/70 hover:text-foreground active:scale-95 transition-all duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-40"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {showPassword ? (
                <motion.span
                  key="eye-off"
                  initial={{ opacity: 0, scale: 0.7, rotate: -15 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.7, rotate: 15 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <EyeOff className="size-4" aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span
                  key="eye"
                  initial={{ opacity: 0, scale: 0.7, rotate: 15 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.7, rotate: -15 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <Eye className="size-4" aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
