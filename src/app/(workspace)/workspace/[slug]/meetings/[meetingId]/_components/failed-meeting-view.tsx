"use client";

import { useState, useEffect } from "react";
import { ErrorRecoveryPanel } from "./error-recovery-panel";
import { UploadReplacement } from "./upload-replacement";

interface FailedMeetingViewProps {
  meetingId: string;
  workspaceSlug: string;
  lastError: string | null;
  retryCount: number;
}

export function FailedMeetingView({
  meetingId,
  workspaceSlug,
  lastError,
  retryCount,
}: FailedMeetingViewProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    const handler = () => setUploadOpen(true);
    window.addEventListener("open-upload-replacement", handler);
    return () => window.removeEventListener("open-upload-replacement", handler);
  }, []);

  return (
    <>
      <ErrorRecoveryPanel
        meetingId={meetingId}
        workspaceSlug={workspaceSlug}
        lastError={lastError}
        retryCount={retryCount}
      />
      <UploadReplacement
        meetingId={meetingId}
        workspaceSlug={workspaceSlug}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </>
  );
}
