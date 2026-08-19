"use server";

import { prisma } from "@/lib/prisma";

export async function checkEmailExists(
  email: string,
): Promise<{ exists: boolean; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    return { exists: !!user };
  } catch {

    return { exists: false, error: "Unable to verify email. Please try again." };
  }
}
