export interface PipelineLog {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "ai" | "audio" | "storage";
  category: string;
  message: string;
}

// In-memory ring buffer of logs for active meeting jobs
const meetingLogs = new Map<string, PipelineLog[]>();

export function formatLogTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function addMeetingLog(
  meetingId: string,
  level: PipelineLog["level"],
  category: string,
  message: string
): void {
  if (!meetingId) return;

  const timestamp = formatLogTimestamp();
  const entry: PipelineLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    level,
    category,
    message,
  };

  const logs = meetingLogs.get(meetingId) || [];
  logs.push(entry);

  if (logs.length > 250) {
    logs.shift();
  }

  meetingLogs.set(meetingId, logs);
}

export function getMeetingLogs(meetingId: string): PipelineLog[] {
  return meetingLogs.get(meetingId) || [];
}

export function clearMeetingLogs(meetingId: string): void {
  meetingLogs.delete(meetingId);
}
