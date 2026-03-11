import { Badge } from "@avenire/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import {
  BookOpenCheck,
  FileText,
  MessageSquareText,
  Sparkles,
  ArrowRight,
  Clock3,
  FolderOpen,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ChatSummary } from "@/lib/chat-data";
import type { ExplorerFileRecord } from "@/lib/file-data";
import type { FlashcardSetSummary } from "@/lib/flashcards";

function emptyCopy(copy: string) {
  return <p className="text-muted-foreground text-sm">{copy}</p>;
}

export function DashboardOverview({
  chats,
  files,
  flashcardSets,
}: {
  chats: ChatSummary[];
  files: ExplorerFileRecord[];
  flashcardSets: FlashcardSetSummary[];
}) {
  const recentChats = chats.slice(0, 8);
  const recentFiles = files.slice(0, 8);
  const dueTotal = flashcardSets.reduce((sum, set) => sum + set.dueCount, 0);
  const newTotal = flashcardSets.reduce((sum, set) => sum + set.newCount, 0);
  const reviewsTotal = dueTotal + newTotal;
  const noteCount = files.filter((file) => file.isNote).length;
  const pinnedChats = chats.filter((chat) => chat.pinned).length;
  const activeSetCount = flashcardSets.filter(
    (set) => set.dueCount > 0 || set.newCount > 0
  ).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/12 via-background to-blue-500/10 px-5 py-5 sm:px-7 sm:py-6">
        <div className="-right-16 -top-16 pointer-events-none absolute h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="-bottom-16 left-8 pointer-events-none absolute h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-tight">
              Student Snapshot
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm sm:text-base">
              Birds-eye view of your chats, note workspace, and flashcard review
              pressure.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border/70 bg-secondary px-3 text-sm transition-colors hover:bg-secondary/80"
              href={"/dashboard/chats" as Route}
            >
              Open chats
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm transition-colors hover:bg-muted/60"
              href={"/dashboard/files" as Route}
            >
              Browse files
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="relative z-10 mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-muted-foreground text-xs">Active Chats</p>
                <p className="font-semibold text-xl">{chats.length}</p>
              </div>
              <MessageSquareText className="size-5 text-primary/80" />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-muted-foreground text-xs">Notes</p>
                <p className="font-semibold text-xl">{noteCount}</p>
              </div>
              <FolderOpen className="size-5 text-primary/80" />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-muted-foreground text-xs">Reviews Today</p>
                <p className="font-semibold text-xl">{reviewsTotal}</p>
              </div>
              <BookOpenCheck className="size-5 text-primary/80" />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-muted-foreground text-xs">Pinned Chats</p>
                <p className="font-semibold text-xl">{pinnedChats}</p>
              </div>
              <GraduationCap className="size-5 text-primary/80" />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4" />
              Chats
            </CardTitle>
            <CardDescription>Recent active conversations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentChats.length === 0
              ? emptyCopy("No chats yet.")
              : recentChats.map((chat) => (
                  <Link
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                    href={`/dashboard/chats/${chat.slug}` as Route}
                    key={chat.id}
                  >
                    <span className="min-w-0 truncate">{chat.title}</span>
                    {chat.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                  </Link>
                ))}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" />
              Files
            </CardTitle>
            <CardDescription>Recently updated workspace files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentFiles.length === 0
              ? emptyCopy("No files yet.")
              : recentFiles.map((file) => (
                  <Link
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                    href={`/dashboard/files/${file.workspaceId}/folder/${file.folderId}?file=${file.id}` as Route}
                    key={file.id}
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    {file.isNote ? <Badge variant="secondary">Note</Badge> : null}
                  </Link>
                ))}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              Flashcards
            </CardTitle>
            <CardDescription>Current review pressure and set activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{dueTotal} due</Badge>
              <Badge variant="secondary">{newTotal} new</Badge>
              <span className="text-muted-foreground">
                {flashcardSets.length} set{flashcardSets.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Clock3 className="size-3.5" />
              {activeSetCount} active set
              {activeSetCount === 1 ? "" : "s"} need attention.
            </div>
            <div className="space-y-1">
              {flashcardSets.length === 0
                ? emptyCopy("No flashcard sets yet.")
                : flashcardSets.slice(0, 6).map((set) => (
                    <Link
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                      href={`/dashboard/flashcards/${set.id}` as Route}
                      key={set.id}
                    >
                      <span className="min-w-0 truncate">{set.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {set.dueCount + set.newCount}
                      </span>
                    </Link>
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
