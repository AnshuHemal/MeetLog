import React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MeetLogLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  href?: string;
}

export function MeetLogLogo({
  className,
  size = 32,
  showText = true,
  href,
}: MeetLogLogoProps) {
  const content = (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <div
        className="relative shrink-0 flex items-center justify-center rounded-xl overflow-hidden shadow-xs"
        style={{ width: size, height: size }}
      >
        <Image
          src="/logo.svg"
          alt="MeetLog Logo"
          width={size}
          height={size}
          priority
          className="size-full object-contain"
        />
      </div>
      {showText && (
        <div className="flex items-center tracking-tight">
          <span className="text-base font-extrabold text-foreground font-sans">
            Meet<span className="text-primary font-black">Log</span>
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
