import { auth } from "@avenire/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  getLatestCanvasArtifactForChatSlug,
  listChatArtifactsByChatSlugForUser,
  upsertCanvasArtifactForChatSlug,
} from "@/lib/chat-artifacts";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind")?.trim();

  if (kind === "canvas") {
    const artifact = await getLatestCanvasArtifactForChatSlug({
      userId: session.user.id,
      chatSlug: slug,
    });

    return NextResponse.json({ artifact });
  }

  const artifacts = await listChatArtifactsByChatSlugForUser({
    userId: session.user.id,
    chatSlug: slug,
    kind: kind || undefined,
  });

  if (!artifacts) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ artifacts });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    title?: string;
    scene?: Record<string, unknown>;
  };

  if (body.kind !== "canvas" || !body.scene || typeof body.scene !== "object") {
    return NextResponse.json(
      { error: "Invalid payload. Expected { kind: 'canvas', scene }" },
      { status: 400 },
    );
  }

  const artifact = await upsertCanvasArtifactForChatSlug({
    userId: session.user.id,
    chatSlug: slug,
    title: body.title,
    scene: body.scene,
  });

  if (!artifact) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}
