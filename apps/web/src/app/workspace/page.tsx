import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Workspace",
});

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspacePage(props: DashboardPageProps) {
  const { default: DashboardPage } = await import("../dashboard/page");
  return DashboardPage(props);
}
