import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Play, AudioLines, Sparkles, UserCheck, MessageSquare, ClipboardCheck, ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  alternates: { canonical: "/" },
  keywords: [...siteConfig.keywords],
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.shortDescription,
    images: [siteConfig.ogImage],
    creator: "@meetlog_app",
  },
};

export default function HomePage() {
  return (
    <div className="relative flex flex-col items-center overflow-x-hidden bg-background">
      {}
      <div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:6rem_6rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />

      {}
      <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 text-center max-w-5xl mx-auto flex flex-col items-center">
        <FadeIn direction="down" className="mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3" /> Powered by Sarvam AI & Gemini
          </span>
        </FadeIn>

        <FadeIn direction="down" delay={0.05} className="mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground max-w-4xl leading-[1.1] sm:leading-[1.1]">
            Turns hours of meetings into{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              minutes of reading
            </span>
          </h1>
        </FadeIn>

        <FadeIn direction="down" delay={0.1} className="mb-10">
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Upload your audio files to automatically generate speaker-diarized transcripts, high-quality markdown summaries, and structured action items in minutes.
          </p>
        </FadeIn>

        <FadeIn direction="down" delay={0.15} className="flex flex-col sm:flex-row items-center gap-4">
          <Button size="lg" asChild className="h-12 px-6 rounded-lg text-sm font-semibold shadow">
            <Link href="/onboarding" className="flex items-center gap-2">
              Start Free Trial <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-12 px-6 rounded-lg text-sm font-semibold bg-card">
            <a href="#how-it-works" className="flex items-center gap-2">
              How it works
            </a>
          </Button>
        </FadeIn>
      </section>

      {}
      <section className="px-6 pb-24 w-full max-w-5xl">
        <FadeIn delay={0.2} className="relative rounded-2xl border border-border bg-card/65 p-4 shadow-2xl backdrop-blur-sm overflow-hidden">
          <div className="border border-border rounded-xl overflow-hidden bg-background aspect-[16/10] shadow flex flex-col">
            {}
            <div className="h-11 border-b border-border bg-muted/40 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-red-500/25" />
                <span className="size-3 rounded-full bg-yellow-500/25" />
                <span className="size-3 rounded-full bg-green-500/25" />
                <span className="text-[11px] text-muted-foreground font-mono ml-4">workspace/engineering-sync/meetings/q3-roadmap</span>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {}
              <div className="w-[180px] border-r border-border bg-muted/15 p-3 hidden sm:flex flex-col space-y-4">
                <div className="size-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">ML</div>
                <div className="space-y-1">
                  <div className="h-7 rounded bg-accent/60 w-full" />
                  <div className="h-7 rounded w-[80%]" />
                  <div className="h-7 rounded w-[60%]" />
                </div>
              </div>

              {}
              <div className="flex-1 flex overflow-hidden">
                {}
                <div className="flex-1 p-6 space-y-5 overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded bg-secondary shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">Abhishek (Speaker 1)</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-1 rounded">00:02</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Hey team, let's align on the Q3 release schedule. We need to deploy the migration and test the signed uploads.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded bg-secondary shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">John Doe (Speaker 2)</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-1 rounded">00:15</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">I have implemented the Cloudinary direct signature endpoints. It is performing signed chunked uploads cleanly.</p>
                    </div>
                  </div>
                </div>

                {}
                <div className="w-[200px] border-l border-border bg-muted/5 p-4 space-y-4 hidden md:block">
                  <div className="h-5 border-b border-border text-[10px] font-bold text-foreground">AI Action Items</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="size-3 border border-primary rounded shrink-0" />
                      <div className="h-3 bg-muted rounded w-full" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-3 border border-primary rounded shrink-0" />
                      <div className="h-3 bg-muted rounded w-[80%]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {}
      <section className="px-6 py-20 bg-muted/20 w-full flex flex-col items-center">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-16">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Fully Automated Meeting Analysis</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Everything you need to capture, edit, search, and analyze your team's spoken discussions in one premium panel.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {}
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                <UserCheck className="size-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Speaker Diarization</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                Sarvam AI's speech engines isolate up to 20 different speakers. Rename labels globally with a single click.
              </p>
            </div>

            {}
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                <Play className="size-5 fill-current" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Audio-Synced Timestamps</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                Click on any transcript word or timestamp to automatically seek the audio player to that exact spoken moment.
              </p>
            </div>

            {}
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                <ClipboardCheck className="size-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">AI Summaries & Actions</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                Gemini automatically extracts action items with speaker assignments and writes detailed markdown summaries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {}
      <section id="how-it-works" className="px-6 py-20 w-full flex flex-col items-center">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-16">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">How MeetLog Works</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
              Three simple steps to save hours of manual documentation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            <div className="flex flex-col items-center text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">1</div>
              <h3 className="font-semibold text-base text-foreground">Direct Signed Upload</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Upload raw meeting recordings directly to Cloudinary. Bypasses backend delays and file size timeouts.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">2</div>
              <h3 className="font-semibold text-base text-foreground">Sarvam AI Transcription</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Asynchronous batch processing transcribes long audios and groups them under chronological speaker labels.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">3</div>
              <h3 className="font-semibold text-base text-foreground">Review & Edit</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Interact with the transcript, correct AI wording, track task items, and export formatted PDF reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {}
      <section className="px-6 py-20 w-full flex flex-col items-center border-t border-border bg-muted/10">
        <div className="max-w-3xl w-full text-center bg-card border border-border p-8 md:p-12 rounded-2xl shadow-xl flex flex-col items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-gradient from-primary/5 to-transparent -z-10 pointer-events-none" />
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Ready to automate your summaries?</h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-md leading-relaxed">
            Create your workspace in seconds, upload your files directly, and let AI do the rest. No credit card required.
          </p>
          <Button size="lg" asChild className="mt-8 h-12 px-6 rounded-lg text-sm font-semibold shadow">
            <Link href="/onboarding">
              Get Started Free <ArrowUpRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
