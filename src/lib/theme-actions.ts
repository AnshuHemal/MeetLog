"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";

export type ThemeValue = "light" | "dark" | "system";

export async function saveUserTheme(_theme: ThemeValue): Promise<void> {

}

export async function getUserTheme(): Promise<ThemeValue> {

  return "system";
}
