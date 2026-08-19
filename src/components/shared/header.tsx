"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/shared/user-menu";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Changelog", href: "/changelog" },
] as const;

export function Header() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const isAuthed = !!session?.user;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {}
        <Logo size={28} />

        {}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main navigation"
        >
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="h-4 w-px bg-border" aria-hidden />

          {}
          {isPending && (
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" aria-hidden />
          )}

          {}
          {!isPending && isAuthed && <UserMenu />}

          {}
          {!isPending && !isAuthed && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
