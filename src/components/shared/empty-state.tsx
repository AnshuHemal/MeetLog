"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;

  bordered?: boolean;
  delay?: number;
}

export function EmptyState({
  icon: Icon,
  iconColor = "text-muted-foreground/50",
  iconBg = "bg-muted/60",
  title,
  description,
  action,
  size = "md",
  className,
  bordered = false,
  delay = 0,
}: EmptyStateProps) {
  const iconSizes = {
    sm: "size-10",
    md: "size-14",
    lg: "size-20",
  };
  const iconInnerSizes = {
    sm: "size-5",
    md: "size-7",
    lg: "size-10",
  };
  const iconRounded = {
    sm: "rounded-xl",
    md: "rounded-2xl",
    lg: "rounded-2xl",
  };
  const padding = {
    sm: "py-10",
    md: "py-16",
    lg: "py-24",
  };

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        padding[size],
        className,
      )}
    >
      {}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, delay: delay + 0.05, ease: [0.25, 0.1, 0.25, 1] }}
        className={cn(
          "flex shrink-0 items-center justify-center",
          iconSizes[size],
          iconRounded[size],
          iconBg,
        )}
      >
        <Icon className={cn(iconInnerSizes[size], iconColor)} />
      </motion.div>

      {}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: delay + 0.1 }}
        className="mt-4 flex flex-col items-center gap-1.5"
      >
        <h3 className={cn(
          "font-semibold text-foreground",
          size === "sm" ? "text-sm" : "text-base",
        )}>
          {title}
        </h3>
        {description && (
          <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
        )}
      </motion.div>

      {}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: delay + 0.18 }}
          className="mt-6"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );

  if (bordered) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card">
        {content}
      </div>
    );
  }

  return content;
}
