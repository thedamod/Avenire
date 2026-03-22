import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { FileExplorer } from "@/components/files/explorer";
import {
  getFileAssetById,
  getFolderWithAncestors,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getRouteSession } from "@/lib/workspace-route-context";

const canAccessWorkspace = cache(async (userId: string, workspaceUuid: string) =>
  userCanAccessWorkspace(userId, workspaceUuid)
);

const getFolderContext = cache(
  async (userId: string, workspaceUuid: string, folderUuid: string) => {
    const canAccess = await canAccessWorkspace(userId, workspaceUuid);
    if (!canAccess) {
      return null;
    }

    return getFolderWithAncestors(workspaceUuid, folderUuid, userId);
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceUuid: string; folderUuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const session = await getRouteSession();
  if (!session?.user) {
    return buildPageMetadata({ title: "Files" });
  }

  const { workspaceUuid, folderUuid } = await params;
  const canAccess = await canAccessWorkspace(session.user.id, workspaceUuid);
  if (!canAccess) {
    return buildPageMetadata({ title: "Files" });
  }

  const query = await searchParams;
  const fileParam = query.file;
  const activeFileId = Array.isArray(fileParam) ? fileParam[0] : fileParam;
  if (activeFileId) {
    const file = await getFileAssetById(workspaceUuid, activeFileId);
    if (file?.name) {
      return buildPageMetadata({
        title: file.name,
      });
    }
  }

  const folder = await getFolderContext(
    session.user.id,
    workspaceUuid,
    folderUuid
  );
  return buildPageMetadata({
    title: folder?.folder?.name ?? "Files",
  });
}

export default async function DashboardWorkspaceFolderPage({
  params,
}: {
  params: Promise<{ workspaceUuid: string; folderUuid: string }>;
}) {
  const session = await getRouteSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { workspaceUuid, folderUuid } = await params;
  const canAccess = await canAccessWorkspace(session.user.id, workspaceUuid);

  if (!canAccess) {
    redirect("/workspace" as Route);
  }

  return <FileExplorer folderUuid={folderUuid} workspaceUuid={workspaceUuid} />;
}
