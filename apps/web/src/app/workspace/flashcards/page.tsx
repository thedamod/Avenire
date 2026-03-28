import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Flashcards",
});

type DashboardFlashcardsPageProps = Parameters<
  typeof import("../../dashboard/flashcards/page").default
>[0];

export default async function WorkspaceFlashcardsPage(
  props: DashboardFlashcardsPageProps
) {
  const { default: DashboardFlashcardsPage } = await import(
    "../../dashboard/flashcards/page"
  );
  return DashboardFlashcardsPage(props);
}
