import { auth } from "@avenire/auth/server";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveWorkspaceForUser } from "@/lib/file-data";

/**
 * Redirects the current request to the appropriate dashboard files route based on authentication and workspace state.
 *
 * If no authenticated user is present, redirects to `/login`. If the user has no resolved workspace, redirects to `/dashboard`. Otherwise redirects to `/dashboard/files/{workspaceId}/folder/{rootFolderId}` for the user's workspace.
 */
export default async function DashboardFilesPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;
  const workspace = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);

  if (!workspace) {
    redirect("/dashboard");
  }

  redirect(
    `/dashboard/files/${workspace.workspaceId}/folder/${workspace.rootFolderId}` as Route,
  );
}
