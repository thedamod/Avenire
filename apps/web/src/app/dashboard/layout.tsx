import { AppQueryProvider } from "@/components/query-provider";
import { DashboardLayout as DashboardShellLayout } from "@/components/dashboard/shell";
import { listWorkspacesForUser } from "@/lib/file-data";
import { getWorkspaceRouteContext } from "@/lib/workspace-route-context";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getWorkspaceRouteContext();
  const initialWorkspaces = context.session?.user
    ? await listWorkspacesForUser(context.session.user.id)
    : [];

  return (
    <main className="h-svh overflow-hidden bg-background text-foreground">
      <AppQueryProvider>
        <DashboardShellLayout
          activeWorkspace={context.workspace}
          initialWorkspaces={initialWorkspaces}
          user={
            context.session?.user
              ? {
                  avatar: context.session.user.image ?? undefined,
                  email: context.session.user.email,
                  name: context.session.user.name ?? context.session.user.email,
                }
              : undefined
          }
        >
          {children}
        </DashboardShellLayout>
      </AppQueryProvider>
    </main>
  );
}
