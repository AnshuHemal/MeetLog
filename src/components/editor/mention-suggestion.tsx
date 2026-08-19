"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface MentionMember {
  id: string;
  name: string;
  image: string | null;
}

interface MentionListProps {
  items: MentionMember[];
  command: (item: MentionMember) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    function selectItem(index: number) {
      const item = items[index];
      if (item) command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
          className="z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          {}
          <div className="border-b border-border px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mention a teammate
            </span>
          </div>

          {}
          <div className="p-1">
            {items.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.1, delay: index * 0.03 }}
                onClick={() => selectItem(index)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={item.image ?? undefined} alt={item.name} />
                  <AvatarFallback className="text-[9px] font-semibold">
                    {getInitials(item.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{item.name}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  },
);

MentionList.displayName = "MentionList";

export function buildMentionSuggestion(members: MentionMember[]) {
  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase().trim();
      if (!q) return members.slice(0, 8);
      return members
        .filter((m) => m.name.toLowerCase().includes(q))
        .slice(0, 8);
    },

    render: () => {
      let component: ReactRenderer<MentionListRef, MentionListProps>;
      let popup: TippyInstance[];

      return {
        onStart(props: SuggestionProps) {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items as MentionMember[],
              command: (item: MentionMember) => {
                props.command({ id: item.id, label: item.name });
              },
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            theme: "none",
            arrow: false,
            offset: [0, 6],
          });
        },

        onUpdate(props: SuggestionProps) {
          component.updateProps({
            items: props.items as MentionMember[],
            command: (item: MentionMember) => {
              props.command({ id: item.id, label: item.name });
            },
          });
          if (!props.clientRect) return;
          popup[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            popup[0]?.hide();
            return true;
          }
          return component.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup[0]?.destroy();
          component.destroy();
        },
      };
    },
  };
}
