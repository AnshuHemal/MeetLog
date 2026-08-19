import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { siteConfig } from "@/config/site";
import { OnboardingWizard } from "./_components/onboarding-wizard";

export const metadata: Metadata = {
  title: "Welcome to MeetLog",
  description: `Set up your ${siteConfig.name} workspace to get started.`,
};

export default async function OnboardingPage() {
  await requireUser();

  return <OnboardingWizard />;
}
