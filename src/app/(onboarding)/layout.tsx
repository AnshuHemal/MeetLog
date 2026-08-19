import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { FadeIn } from "@/components/motion/fade-in";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">

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
      <FadeIn
        direction="down"
        className="relative z-10 flex items-center justify-between px-6 py-5"
      >
        <Logo size={24} asLink={false} />
        <ThemeToggle />
      </FadeIn>

      {}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {children}
        </div>
      </main>

      {}
      <FadeIn
        direction="none"
        delay={0.35}
        className="relative z-10 flex items-center justify-center gap-4 px-6 py-5 text-sm text-muted-foreground"
      >
        <Link href="/privacy" className="hover:text-foreground transition-colors">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link href="/help" className="hover:text-foreground transition-colors">
          Help
        </Link>
      </FadeIn>

    </div>
  );
}
