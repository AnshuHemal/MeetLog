"use client";

import Link from "next/link";
import { LogOut, Settings, LayoutDashboard, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import React, { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { LogoutConfirmationModal } from "@/components/shared/logout-confirmation-modal";

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  if (isPending) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
    );
  }

  if (!session?.user) return null;

  const { user } = session;
  const initials = getInitials(user.name ?? user.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-9 items-center gap-2 rounded-full pl-1 pr-2 cursor-pointer"
            aria-label="Open user menu"
          >
            <Avatar className="size-7">
              <AvatarImage
                src={user.image ?? undefined}
                alt={user.name ?? "User avatar"}
              />
              <AvatarFallback className="text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-28 truncate text-sm font-medium sm:block">
              {user.name ?? user.email}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
          {/* User info */}
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="truncate font-semibold text-foreground">
              {user.name ?? "User"}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {/* Links */}
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="cursor-pointer">
              <LayoutDashboard className="mr-2 size-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
              <Settings className="mr-2 size-4" />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowLogoutModal(true)}
            className="text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutConfirmationModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        user={user}
      />
    </>
  );
}

function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}
