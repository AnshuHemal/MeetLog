import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { AudioLines } from "lucide-react";

interface LogoProps {
  size?: number;
  asLink?: boolean;
  className?: string;
}

export function Logo({ size = 28, asLink = true, className }: LogoProps) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2 select-none shrink-0 font-sans text-foreground font-extrabold tracking-tight",
        asLink &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm",
        className,
      )}
      style={{ fontSize: `${size * 0.65}px` }}
    >
      <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <AudioLines className="size-4 shrink-0" />
      </div>
      <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
        MEET<span className="text-primary font-bold">LOG</span>
      </span>
    </div>
  );

  if (!asLink) return content;

  return (
    <Link href="/" aria-label={`${siteConfig.name} — go to homepage`}>
      {content}
    </Link>
  );
}
