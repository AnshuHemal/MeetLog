
export type RealtimeEventType =

  | "issue.created"
  | "issue.updated"
  | "issue.deleted"
  | "issue.moved"

  | "comment.added"
  | "comment.edited"
  | "comment.deleted"

  | "sprint.created"
  | "sprint.updated"
  | "sprint.started"
  | "sprint.completed"
  | "sprint.deleted"

  | "member.added"
  | "member.removed"
  | "member.role_changed"

  | "notification.created"

  | "ping";

export interface RealtimeEvent {
  type: RealtimeEventType;

  workspaceId: string;

  projectId?: string;

  data: Record<string, unknown>;

  actorId: string;

  timestamp: number;
}

type Subscriber = {
  controller: ReadableStreamDefaultController;
  workspaceId: string;
  userId: string;
};

const g = globalThis as typeof globalThis & {
  _sseSubscribers?: Map<string, Subscriber>;
};

if (!g._sseSubscribers) {
  g._sseSubscribers = new Map<string, Subscriber>();
}

const subscribers = g._sseSubscribers;

export function subscribe(
  workspaceId: string,
  userId: string,
  controller: ReadableStreamDefaultController,
): string {
  const id = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  subscribers.set(id, { controller, workspaceId, userId });
  return id;
}

export function unsubscribe(id: string): void {
  subscribers.delete(id);
}

export function broadcast(event: Omit<RealtimeEvent, "timestamp">): void {
  const payload: RealtimeEvent = { ...event, timestamp: Date.now() };
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);

  for (const [id, sub] of subscribers) {
    if (sub.workspaceId !== event.workspaceId) continue;
    try {
      sub.controller.enqueue(encoded);
    } catch {

      subscribers.delete(id);
    }
  }
}

export function pingAll(): void {
  const encoded = new TextEncoder().encode(": ping\n\n");
  for (const [id, sub] of subscribers) {
    try {
      sub.controller.enqueue(encoded);
    } catch {
      subscribers.delete(id);
    }
  }
}

export function getPresenceCount(workspaceId: string): number {
  let count = 0;
  for (const sub of subscribers.values()) {
    if (sub.workspaceId === workspaceId) count++;
  }
  return count;
}

export function getPresenceUsers(workspaceId: string): string[] {
  const seen = new Set<string>();
  for (const sub of subscribers.values()) {
    if (sub.workspaceId === workspaceId) seen.add(sub.userId);
  }
  return Array.from(seen);
}
