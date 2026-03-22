import { DashboardLayout as DashboardShellLayout } from "@/components/dashboard/shell";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardShellLayout initialWorkspaces={[]}>{children}</DashboardShellLayout>
    </main>
  );
}
