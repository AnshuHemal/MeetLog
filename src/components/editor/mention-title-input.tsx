"use client";

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ClipboardEvent,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MentionMember } from "./mention-suggestion";

interface MentionTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  members: MentionMember[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function renderTitleHtml(text: string): string {

  return text.replace(
    /@([\w\s]+?)(?=\s@|\s*$|[^a-zA-Z\s])/g,
    (match, name) =>
      `<span class="mention-chip" data-mention="${name.trim()}" contenteditable="false">@${name.trim()}</span>`,
  );
}

function extractPlainText(el: HTMLElement): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.mention) {
        text += `@${node.dataset.mention}`;
      } else if (node.tagName === "BR") {

      } else {
        text += node.textContent ?? "";
      }
    }
  }
  return text;
}

export function MentionTitleInput({
  value,
  onChange,
  onSave,
  onCancel,
  members,
  placeholder = "Issue title…",
  className,
  disabled = false,
  autoFocus = true,
}: MentionTitleInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dropdownPos, setDropdownPos]   = useState<{ top: number; left: number } | null>(null);
  const mentionStartRef = useRef<number>(-1);

  const filteredMembers = mentionQuery !== null
    ? members
        .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  useEffect(() => {
    if (!editorRef.current) return;

    editorRef.current.innerHTML = value || "";
    if (autoFocus) {
      editorRef.current.focus();

      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getCaretOffset(): number {
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return 0;
    const range = sel.getRangeAt(0);
    const pre   = range.cloneRange();
    pre.selectNodeContents(editorRef.current);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  function computeDropdownPos() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) return null;
    return {
      top:  rect.bottom - editorRect.top + 4,
      left: Math.max(0, rect.left - editorRect.left),
    };
  }

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const text = extractPlainText(editorRef.current);
    onChange(text);

    const offset = getCaretOffset();
    const textBefore = text.slice(0, offset);
    const atIdx = textBefore.lastIndexOf("@");

    if (atIdx !== -1) {
      const query = textBefore.slice(atIdx + 1);

      if (/^[\w\s]*$/.test(query) && !query.includes("  ")) {
        setMentionQuery(query);
        setMentionIndex(0);
        mentionStartRef.current = atIdx;
        setDropdownPos(computeDropdownPos());
        return;
      }
    }
    setMentionQuery(null);
  }, [onChange]);

  const insertMention = useCallback((member: MentionMember) => {
    if (!editorRef.current) return;

    const text = extractPlainText(editorRef.current);
    const atIdx = mentionStartRef.current;
    if (atIdx === -1) return;

    const before = text.slice(0, atIdx);
    const after  = text.slice(getCaretOffset());
    const newText = `${before}@${member.name} ${after}`;

    editorRef.current.textContent = newText;
    onChange(newText);

    const newOffset = before.length + member.name.length + 2;
    const range = document.createRange();
    const sel   = window.getSelection();

    let walked = 0;
    for (const node of Array.from(editorRef.current.childNodes)) {
      const len = (node.textContent ?? "").length;
      if (walked + len >= newOffset) {
        range.setStart(node, newOffset - walked);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        break;
      }
      walked += len;
    }

    setMentionQuery(null);
    mentionStartRef.current = -1;
  }, [onChange]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {

    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const member = filteredMembers[mentionIndex];
        if (member) insertMention(member);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setMentionQuery(null);
      onSave();
      return;
    }
    if (e.key === "Escape") {
      setMentionQuery(null);
      onCancel();
      return;
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
    document.execCommand("insertText", false, text);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!editorRef.current?.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={cn("relative", className)}>
      {}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => {

          setTimeout(() => {
            if (mentionQuery === null) onSave();
          }, 150);
        }}
        data-placeholder={placeholder}
        className={cn(
          "min-h-[2rem] w-full rounded-md px-1 py-0.5 text-xl font-semibold text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0",
          "transition-colors hover:bg-accent/30",
          "empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)]",

          "[&_.mention-chip]:inline-flex [&_.mention-chip]:items-center [&_.mention-chip]:rounded-md",
          "[&_.mention-chip]:bg-primary/10 [&_.mention-chip]:px-1.5 [&_.mention-chip]:py-0.5",
          "[&_.mention-chip]:text-sm [&_.mention-chip]:font-semibold [&_.mention-chip]:text-primary",
          "[&_.mention-chip]:cursor-default [&_.mention-chip]:select-none",
          disabled && "pointer-events-none opacity-60",
        )}
        spellCheck={false}
        aria-label="Issue title"
        aria-multiline="false"
      />

      {}
      <AnimatePresence>
        {mentionQuery !== null && filteredMembers.length > 0 && dropdownPos && (
          <motion.div
            key="mention-dropdown"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            className="absolute z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            {}
            <div className="border-b border-border px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mention a teammate
              </span>
            </div>

            {}
            <div className="p-1">
              {filteredMembers.map((member, i) => (
                <motion.button
                  key={member.id}
                  type="button"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.1, delay: i * 0.03 }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(member);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    i === mentionIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage src={member.image ?? undefined} alt={member.name} />
                    <AvatarFallback className="text-[9px] font-semibold">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{member.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
