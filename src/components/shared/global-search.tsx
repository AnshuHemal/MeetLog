"use client";

import {
  useEffect, useState, useCallback, useTransition,
  useRef, useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Loader2, X, Clock, Zap, FolderKanban,
  Plus, ArrowRight,
  CheckCircle2, Circle, Eye, XCircle, AlertCircle,
  ArrowUp, ArrowDown, Minus, Bug, BookOpen, GitBranch,
  Activity, ChevronRight, Settings, Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SearchIssue {
  id: string;
  key: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  project: {
    id: string;
    key: string;
    name: string;
    workspace: { slug: string };
  };
  assignee: { id: string; name: string; image: string | null } | null;
}

interface SearchProject {
  id: string;
  name: string;
  key: string;
  workspace: { slug: string };
  _count: { issues: number };
}

interface SearchMember {
  id: string;
  name: string;
  image: string | null;
  email: string;
}

interface RecentIssue {
  id: string;
  key: string;
  title: string;
  status: string;
  projectKey: string;
  workspaceSlug: string;
  viewedAt: number;
}

interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  shortcut?: string;
  action: () => void;
}

interface Member {
  id: string;
  name: string;
  image: string | null;
  email?: string;
}

interface GlobalSearchProps {
  workspaceId?: string;
  workspaceSlug?: string;
  projects?: { id: string; name: string; key: string }[];
  members?: Member[];
}

const RECENT_KEY = "meetlog:recent-meetings";
const MAX_RECENT = 5;

const STATUS_ICONS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  BACKLOG:     { icon: Circle,       color: "text-muted-foreground", label: "Backlog"     },
  TODO:        { icon: Circle,       color: "text-foreground/60",    label: "To Do"       },
  IN_PROGRESS: { icon: Activity,     color: "text-primary",          label: "In Progress" },
  IN_REVIEW:   { icon: Eye,          color: "text-yellow-500",       label: "In Review"   },
  DONE:        { icon: CheckCircle2, color: "text-emerald-500",      label: "Done"        },
  CANCELLED:   { icon: XCircle,      color: "text-muted-foreground", label: "Cancelled"   },
};

