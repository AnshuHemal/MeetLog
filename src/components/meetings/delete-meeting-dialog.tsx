"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteMeetingAction } from "@/app/(workspace)/workspace/[slug]/meetings/actions";

interface DeleteMeetingDialogProps {
  meetingId: string;
  meetingTitle: string;
  workspaceSlug: string;
  redirectTo?: string;
  onDeleted?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function DeleteMeetingDialog({
  meetingId,
  meetingTitle,
  workspaceSlug,
  redirectTo,
  onDeleted,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = true,
}: DeleteMeetingDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (value: boolean) => {
    if (!value) setError(null);
    if (isControlled) {
      controlledOnOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteMeetingAction(meetingId, workspaceSlug);

      if (!result.success) {
        setError(result.error ?? "Failed to delete meeting.");
        return;
      }

      setOpen(false);
      onDeleted?.();

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {showTrigger && trigger}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete meeting recording?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>
                This will permanently remove{" "}
                <span className="font-semibold text-foreground">&quot;{meetingTitle}&quot;</span>{" "}
                including its audio file, transcript, summary, and action items.
              </p>
              <p>This action cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Delete permanently
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface MeetingDeleteButtonProps {
  meetingId: string;
  meetingTitle: string;
  workspaceSlug: string;
  redirectTo?: string;
  onDeleted?: () => void;
  variant?: "icon" | "menu-item";
  className?: string;
}

export function MeetingDeleteButton({
  meetingId,
  meetingTitle,
  workspaceSlug,
  redirectTo,
  onDeleted,
  variant = "icon",
  className,
}: MeetingDeleteButtonProps) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "menu-item" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-hidden select-none hover:bg-destructive/10"
        }
      >
        <Trash2 className="size-4" />
        Delete recording
      </button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={
          className ??
          "size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        }
        title="Delete meeting"
        aria-label="Delete meeting"
      >
        <Trash2 className="size-4" />
      </Button>
    );

  return (
    <DeleteMeetingDialog
      meetingId={meetingId}
      meetingTitle={meetingTitle}
      workspaceSlug={workspaceSlug}
      redirectTo={redirectTo}
      onDeleted={onDeleted}
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      showTrigger
    />
  );
}
