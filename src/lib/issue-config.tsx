import {
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  BookOpen,
  Zap,
  Bug,
  GitBranch,
  ArrowRight,
} from "lucide-react";

export const ISSUE_STATUSES = [
  { value: "BACKLOG",     label: "Backlog",     icon: Circle,       color: "text-muted-foreground" },
  { value: "TODO",        label: "To Do",       icon: Circle,       color: "text-foreground" },
  { value: "IN_PROGRESS", label: "In Progress", icon: Clock,        color: "text-primary" },
  { value: "IN_REVIEW",   label: "In Review",   icon: Eye,          color: "text-yellow-500" },
  { value: "DONE",        label: "Done",        icon: CheckCircle2, color: "text-primary" },
  { value: "CANCELLED",   label: "Cancelled",   icon: XCircle,      color: "text-muted-foreground" },
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number]["value"];

export function getStatusConfig(status: string) {
  return ISSUE_STATUSES.find((s) => s.value === status) ?? ISSUE_STATUSES[0];
}

export const ISSUE_PRIORITIES = [
  { value: "URGENT",      label: "Urgent",      icon: AlertCircle, color: "text-destructive" },
  { value: "HIGH",        label: "High",        icon: ArrowUp,     color: "text-orange-500" },
  { value: "MEDIUM",      label: "Medium",      icon: ArrowRight,  color: "text-yellow-500" },
  { value: "LOW",         label: "Low",         icon: ArrowDown,   color: "text-primary" },
  { value: "NO_PRIORITY", label: "No priority", icon: Minus,       color: "text-muted-foreground" },
] as const;

export type IssuePriority = (typeof ISSUE_PRIORITIES)[number]["value"];

export function getPriorityConfig(priority: string) {
  return ISSUE_PRIORITIES.find((p) => p.value === priority) ?? ISSUE_PRIORITIES[2];
}

export const ISSUE_TYPES = [
  { value: "TASK",    label: "Task",    icon: CheckCircle2, color: "text-primary" },
  { value: "BUG",     label: "Bug",     icon: Bug,          color: "text-destructive" },
  { value: "STORY",   label: "Story",   icon: BookOpen,     color: "text-primary" },
  { value: "EPIC",    label: "Epic",    icon: Zap,          color: "text-purple-500" },
  { value: "SUBTASK", label: "Subtask", icon: GitBranch,    color: "text-muted-foreground" },
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number]["value"];

export function getTypeConfig(type: string) {
  return ISSUE_TYPES.find((t) => t.value === type) ?? ISSUE_TYPES[0];
}

export function formatActivityType(type: string): string {
  const map: Record<string, string> = {
    issue_created:    "created this issue",
    status_changed:   "changed status",
    priority_changed: "changed priority",
    assignee_changed: "changed assignee",
    comment_added:    "added a comment",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

export function formatActivityValue(value: string | null | undefined): string {
  if (!value) return "none";

  const status = ISSUE_STATUSES.find((s) => s.value === value);
  if (status) return status.label;

  const priority = ISSUE_PRIORITIES.find((p) => p.value === value);
  if (priority) return priority.label;

  const type = ISSUE_TYPES.find((t) => t.value === value);
  if (type) return type.label;

  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
