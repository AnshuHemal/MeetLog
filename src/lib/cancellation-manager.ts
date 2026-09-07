/**
 * MeetLog In-Memory Cancellation Manager
 * Maintains active AbortControllers for background transcription tasks
 * allowing immediate cancellation of in-flight Gemini/Sarvam requests.
 */

// Use globalThis to persist across Next.js dev server reloads
const globalForCancellation = globalThis as unknown as {
  meetlogAbortControllers?: Map<string, AbortController>;
};

const activeAbortControllers: Map<string, AbortController> =
  globalForCancellation.meetlogAbortControllers ?? new Map<string, AbortController>();

if (process.env.NODE_ENV !== "production") {
  globalForCancellation.meetlogAbortControllers = activeAbortControllers;
}

/**
 * Registers an AbortController for a given meeting transcription task.
 */
export function registerMeetingAbortController(meetingId: string): AbortController {
  // If an existing one exists, abort it before creating a fresh one
  if (activeAbortControllers.has(meetingId)) {
    try {
      activeAbortControllers.get(meetingId)?.abort();
    } catch {
      // ignore
    }
  }

  const controller = new AbortController();
  activeAbortControllers.set(meetingId, controller);
  return controller;
}

/**
 * Returns the AbortSignal for an active meeting transcription task, if any.
 */
export function getMeetingAbortSignal(meetingId: string): AbortSignal | undefined {
  return activeAbortControllers.get(meetingId)?.signal;
}

/**
 * Checks whether an active transcription job for the meeting has been aborted in memory.
 */
export function isMeetingJobAborted(meetingId: string): boolean {
  const controller = activeAbortControllers.get(meetingId);
  return controller ? controller.signal.aborted : false;
}

/**
 * Aborts and unregisters an active meeting transcription job.
 * Returns true if an active in-memory controller was found and aborted.
 */
export function cancelMeetingJob(meetingId: string): boolean {
  const controller = activeAbortControllers.get(meetingId);
  if (controller) {
    try {
      controller.abort();
    } catch (err: any) {
      console.warn(`[CANCELLATION] Error aborting meeting job ${meetingId}:`, err?.message);
    }
    activeAbortControllers.delete(meetingId);
    return true;
  }
  return false;
}

/**
 * Unregisters the AbortController when a job completes naturally.
 */
export function unregisterMeetingAbortController(meetingId: string): void {
  activeAbortControllers.delete(meetingId);
}
