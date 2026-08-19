"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  CheckSquare, Plus, Search, Filter, ArrowRight, ArrowLeft,
  Clock, CheckCircle2, AlertCircle, Calendar, User, FileAudio,
  MoreVertical, ChevronRight, Sparkles, Flag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  updateTaskStatusAction, updateTaskPriorityAction, createTaskAction,
  type WorkspaceTaskItem
} from "../actions";
import type { ActionItemStatus, ActionItemPriority } from "@/generated/prisma/enums";

interface TasksKanbanClientProps {
  workspaceSlug: string;
  workspaceName: string;
  initialTasks: WorkspaceTaskItem[];
  meetings: Array<{ id: string; title: string }>;
}

const COLUMNS: Array<{ status: ActionItemStatus; title: string; color: string; bg: string; border: string }> = [
  { status: "PENDING",     title: "To Do",       color: "text-blue-500",   bg: "bg-blue-500/10 shadow-blue-500/5",     border: "border-blue-500/20" },
  { status: "IN_PROGRESS", title: "In Progress", color: "text-amber-500",  bg: "bg-amber-500/10 shadow-amber-500/5",   border: "border-amber-500/20" },
  { status: "COMPLETED",   title: "Completed",   color: "text-emerald-500",bg: "bg-emerald-500/10 shadow-emerald-500/5", border: "border-emerald-500/20" },
];

