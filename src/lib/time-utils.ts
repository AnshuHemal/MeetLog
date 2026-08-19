
export function formatSecondsToTime(seconds: number, forceHours = false): string {
  if (isNaN(seconds) || seconds < 0) {
    return forceHours ? "00:00:00" : "00:00";
  }

  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0 || forceHours) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatPrecisionTime(seconds: number, forceHours = false): string {
  if (isNaN(seconds) || seconds < 0) {
    return forceHours ? "00:00:00.0" : "00:00.0";
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);

  if (hrs > 0 || forceHours) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

export function formatDurationHuman(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "0s";

  const totalSecs = Math.round(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    if (mins === 0 && secs === 0) return `${hrs}h`;
    if (secs === 0) return `${hrs}h ${mins}m`;
    return `${hrs}h ${mins}m ${secs}s`;
  }

  if (mins > 0) {
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseTimeInput(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (/^\d+$/.test(s)) return parseInt(s, 10);

  let total = 0;
  const hMatch = s.match(/(\d+)\s*h/);
  const mMatch = s.match(/(\d+)\s*m/);
  if (hMatch) total += parseInt(hMatch[1], 10) * 60;
  if (mMatch) total += parseInt(mMatch[1], 10);
  return total > 0 ? total : null;
}
