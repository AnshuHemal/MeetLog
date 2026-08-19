
const DONE_STATUSES = new Set(["DONE", "CANCELLED"]);

export function isOverdue(dueDate: Date | null | undefined, status: string): boolean {
  if (!dueDate || DONE_STATUSES.has(status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export function isDueThisWeek(dueDate: Date | null | undefined, status: string): boolean {
  if (!dueDate || DONE_STATUSES.has(status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const d = new Date(dueDate);
  return d >= today && d <= weekEnd;
}

export function getDaysUntilDue(dueDate: Date | null | undefined): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function getDueDateLabel(dueDate: Date | null | undefined, status: string): string | null {
  if (!dueDate) return null;
  if (DONE_STATUSES.has(status)) return null;
  const days = getDaysUntilDue(dueDate);
  if (days === null) return null;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 7) return `Due in ${days} days`;
  return formatDueDate(dueDate);
}

export function formatDueDate(dueDate: Date | null | undefined): string {
  if (!dueDate) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dueDate));
}

export function toInputDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function fromInputDate(value: string): Date | null {
  if (!value) return null;
  return new Date(value + "T00:00:00");
}

const TERMINAL_STATUSES = new Set(["DONE", "CANCELLED", "BACKLOG"]);

export function getDaysInStatus(
  statusChangedAt: Date | null | undefined,
  status: string,
): number | null {
  if (!statusChangedAt || TERMINAL_STATUSES.has(status)) return null;
  const today = new Date();
  return Math.floor((today.getTime() - new Date(statusChangedAt).getTime()) / 86_400_000);
}

export type AgingLevel = "none" | "warn" | "critical";

export function getAgingLevel(
  statusChangedAt: Date | null | undefined,
  status: string,
  warnDays = 5,
  criticalDays = 10,
): AgingLevel {
  const days = getDaysInStatus(statusChangedAt, status);
  if (days === null) return "none";
  if (days >= criticalDays) return "critical";
  if (days >= warnDays) return "warn";
  return "none";
}

export function getAgingLabel(
  statusChangedAt: Date | null | undefined,
  status: string,
): string | null {
  const days = getDaysInStatus(statusChangedAt, status);
  if (days === null) return null;
  if (days === 0) return "Since today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
