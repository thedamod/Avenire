import { auth } from "@avenire/auth/server";
import {
  resolveWorkspaceForUser,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { headers } from "next/headers";

/**
 * Retrieves the currently authenticated session user.
 *
 * @returns The session's user object if present, `null` otherwise.
 */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Builds a workspace context for the current session user.
 *
 * @returns `{ user: User, workspace: Workspace }` containing the session user and their resolved workspace, or `null` if there is no authenticated user or no matching workspace.
 */
export async function getWorkspaceContextForUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;

  const workspace = await resolveWorkspaceForUser(session.user.id, activeOrganizationId);
  if (!workspace) {
    return null;
  }

  return {
    user: session.user,
    workspace,
  };
}

/**
 * Check whether a user has access to a workspace.
 *
 * @param userId - The ID of the user to check access for
 * @param workspaceId - The ID of the workspace to check access against
 * @returns `true` if the user has access to the workspace, `false` otherwise
 */
export async function ensureWorkspaceAccessForUser(userId: string, workspaceId: string) {
  return userCanAccessWorkspace(userId, workspaceId);
}