const PRIORITY_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  URGENT:      { icon: AlertCircle, color: "text-destructive"      },
  HIGH:        { icon: ArrowUp,     color: "text-orange-500"       },
  MEDIUM:      { icon: ArrowRight,  color: "text-yellow-500"       },
  LOW:         { icon: ArrowDown,   color: "text-primary"          },
  NO_PRIORITY: { icon: Minus,       color: "text-muted-foreground" },
};

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  TASK:    { icon: CheckCircle2, color: "text-primary"          },
  BUG:     { icon: Bug,          color: "text-destructive"      },
  STORY:   { icon: BookOpen,     color: "text-purple-500"       },
  EPIC:    { icon: Zap,          color: "text-purple-500"       },
  SUBTASK: { icon: GitBranch,    color: "text-muted-foreground" },
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function getRecent(): RecentIssue[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function trackRecentIssue(issue: Omit<RecentIssue, "viewedAt">) {
  try {
    const existing = getRecent().filter((r) => r.id !== issue.id);
    const updated: RecentIssue[] = [
      { ...issue, viewedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {

  }
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let hi = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const idx = h.indexOf(n[ni], hi);
    if (idx === -1) return false;
    hi = idx + 1;
  }
  return true;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const result: React.ReactNode[] = [];
  let i = 0;
  let qi = 0;
  while (i < text.length) {
    if (qi < q.length && text[i].toLowerCase() === q[qi]) {
      result.push(
        <span key={i} className="text-primary font-semibold">
          {text[i]}
        </span>,
      );
      qi++;
    } else {
      result.push(text[i]);
    }
    i++;
  }
  return <>{result}</>;
}

function ResultItem({
  isActive,
  onClick,
  onMouseEnter,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 first:mt-0">
      {children}
    </p>
  );
}

export function GlobalSearch({
  workspaceId,
  workspaceSlug,
  projects = [],
  members = [],
}: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    issues: SearchIssue[];
    projects: SearchProject[];
    members: SearchMember[];
  }>({ issues: [], projects: [], members: [] });
  const [isSearching, startSearchTransition] = useTransition();
  const [recent, setRecent] = useState<RecentIssue[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const quickActions = useMemo((): QuickAction[] => {
    const base = workspaceSlug ? `/workspace/${workspaceSlug}` : "";
    const actions: QuickAction[] = [
      {
        id: "create-issue",
        label: "Create issue",
        description: "Open the create issue dialog",
        icon: Plus,
        iconColor: "text-primary",
        iconBg: "bg-primary/10",
        shortcut: "C",
        action: () => {
          handleClose();

          setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
          }, 100);
        },
      },
    ];

    if (base) {
      actions.push(
        {
          id: "go-workload",
          label: "Go to Workload",
          description: "Team workload overview",
          icon: Users,
          iconColor: "text-primary",
          iconBg: "bg-primary/10",
          action: () => { handleClose(); router.push(`${base}/workload`); },
        },
        {
          id: "go-activity",
          label: "Go to Activity",
          description: "Workspace audit log",
          icon: Activity,
          iconColor: "text-primary",
          iconBg: "bg-primary/10",
          action: () => { handleClose(); router.push(`${base}/activity`); },
        },
        {
          id: "go-settings",
          label: "Go to Settings",
          description: "Workspace settings",
          icon: Settings,
          iconColor: "text-muted-foreground",
          iconBg: "bg-muted/40",
          action: () => { handleClose(); router.push(`${base}/settings`); },
        },
      );

      for (const p of projects.slice(0, 4)) {
        actions.push({
          id: `go-project-${p.id}`,
          label: `Go to ${p.name}`,
          description: `Open ${p.key} board`,
          icon: FolderKanban,
          iconColor: "text-primary",
          iconBg: "bg-primary/10",
          action: () => { handleClose(); router.push(`${base}/projects/${p.key}/board`); },
        });
      }
    }

    return actions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projects]);

  const filteredActions = useMemo(() => {
    if (!query) return quickActions.slice(0, 4);
    return quickActions.filter((a) =>
      fuzzyMatch(a.label, query) || fuzzyMatch(a.description ?? "", query),
    );
  }, [query, quickActions]);

  const filteredRecent = useMemo(() => {
    if (!query) return recent;
    return recent.filter(
      (r) => fuzzyMatch(r.title, query) || fuzzyMatch(r.key, query),
    );
  }, [query, recent]);

  const doSearch = useCallback(
    (q: string) => {
      if (!q || q.length < 2) {
        setResults({ issues: [], projects: [], members: [] });
        return;
      }
      startSearchTransition(async () => {
        const params = new URLSearchParams();
        params.set("q", q);
        if (workspaceId) params.set("workspaceId", workspaceId);

        const [searchRes] = await Promise.all([
          fetch(`/api/search?${params.toString()}`),

          Promise.resolve(null),
        ]);

        if (searchRes.ok) {
          const data = await searchRes.json();

          const filteredMembers = members
            .filter(
              (m) => fuzzyMatch(m.name, q) || fuzzyMatch(m.email ?? "", q),
            )
            .slice(0, 5)
            .map((m) => ({ ...m, email: m.email ?? "" }));

          setResults({
            issues: data.issues ?? [],
            projects: data.projects ?? [],
            members: filteredMembers,
          });
        }
      });
    },
    [workspaceId, members],
  );

  useEffect(() => {
    const id = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(id);
  }, [query, doSearch]);

  type NavItem =
    | { kind: "action";  data: QuickAction }
    | { kind: "recent";  data: RecentIssue }
    | { kind: "issue";   data: SearchIssue }
    | { kind: "project"; data: SearchProject }
    | { kind: "member";  data: SearchMember };

  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [];
    if (!query) {
      for (const a of filteredActions) items.push({ kind: "action", data: a });
      for (const r of filteredRecent)  items.push({ kind: "recent", data: r });
    } else {
      for (const a of filteredActions)         items.push({ kind: "action",  data: a });
      for (const i of results.issues)          items.push({ kind: "issue",   data: i });
      for (const p of results.projects)        items.push({ kind: "project", data: p });
      for (const m of results.members)         items.push({ kind: "member",  data: m });
    }
    return items;
  }, [query, filteredActions, filteredRecent, results]);

  useEffect(() => { setActiveIndex(0); }, [navItems.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = navItems[activeIndex];
      if (item) activateItem(item);
    } else if (e.key === "Escape") {
      handleClose();
    }
  }

  function activateItem(item: NavItem) {
    if (item.kind === "action") {
      item.data.action();
    } else if (item.kind === "recent") {
      handleClose();
      router.push(
        `/workspace/${item.data.workspaceSlug}/projects/${item.data.projectKey}/issues/${item.data.key}`,
      );
    } else if (item.kind === "issue") {
      handleClose();
      trackRecentIssue({
        id: item.data.id,
        key: `${item.data.project.key}-${item.data.key}`,
        title: item.data.title,
        status: item.data.status,
        projectKey: item.data.project.key,
        workspaceSlug: item.data.project.workspace.slug,
      });
      router.push(
        `/workspace/${item.data.project.workspace.slug}/projects/${item.data.project.key}/issues/${item.data.project.key}-${item.data.key}`,
      );
    } else if (item.kind === "project") {
      handleClose();
      router.push(
        `/workspace/${item.data.workspace.slug}/projects/${item.data.key}/board`,
      );
    } else if (item.kind === "member") {
      handleClose();
      if (workspaceSlug) {
        router.push(`/workspace/${workspaceSlug}/workload`);
      }
    }
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
    setResults({ issues: [], projects: [], members: [] });
    setActiveIndex(0);
  }

  let globalIdx = 0;
  function nextIdx() { return globalIdx++; }

  const hasResults = query.length >= 2 && (
    results.issues.length > 0 ||
    results.projects.length > 0 ||
    results.members.length > 0
  );
  const noResults = query.length >= 2 && !isSearching && !hasResults && filteredActions.length === 0;

  return (
    <>
      {}
      <button
        onClick={() => setOpen(true)}
        className="hidden h-8 w-52 items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
        aria-label="Open command palette"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          Search
        </span>
        <kbd className="pointer-events-none flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          {isMac() ? "⌘" : "Ctrl"}K
        </kbd>
      </button>

      {}
      <button
        onClick={() => setOpen(true)}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
        aria-label="Open search"
      >
        <Search className="size-4" />
      </button>

      {}
      <AnimatePresence>
        {open && (
          <>
            {}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={handleClose}
            />

            {}
            <motion.div
              key="palette"
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed left-1/2 top-[12vh] z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
              onKeyDown={handleKeyDown}
            >
              {}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
                {isSearching ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                )}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search issues, projects, members… or type a command"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
                <kbd
                  onClick={handleClose}
                  className="hidden shrink-0 cursor-pointer rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent sm:block"
                >
                  esc
                </kbd>
              </div>

              {}
              <div
                ref={listRef}
                className="max-h-[480px] overflow-y-auto overscroll-contain p-2"
              >
                {}
                {noResults && (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Search className="size-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-foreground">No results for "{query}"</p>
                    <p className="text-sm text-muted-foreground">Try a different search term</p>
                  </div>
                )}

                {}
                {filteredActions.length > 0 && (
                  <div>
                    <SectionLabel>
                      {query ? "Actions" : "Quick actions"}
                    </SectionLabel>
                    {filteredActions.map((action) => {
                      const idx = nextIdx();
                      const Icon = action.icon;
                      return (
                        <ResultItem
                          key={action.id}
                          isActive={activeIndex === idx}
                          onClick={() => activateItem({ kind: "action", data: action })}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <div className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg",
                            action.iconBg,
                          )}>
                            <Icon className={cn("size-4", action.iconColor)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              <HighlightMatch text={action.label} query={query} />
                            </p>
                            {action.description && (
                              <p className="text-sm text-muted-foreground">{action.description}</p>
                            )}
                          </div>
                          {action.shortcut && (
                            <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {action.shortcut}
                            </kbd>
                          )}
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                        </ResultItem>
                      );
                    })}
                  </div>
                )}

                {}
                {!query && filteredRecent.length > 0 && (
                  <div>
                    <SectionLabel>Recent</SectionLabel>
                    {filteredRecent.map((r) => {
                      const idx = nextIdx();
                      const statusCfg = STATUS_ICONS[r.status] ?? STATUS_ICONS.TODO;
                      const StatusIcon = statusCfg.icon;
                      return (
                        <ResultItem
                          key={r.id}
                          isActive={activeIndex === idx}
                          onClick={() => activateItem({ kind: "recent", data: r })}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <Clock className="size-4 shrink-0 text-muted-foreground/50" />
                          <span className="w-16 shrink-0 font-mono text-sm text-muted-foreground">
                            {r.key}
                          </span>
                          <span className="flex-1 truncate text-sm text-foreground">{r.title}</span>
                          <StatusIcon className={cn("size-3.5 shrink-0", statusCfg.color)} />
                        </ResultItem>
                      );
                    })}
                  </div>
                )}

                {}
                {query.length >= 2 && (
                  <>
                    {}
                    {results.issues.length > 0 && (
                      <div>
                        <SectionLabel>Issues ({results.issues.length})</SectionLabel>
                        {results.issues.map((issue) => {
                          const idx = nextIdx();
                          const statusCfg   = STATUS_ICONS[issue.status]     ?? STATUS_ICONS.TODO;
                          const priorityCfg = PRIORITY_ICONS[issue.priority] ?? PRIORITY_ICONS.MEDIUM;
                          const typeCfg     = TYPE_ICONS[issue.type]         ?? TYPE_ICONS.TASK;
                          const StatusIcon   = statusCfg.icon;
                          const PriorityIcon = priorityCfg.icon;
                          const TypeIcon     = typeCfg.icon;

                          return (
                            <ResultItem
                              key={issue.id}
                              isActive={activeIndex === idx}
                              onClick={() => activateItem({ kind: "issue", data: issue })}
                              onMouseEnter={() => setActiveIndex(idx)}
                            >
                              <div className="flex shrink-0 items-center gap-1">
                                <PriorityIcon className={cn("size-3.5", priorityCfg.color)} />
                                <TypeIcon className={cn("size-3.5", typeCfg.color)} />
                              </div>
                              <span className="w-16 shrink-0 font-mono text-sm text-muted-foreground">
                                {issue.project.key}-{issue.key}
                              </span>
                              <span className="flex-1 truncate text-sm text-foreground">
                                <HighlightMatch text={issue.title} query={query} />
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <StatusIcon className={cn("size-3.5", statusCfg.color)} />
                                <span className="hidden text-sm text-muted-foreground sm:block">
                                  {statusCfg.label}
                                </span>
                              </div>
                              {issue.assignee ? (
                                <Avatar className="size-5 shrink-0">
                                  <AvatarImage src={issue.assignee.image ?? undefined} />
                                  <AvatarFallback className="text-[9px]">
                                    {getInitials(issue.assignee.name)}
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className="size-5 shrink-0 rounded-full border border-dashed border-border" />
                              )}
                            </ResultItem>
                          );
                        })}
                      </div>
                    )}

                    {}
                    {results.projects.length > 0 && (
                      <div>
                        <SectionLabel>Projects</SectionLabel>
                        {results.projects.map((project) => {
                          const idx = nextIdx();
                          return (
                            <ResultItem
                              key={project.id}
                              isActive={activeIndex === idx}
                              onClick={() => activateItem({ kind: "project", data: project })}
                              onMouseEnter={() => setActiveIndex(idx)}
                            >
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                                {project.key.charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  <HighlightMatch text={project.name} query={query} />
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {project._count.issues} issues
                                </p>
                              </div>
                              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                                {project.key}
                              </Badge>
                            </ResultItem>
                          );
                        })}
                      </div>
                    )}

                    {}
                    {results.members.length > 0 && (
                      <div>
                        <SectionLabel>Members</SectionLabel>
                        {results.members.map((member) => {
                          const idx = nextIdx();
                          return (
                            <ResultItem
                              key={member.id}
                              isActive={activeIndex === idx}
                              onClick={() => activateItem({ kind: "member", data: member })}
                              onMouseEnter={() => setActiveIndex(idx)}
                            >
                              <Avatar className="size-7 shrink-0">
                                <AvatarImage src={member.image ?? undefined} />
                                <AvatarFallback className="text-sm font-semibold">
                                  {getInitials(member.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  <HighlightMatch text={member.name} query={query} />
                                </p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {member.email}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm text-muted-foreground">
                                View workload
                              </span>
                              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                            </ResultItem>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {}
                {!query && filteredRecent.length === 0 && filteredActions.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Search className="size-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Type to search issues, projects, or members
                    </p>
                  </div>
                )}
              </div>

              {}
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">↵</kbd>
                    open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">esc</kbd>
                    close
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {isSearching && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  {navItems.length > 0 && (
                    <span>{navItems.length} result{navItems.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
