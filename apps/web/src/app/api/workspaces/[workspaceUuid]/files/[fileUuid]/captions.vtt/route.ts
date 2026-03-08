import { listFileTranscriptCues } from "@/lib/ingestion-data";
import { ensureWorkspaceAccessForUser, getSessionUser } from "@/lib/workspace";

function formatVttTimestamp(ms: number) {
  const totalMs = Math.max(0, Math.floor(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceUuid: string; fileUuid: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceUuid, fileUuid } = await context.params;
  const canAccess = await ensureWorkspaceAccessForUser(user.id, workspaceUuid);
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const cues = await listFileTranscriptCues(workspaceUuid, fileUuid);
  if (cues.length === 0) {
    return new Response("WEBVTT\n\n", {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const body = [
    "WEBVTT",
    "",
    ...cues.map((cue, index) => {
      const start = formatVttTimestamp(cue.startMs);
      const end = formatVttTimestamp(Math.max(cue.startMs + 500, cue.endMs));
      const text = cue.text.replace(/\r/g, " ").trim();
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    }),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
