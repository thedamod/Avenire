import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMessagesByChatSlug } from "@/lib/chat-data";
import {
  canUserAccessSharedResource,
  getFileAssetById,
  resolveResourceShareLink,
} from "@/lib/file-data";

/**
 * Renders a shared resource page for the given share token, handling file and chat resources.
 *
 * Fetches the shared link identified by `params.token`, enforces access controls (redirecting to
 * login when unauthenticated), and renders either a file view (with a link to the file) or a chat
 * view (listing messages). Triggers a 404 when the token or resource cannot be resolved.
 *
 * @param params - Route params containing the `token` used to resolve the shared resource
 * @returns The React element for the shared resource page; may redirect to the login page or result in a 404 when appropriate
 */
export default async function SharedResourcePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveResourceShareLink(token);

  if (!link) {
    notFound();
  }

  if (link.resourceType === "file") {
    const session = await auth.api.getSession({ headers: await headers() });
    const hasAccess = await canUserAccessSharedResource({
      link,
      userId: session?.user?.id,
    });
    if (!hasAccess) {
      if (!session?.user) {
        redirect(`/login?callbackURL=${encodeURIComponent(`/share/${token}`)}`);
      }
      return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6 text-center">
          <h1 className="font-semibold text-2xl">Access denied</h1>
          <p className="mt-2 text-muted-foreground">
            You do not have access to this file.
          </p>
        </main>
      );
    }

    const file = await getFileAssetById(link.workspaceId, link.resourceId);
    if (!file) {
      notFound();
    }

    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6 text-center">
        <h1 className="font-semibold text-2xl">Shared file</h1>
        <p className="mt-2 text-muted-foreground">{file.name}</p>
        <a
          className="mx-auto mt-6 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm"
          href={file.storageUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open file
        </a>
      </main>
    );
  }

  if (link.resourceType === "chat") {
    const session = await auth.api.getSession({ headers: await headers() });
    const hasAccess = await canUserAccessSharedResource({
      link,
      userId: session?.user?.id,
    });

    if (!hasAccess && !session?.user) {
      redirect(`/login?callbackURL=${encodeURIComponent(`/share/${token}`)}`);
    }

    if (!hasAccess) {
      return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6 text-center">
          <h1 className="font-semibold text-2xl">Access denied</h1>
          <p className="mt-2 text-muted-foreground">
            You do not have access to this chat.
          </p>
        </main>
      );
    }

    const messages = (await getMessagesByChatSlug(link.resourceId)) ?? [];

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col p-6">
        <h1 className="mb-4 font-semibold text-2xl">Shared chat</h1>
        <div className="space-y-3 rounded-lg border bg-card p-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">No messages available.</p>
          ) : (
            messages.map((message) => {
              const textPart = message.parts.find(
                (part): part is { text: string; type: "text" } => part.type === "text",
              );
              return (
                <div className="rounded-md border bg-background p-3" key={message.id}>
                  <p className="mb-1 text-muted-foreground text-xs uppercase">{message.role}</p>
                  <p className="whitespace-pre-wrap text-sm">
                    {textPart?.text ?? "[non-text content]"}
                  </p>
                </div>
              );
            })
          )}
        </div>
        <Link
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm"
          href="/dashboard"
        >
          Open dashboard
        </Link>
      </main>
    );
  }

  notFound();
}
