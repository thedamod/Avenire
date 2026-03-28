import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Mindset",
});

export default async function WorkspaceFlashcardSetPage(
  props: {
    params: Promise<{ setId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const { default: DashboardFlashcardSetPage } = await import(
    "../../../dashboard/flashcards/[setId]/page"
  );
  return DashboardFlashcardSetPage(props);
}
