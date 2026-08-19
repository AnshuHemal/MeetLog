import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/config/site";
import { SignupForm } from "./_components/signup-form";
import { OAuthButtons } from "../_components/oauth-buttons";
import { FadeIn } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: "Sign up free",
  description: `Create your free ${siteConfig.name} account. No credit card required. Set up your workspace and start shipping in minutes.`,
  robots: { index: false, follow: false },
  openGraph: {
    title: `Sign up free — ${siteConfig.name}`,
    description: `Create your free ${siteConfig.name} account. No credit card required.`,
    url: `${siteConfig.url}/signup`,
  },
};

export default function SignupPage() {
  return (
    <FadeIn className="flex flex-col gap-6">

      {}
      <div className="rounded-2xl border border-border bg-card px-8 py-10 shadow-md">

        {}
        <FadeIn direction="down" delay={0.05} className="mb-8 flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground">
            Start for free — no credit card required
          </p>
        </FadeIn>

        {}
        <FadeIn delay={0.1}>
          <OAuthButtons />
        </FadeIn>

        {}
        <FadeIn direction="none" delay={0.15} className="my-6 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-sm text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </FadeIn>

        {}
        <FadeIn delay={0.2}>
          <SignupForm />
        </FadeIn>

        {}
        <FadeIn direction="none" delay={0.25}>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            By signing up you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </FadeIn>

      </div>

      {}
      <FadeIn direction="none" delay={0.3}>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </FadeIn>

    </FadeIn>
  );
}
