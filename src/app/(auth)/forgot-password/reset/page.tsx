import type { Metadata } from "next";
import { Suspense } from "react";
import { siteConfig } from "@/config/site";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: `Set a new password for your ${siteConfig.name} account.`,
};

export default function ResetPasswordPage() {
  return (

    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
