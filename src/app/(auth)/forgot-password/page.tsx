import type { Metadata } from "next";
import { Suspense } from "react";
import { siteConfig } from "@/config/site";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: `Reset your ${siteConfig.name} account password.`,
};

export default function ForgotPasswordPage() {
  return (

    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
