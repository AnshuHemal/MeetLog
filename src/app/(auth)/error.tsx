"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Authentication error"
      description="Something went wrong. Please try again."
      showHome={false}
    />
  );
}
