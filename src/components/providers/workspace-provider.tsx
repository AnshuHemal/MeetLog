"use client";

import { createContext, useContext } from "react";

import type { WorkspaceRole } from "@/generated/prisma/enums";

interface WorkspaceContextValue {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  currentUserRole: WorkspaceRole;
  projects: { id: string; name: string; key: string }[];
  members: { id: string; name: string; image: string | null; email?: string }[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: WorkspaceContextValue;
}) {
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function useWorkspaceSafe(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
