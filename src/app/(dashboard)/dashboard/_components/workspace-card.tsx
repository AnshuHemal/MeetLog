"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Users, FolderKanban, ArrowRight, Crown, Shield, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fadeUpVariants } from "@/components/motion/fade-in";

interface WorkspaceCardProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    role: string;
    memberCount: number;
    meetingCount: number;
  };
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  OWNER:  { label: "Owner",  icon: Crown,  color: "text-yellow-500" },
  ADMIN:  { label: "Admin",  icon: Shield, color: "text-primary" },
  MEMBER: { label: "Member", icon: Users,  color: "text-muted-foreground" },
  VIEWER: { label: "Viewer", icon: Eye,    color: "text-muted-foreground" },
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const roleCfg = ROLE_CONFIG[workspace.role] ?? ROLE_CONFIG.MEMBER;
  const RoleIcon = roleCfg.icon;

  const initials = workspace.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div variants={fadeUpVariants}>
      <Link
        href={`/workspace/${workspace.slug}`}
        className={cn(
          "group flex flex-col gap-4 rounded-xl border border-border bg-card p-5",
          "transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        {}
        <div className="flex items-start justify-between gap-3">
          {}
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20">
            {workspace.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logo}
                alt={workspace.name}
                className="size-full rounded-xl object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {}
          <Badge
            variant="outline"
            className={cn("flex items-center gap-1 text-[11px] font-medium", roleCfg.color, "border-current/20")}
          >
            <RoleIcon className="size-3" />
            {roleCfg.label}
          </Badge>
        </div>

        {}
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {workspace.name}
          </h3>
          <p className="font-mono text-sm text-muted-foreground">
            meetlog.app/workspace/{workspace.slug}
          </p>
        </div>

        {}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}
          </span>
          <span className="flex items-center gap-1.5">
            <FolderKanban className="size-3.5" />
            {workspace.meetingCount} {workspace.meetingCount === 1 ? "meeting" : "meetings"}
          </span>
        </div>

        {}
        <div className="flex items-center justify-end">
          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
            Open workspace
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