const PRIORITY_STYLES: Record<ActionItemPriority, { label: string; bg: string; text: string }> = {
  HIGH:   { label: "High",   bg: "bg-red-500/10 border-red-500/20",   text: "text-red-600 dark:text-red-400" },
  MEDIUM: { label: "Medium", bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-600 dark:text-amber-400" },
  LOW:    { label: "Low",    bg: "bg-blue-500/10 border-blue-500/20",   text: "text-blue-600 dark:text-blue-400" },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function DroppableColumn({
  col,
  count,
  children,
}: {
  col: (typeof COLUMNS)[0];
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: col.status,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full rounded-2xl border transition-all duration-200 overflow-hidden ${
        isOver
          ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-lg scale-[1.01]"
          : "border-border bg-card/60 shadow-2xs"
      }`}
    >
      {}
      <div className={`flex items-center justify-between p-4 border-b ${col.border} ${col.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-extrabold ${col.color}`}>{col.title}</span>
          <span className="size-5 rounded-full bg-background border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center font-mono shadow-3xs">
            {count}
          </span>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

function DraggableTaskCard({
  task,
  workspaceSlug,
  onPriorityChange,
  onMoveTask,
  isOverlay = false,
}: {
  task: WorkspaceTaskItem;
  workspaceSlug: string;
  onPriorityChange: (id: string, priority: ActionItemPriority) => void;
  onMoveTask: (id: string, status: ActionItemStatus) => void;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const pStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all shadow-3xs group space-y-3 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "opacity-30 border-dashed border-primary" : ""
      } ${isOverlay ? "shadow-2xl border-primary ring-2 ring-primary/20 cursor-grabbing scale-105 bg-card" : ""}`}
    >
      {}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/workspace/${workspaceSlug}/meetings/${task.meetingId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors truncate"
        >
          <FileAudio className="size-3 text-primary shrink-0" />
          <span className="truncate max-w-[140px]">{task.meetingTitle}</span>
        </Link>

        {}
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`px-2 py-0.5 rounded border text-[10px] font-extrabold uppercase tracking-wider ${pStyle.bg} ${pStyle.text} cursor-pointer flex items-center gap-1`}
              >
                <Flag className="size-2.5" />
                <span>{pStyle.label}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => onPriorityChange(task.id, "HIGH")} className="text-xs text-red-500 cursor-pointer">
                High Priority
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPriorityChange(task.id, "MEDIUM")} className="text-xs text-amber-500 cursor-pointer">
                Medium Priority
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPriorityChange(task.id, "LOW")} className="text-xs text-blue-500 cursor-pointer">
                Low Priority
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {}
      <p className="text-sm font-semibold text-foreground leading-snug">
        {task.taskDescription}
      </p>

      {}
      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
        {task.assigneeName ? (
          <div className="flex items-center gap-1.5">
            <div className="size-5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary flex items-center justify-center">
              {getInitials(task.assigneeName)}
            </div>
            <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
              {task.assigneeName}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
        )}

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity"
        >
          {task.status !== "PENDING" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Move Left"
              onClick={() =>
                onMoveTask(
                  task.id,
                  task.status === "COMPLETED" ? "IN_PROGRESS" : "PENDING"
                )
              }
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          )}

          {task.status !== "COMPLETED" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-primary cursor-pointer"
              title="Move Right"
              onClick={() =>
                onMoveTask(
                  task.id,
                  task.status === "PENDING" ? "IN_PROGRESS" : "COMPLETED"
                )
              }
            >
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TasksKanbanClient({
  workspaceSlug,
  workspaceName,
  initialTasks,
  meetings,
}: TasksKanbanClientProps) {
  const [tasks, setTasks] = useState<WorkspaceTaskItem[]>(initialTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const [showModal, setShowModal] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskMeetingId, setNewTaskMeetingId] = useState(meetings[0]?.id || "");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<ActionItemPriority>("MEDIUM");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assignees = Array.from(new Set(tasks.map((t) => t.assigneeName).filter(Boolean))) as string[];

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch = t.taskDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.meetingTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAssignee = filterAssignee === "all" || t.assigneeName === filterAssignee;
    return matchesSearch && matchesAssignee;
  });

  const activeTask = tasks.find((t) => t.id === activeId);

  async function handleMoveTask(taskId: string, newStatus: ActionItemStatus) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await updateTaskStatusAction(taskId, newStatus, workspaceSlug);
    } catch (err) {
      console.error("Move task error:", err);
    }
  }

  async function handlePriorityChange(taskId: string, newPriority: ActionItemPriority) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t))
    );

    try {
      await updateTaskPriorityAction(taskId, newPriority, workspaceSlug);
    } catch (err) {
      console.error("Priority change error:", err);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id) {
      const overStatus = over.id as ActionItemStatus;
      handleMoveTask(active.id as string, overStatus);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskText.trim() || !newTaskMeetingId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createTaskAction(
        workspaceSlug,
        newTaskMeetingId,
        newTaskText.trim(),
        newTaskAssignee.trim() || undefined,
        newTaskPriority
      );

      if (res.success && res.task) {
        const meeting = meetings.find((m) => m.id === newTaskMeetingId);
        const newTaskItem: WorkspaceTaskItem = {
          id: res.task.id,
          meetingId: res.task.meetingId,
          meetingTitle: meeting?.title || "Meeting",
          taskDescription: res.task.taskDescription,
          assigneeName: res.task.assigneeName,
          status: res.task.status,
          priority: res.task.priority,
          dueDate: res.task.dueDate,
          createdAt: res.task.createdAt,
        };
        setTasks((prev) => [newTaskItem, ...prev]);
        setShowModal(false);
        setNewTaskText("");
        setNewTaskAssignee("");
      }
    } catch (err) {
      console.error("Create task error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300">
      
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border p-6 bg-card shrink-0 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="size-5 text-primary" />
            <span className="text-[11px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md">
              Execution Hub
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground mt-1">{workspaceName} Tasks Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage AI-extracted action items across all workspace meetings in unified drag-and-drop Kanban swimlanes.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={() => setShowModal(true)}
            className="h-9 text-xs font-bold gap-1.5 shadow-2xs cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Create Task</span>
          </Button>
        </div>
      </div>

      {}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3.5 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tasks by keyword or meeting title..."
            className="h-8 text-xs bg-background border-border"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
            <Filter className="size-3.5" /> Filter Assignee:
          </span>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="h-8 text-xs bg-background border border-border rounded-md px-2 font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Assignees ({tasks.length})</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-6 scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-w-[800px]">
            {COLUMNS.map((col) => {
              const columnTasks = filteredTasks.filter((t) => t.status === col.status);

              return (
                <DroppableColumn key={col.status} col={col} count={columnTasks.length}>
                  {columnTasks.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                      <CheckCircle2 className="size-6 text-muted-foreground/40 mb-1.5" />
                      <p className="text-xs font-semibold text-muted-foreground">No tasks in {col.title}</p>
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        workspaceSlug={workspaceSlug}
                        onPriorityChange={handlePriorityChange}
                        onMoveTask={handleMoveTask}
                      />
                    ))
                  )}
                </DroppableColumn>
              );
            })}
          </div>
        </div>

        {}
        <DragOverlay>
          {activeTask ? (
            <DraggableTaskCard
              task={activeTask}
              workspaceSlug={workspaceSlug}
              onPriorityChange={handlePriorityChange}
              onMoveTask={handleMoveTask}
              isOverlay={true}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <h3 className="text-lg font-bold text-foreground">Create New Action Item</h3>

              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Task Description</label>
                  <Input
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    placeholder="E.g., Finalize architecture spec & deploy..."
                    required
                    className="text-sm bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Associated Meeting</label>
                  <select
                    value={newTaskMeetingId}
                    onChange={(e) => setNewTaskMeetingId(e.target.value)}
                    className="w-full h-9 text-xs bg-background border border-border rounded-md px-3 font-medium text-foreground outline-none"
                  >
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Assignee Name (Optional)</label>
                    <Input
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      placeholder="e.g. Sarah"
                      className="text-sm bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as ActionItemPriority)}
                      className="w-full h-9 text-xs bg-background border border-border rounded-md px-3 font-medium text-foreground outline-none"
                    >
                      <option value="HIGH">High Priority</option>
                      <option value="MEDIUM">Medium Priority</option>
                      <option value="LOW">Low Priority</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowModal(false)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newTaskText.trim() || isSubmitting}
                    className="h-8 text-xs font-bold cursor-pointer"
                  >
                    {isSubmitting ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
