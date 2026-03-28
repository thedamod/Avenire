import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Files",
});

export default async function WorkspaceFilesPage() {
  const { default: DashboardFilesPage } = await import(
    "../../dashboard/files/page"
  );
  return DashboardFilesPage();
}
