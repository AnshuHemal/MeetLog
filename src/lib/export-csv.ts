
export interface CsvRow {
  [key: string]: string | number | boolean | null | undefined;
}

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: CsvRow[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key])).join(","),
  );
  return [header, ...body].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExportableIssue {
  key: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee?: { name: string } | null;
  reporter?: { name: string } | null;
  dueDate?: Date | null;
  estimate?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  commentCount?: number;
}

const ISSUE_COLUMNS: { key: string; label: string }[] = [
  { key: "key",          label: "Key"          },
  { key: "title",        label: "Title"        },
  { key: "type",         label: "Type"         },
  { key: "status",       label: "Status"       },
  { key: "priority",     label: "Priority"     },
  { key: "assignee",     label: "Assignee"     },
  { key: "reporter",     label: "Reporter"     },
  { key: "estimate",     label: "Estimate (pts)"},
  { key: "dueDate",      label: "Due Date"     },
  { key: "commentCount", label: "Comments"     },
  { key: "createdAt",    label: "Created"      },
  { key: "updatedAt",    label: "Updated"      },
];

function formatExportDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function exportIssuesToCsv(
  issues: ExportableIssue[],
  projectKey: string,
  filename?: string,
): void {
  const rows: CsvRow[] = issues.map((i) => ({
    key:          `${projectKey}-${i.key}`,
    title:        i.title,
    type:         formatStatus(i.type),
    status:       formatStatus(i.status),
    priority:     formatStatus(i.priority),
    assignee:     i.assignee?.name ?? "",
    reporter:     i.reporter?.name ?? "",
    estimate:     i.estimate ?? "",
    dueDate:      formatExportDate(i.dueDate),
    commentCount: i.commentCount ?? 0,
    createdAt:    formatExportDate(i.createdAt),
    updatedAt:    formatExportDate(i.updatedAt),
  }));

  const csv = toCsv(rows, ISSUE_COLUMNS);
  const name = filename ?? `${projectKey}-issues-${formatExportDate(new Date())}.csv`;
  downloadCsv(csv, name);
}
