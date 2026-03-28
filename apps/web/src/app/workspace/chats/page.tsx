import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Chats",
});

export default async function WorkspaceChatsPage() {
  const { default: DashboardChatsPage } = await import(
    "../../dashboard/chats/page"
  );
  return DashboardChatsPage();
}
