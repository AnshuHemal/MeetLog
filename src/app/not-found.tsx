import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";
import { siteConfig } from "@/config/site";
import { FadeIn } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: "404 — Page not found",
  description: "The page you're looking for doesn't exist or has been moved.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">

      {}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-40"
      />

      {}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_40%,var(--background)_100%)]"
      />

      {}
      <FadeIn direction="down" className="absolute left-6 top-6 z-10">
        <Logo size={24} />
      </FadeIn>

      {}
      <main className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 text-center">

        {}
        <FadeIn direction="down" delay={0.05} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-sm font-medium text-muted-foreground backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-destructive" />
          Error 404
        </FadeIn>

        {}
        <FadeIn delay={0.15} className="flex flex-col gap-3">
          <h1 className="text-5xl font-semibold tracking-tighter text-foreground sm:text-6xl">
            Page not Found.
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            This page doesn&apos;t exist or has been moved.<br />
            Let&apos;s get you somewhere useful.
          </p>
        </FadeIn>

        {}
        <FadeIn direction="none" delay={0.25} className="h-px w-16 bg-border" />

        {}
        <FadeIn delay={0.3} className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="min-w-36">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-36">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </FadeIn>

      </main>

      {}
      <FadeIn direction="none" delay={0.4} className="absolute bottom-6 left-0 right-0 z-10 flex items-center justify-center gap-4 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        <span aria-hidden>·</span>
        <Link href="/help" className="hover:text-foreground transition-colors">Help</Link>
        <span aria-hidden>·</span>
        <span>{siteConfig.name}</span>
      </FadeIn>

    </div>
  );
}
