import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {children}
    </div>
  );
}
