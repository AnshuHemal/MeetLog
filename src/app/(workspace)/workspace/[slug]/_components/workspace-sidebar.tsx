"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Home, FileAudio, Plus, Search, CheckSquare, Settings, Plug,
  LogOut, ChevronDown, Check, Sparkles, X, BarChart2, BookOpen, ChevronsUpDown, KeyRound, Bot
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/generated/prisma/enums";
import { useMobileSidebarSafe } from "@/components/providers/mobile-sidebar-provider";
import { useProvisionerUnlocked } from "@/hooks/use-provisioner-unlocked";

interface WorkspaceSidebarProps {
  workspace: { id: string; name: string; slug: string; logo: string | null };
  userWorkspaces: { id: string; name: string; slug: string }[];
  currentUserRole: WorkspaceRole;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function WorkspaceSidebar({
  workspace,
  userWorkspaces,
  currentUserRole,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const mobileSidebar = useMobileSidebarSafe();
  const [isProvisionerUnlocked] = useProvisionerUnlocked();

  async function handleSignOut() {
    await signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } });
  }

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function handleNavClick() {
    mobileSidebar?.close();
  }

  const baseSlug = `/workspace/${workspace.slug}`;

  const navItems = [
    { href: baseSlug,                label: "Home",               icon: Home,        exact: true  },
    { href: `${baseSlug}/upload`,    label: "Upload Meeting",     icon: Plus,        exact: false },
    { href: `${baseSlug}/meetings`,  label: "Meetings",           icon: FileAudio,   exact: false },
    { href: `${baseSlug}/ai-chat`,   label: "Ask Workspace AI",   icon: Sparkles,    exact: false },
    { href: `${baseSlug}/tasks`,     label: "Tasks Board",        icon: CheckSquare, exact: false },
    { href: `${baseSlug}/analytics`, label: "Analytics",          icon: BarChart2,   exact: false },
  ];

  const bottomLinks = [
    { href: `${baseSlug}/settings`,              label: "Settings",       icon: Settings, exact: true  },
    { href: `${baseSlug}/settings/vocabulary`,   label: "AI Calibration", icon: BookOpen, exact: true  },
    { href: `${baseSlug}/settings/integrations`, label: "Integrations",   icon: Plug,     exact: true  },
    { href: `${baseSlug}/settings/keys`,         label: "API Key Pool",   icon: KeyRound, exact: true  },
    ...(isProvisionerUnlocked
      ? [{ href: `${baseSlug}/settings/provisioner`, label: "Key Provisioner", icon: Bot, exact: true }]
      : []),
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden">
      {}
      <div className="flex items-center justify-between border-b border-border px-3 py-3 lg:hidden">
        <span className="text-sm font-semibold text-foreground">Menu</span>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={mobileSidebar?.close}>
          <X className="size-4" />
        </Button>
      </div>

      {}
      <div className="px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-sidebar-foreground hover:bg-accent hover:text-accent-foreground">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary overflow-hidden">
                  {workspace.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={workspace.logo} alt={workspace.name} className="size-full object-cover rounded-md" />
                  ) : (
                    workspace.name.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="truncate text-sm font-semibold text-sidebar-foreground">{workspace.name}</span>
              </div>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56" sideOffset={4}>
            <DropdownMenuLabel className="text-sm font-medium text-muted-foreground">Workspaces</DropdownMenuLabel>
            {userWorkspaces.map((ws) => (
              <DropdownMenuItem key={ws.id} asChild>
                <Link href={`/workspace/${ws.slug}`} className="flex items-center gap-2" onClick={handleNavClick}>
                  <div className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{ws.name}</span>
                  {ws.slug === workspace.slug && <Check className="size-3.5 text-primary" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding" className="flex items-center gap-2 text-muted-foreground" onClick={handleNavClick}>
                <Plus className="size-4" />Create workspace
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link key={href} href={href} onClick={handleNavClick}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              isActive(href, exact) ? "bg-accent text-accent-foreground" : "text-sidebar-foreground/70 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />{label}
          </Link>
        ))}
      </nav>

      <Separator className="mx-3 w-auto" />

      {}
      <div className="flex flex-col gap-1 px-2 py-3">
        {bottomLinks.map(({ href, label, icon: Icon, exact }) => (
          <Link key={href} href={href} onClick={handleNavClick}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              isActive(href, exact) ? "bg-accent text-accent-foreground" : "text-sidebar-foreground/70 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />{label}
          </Link>
        ))}

        {user && (
          <div className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5">
            <Avatar className="size-7 shrink-0">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
              <AvatarFallback className="text-sm font-semibold">{getInitials(user.name ?? user.email)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">{user.name ?? "User"}</span>
              <span className="truncate text-[10px] text-muted-foreground">{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
      >
        {sidebarContent}
      </motion.aside>

      <AnimatePresence>
        {mobileSidebar?.isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={mobileSidebar.close}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar shadow-2xl lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
