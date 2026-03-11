import type { Metadata } from "next";
import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getFileAssetById,
  getFolderWithAncestors,
  userCanAccessWorkspace,
} from "@/lib/file-data";
import { DashboardLayout } from "@/components/dashboard/shell";
import { FileExplorer } from "@/components/files/explorer";
import { getFacehashUrl } from "@/lib/avatar";
import { listChatsForUser } from "@/lib/chat-data";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceUuid: string; folderUuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return buildPageMetadata({ title: "Files" });
  }

  const { workspaceUuid, folderUuid } = await params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);
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

  const folder = await getFolderWithAncestors(workspaceUuid, folderUuid, session.user.id);
  return buildPageMetadata({
    title: folder?.folder?.name ?? "Files",
  });
}

export default async function DashboardWorkspaceFolderPage({
  params,
}: {
  params: Promise<{ workspaceUuid: string; folderUuid: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const { workspaceUuid, folderUuid } = await params;
  const canAccess = await userCanAccessWorkspace(session.user.id, workspaceUuid);

  if (!canAccess) {
    redirect("/dashboard");
  }

  const chats = await listChatsForUser(session.user.id, workspaceUuid);

  return (
    <DashboardLayout
      activeChatSlug={chats[0]?.slug ?? ""}
      initialChats={chats}
      user={{
        name: session.user.name ?? "User",
        email: session.user.email,
        avatar: session.user.image ?? getFacehashUrl(session.user.name ?? session.user.email),
      }}
    >
      <FileExplorer folderUuid={folderUuid} workspaceUuid={workspaceUuid} />
    </DashboardLayout>
  );
}
