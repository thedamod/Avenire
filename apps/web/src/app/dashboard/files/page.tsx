import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireWorkspaceRouteContext } from "@/lib/workspace-route-context";

export default async function DashboardFilesPage() {
  const { workspace } = await requireWorkspaceRouteContext(
    "/workspace" as Route
  );

  redirect(
    `/workspace/files/${workspace.workspaceId}/folder/${workspace.rootFolderId}` as Route
  );
}
