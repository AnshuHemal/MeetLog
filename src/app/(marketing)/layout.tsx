import { Header } from "@/components/shared/header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground bg-muted/5">
        <p>© {new Date().getFullYear()} MeetLog. All rights reserved.</p>
      </footer>
    </div>
  );
}
