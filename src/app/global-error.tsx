"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ErrorScreen
          error={error}
          reset={reset}
          title="Application error"
          description="A critical error occurred. Please try refreshing the page."
        />
      </body>
    </html>
  );
}
