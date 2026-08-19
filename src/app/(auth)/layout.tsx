import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { FadeIn } from "@/components/motion/fade-in";
import { getSession } from "@/lib/session";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

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
      <main className="relative z-10 w-full max-w-sm">
        {children}
      </main>

      {}
      <FadeIn direction="none" delay={0.35} className="relative z-10 mt-8 flex items-center gap-4 text-sm text-muted-foreground">
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
