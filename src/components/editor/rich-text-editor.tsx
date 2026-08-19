"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Mention from "@tiptap/extension-mention";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Heading2,
  Heading3,
  Code,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildMentionSuggestion,
  type MentionMember,
} from "./mention-suggestion";

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex size-7 items-center justify-center rounded text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

interface RichTextEditorProps {
  content?: string | null;
  onChange?: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;

  showToolbar?: boolean;
  minHeight?: string;

  members?: MentionMember[];
}

export function RichTextEditor({
  content,
  onChange,
  onBlur,
  placeholder = "Add a description…",
  editable = true,
  className,
  showToolbar,
  minHeight = "120px",
  members,
}: RichTextEditorProps) {
  const showBar = showToolbar ?? editable;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),

      ...(members && members.length > 0
        ? [
            Mention.configure({
              HTMLAttributes: {
                class:
                  "mention inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-primary cursor-default",
              },
              renderLabel({ node }) {
                return `@${node.attrs.label ?? node.attrs.id}`;
              },
              suggestion: buildMentionSuggestion(members),
            }),
          ]
        : []),
    ],
    content: content ?? "",
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onBlur: () => {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1",
          "[&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:h-0",
        ),
      },
    },
  });

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background transition-colors",
        editable && "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        !editable && "border-transparent bg-transparent",
        className,
      )}
    >
      {}
      {showBar && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <Bold className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <Italic className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <UnderlineIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strikethrough"
          >
            <Strikethrough className="size-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <Heading2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <Heading3 className="size-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <List className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Ordered list"
          >
            <ListOrdered className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive("taskList")}
            title="Task list"
          >
            <ListChecks className="size-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline code"
          >
            <Code className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Divider"
          >
            <Minus className="size-3.5" />
          </ToolbarButton>

          {}
          {members && members.length > 0 && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <span className="px-1 text-[10px] text-muted-foreground select-none">
                @ to mention
              </span>
            </>
          )}
        </div>
      )}

      {}
      <EditorContent
        editor={editor}
        className="px-3 py-2"
        style={{ minHeight }}
      />
    </div>
  );
}
