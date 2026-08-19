
import {
  Circle, Clock, Eye, CheckCircle2, XCircle,
  type LucideIcon,
} from "lucide-react";

export interface WorkflowStatus {

  value: string;

  label: string;

  order: number;

  enabled: boolean;
}

export interface WorkflowTransition {
  from: string;
  to: string;
}

export interface WorkflowConfig {
  statuses: WorkflowStatus[];

  transitions: WorkflowTransition[] | null;
}

export const DEFAULT_WORKFLOW_STATUSES: WorkflowStatus[] = [
  { value: "BACKLOG",     label: "Backlog",     order: 0, enabled: true },
  { value: "TODO",        label: "To Do",       order: 1, enabled: true },
  { value: "IN_PROGRESS", label: "In Progress", order: 2, enabled: true },
  { value: "IN_REVIEW",   label: "In Review",   order: 3, enabled: true },
  { value: "DONE",        label: "Done",        order: 4, enabled: true },
  { value: "CANCELLED",   label: "Cancelled",   order: 5, enabled: true },
];

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  statuses: DEFAULT_WORKFLOW_STATUSES,
  transitions: null,
};

export const STATUS_ICONS_MAP: Record<string, LucideIcon> = {
  BACKLOG:     Circle,
  TODO:        Circle,
  IN_PROGRESS: Clock,
  IN_REVIEW:   Eye,
  DONE:        CheckCircle2,
  CANCELLED:   XCircle,
};

const STATUS_ICONS = STATUS_ICONS_MAP;

const STATUS_COLORS: Record<string, string> = {
  BACKLOG:     "text-muted-foreground",
  TODO:        "text-foreground",
  IN_PROGRESS: "text-primary",
  IN_REVIEW:   "text-yellow-500",
  DONE:        "text-primary",
  CANCELLED:   "text-muted-foreground",
};

export function parseWorkflowConfig(raw: unknown): WorkflowConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_WORKFLOW_CONFIG;

  const obj = raw as Record<string, unknown>;

  let statuses: WorkflowStatus[] = DEFAULT_WORKFLOW_STATUSES;
  if (Array.isArray(obj.statuses)) {
    const parsed = obj.statuses
      .filter((s): s is WorkflowStatus =>
        typeof s === "object" && s !== null &&
        typeof (s as WorkflowStatus).value === "string" &&
        typeof (s as WorkflowStatus).label === "string" &&
        typeof (s as WorkflowStatus).order === "number",
      )
      .map((s) => ({
        value:   s.value,
        label:   s.label,
        order:   s.order,
        enabled: s.enabled !== false,
      }));

    const merged = DEFAULT_WORKFLOW_STATUSES.map((def) => {
      const override = parsed.find((p) => p.value === def.value);
      return override ?? def;
    });
    statuses = merged.sort((a, b) => a.order - b.order);
  }

  let transitions: WorkflowTransition[] | null = null;
  if (Array.isArray(obj.transitions)) {
    transitions = obj.transitions.filter(
      (t): t is WorkflowTransition =>
        typeof t === "object" && t !== null &&
        typeof (t as WorkflowTransition).from === "string" &&
        typeof (t as WorkflowTransition).to === "string",
    );
  }

  return { statuses, transitions };
}

export function getWorkflowStatusConfig(
  value: string,
  config: WorkflowConfig,
): { value: string; label: string; icon: LucideIcon; color: string; order: number; enabled: boolean } {
  const wf = config.statuses.find((s) => s.value === value);
  return {
    value,
    label:   wf?.label   ?? value,
    icon:    STATUS_ICONS[value]  ?? Circle,
    color:   STATUS_COLORS[value] ?? "text-muted-foreground",
    order:   wf?.order   ?? 99,
    enabled: wf?.enabled ?? true,
  };
}

export function getBoardColumns(config: WorkflowConfig) {
  return config.statuses
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      ...s,
      icon:  STATUS_ICONS[s.value]  ?? Circle,
      color: STATUS_COLORS[s.value] ?? "text-muted-foreground",
    }));
}

export function isTransitionAllowed(
  from: string,
  to: string,
  config: WorkflowConfig,
): boolean {
  if (!config.transitions) return true;
  if (from === to) return true;
  return config.transitions.some((t) => t.from === from && t.to === to);
}
