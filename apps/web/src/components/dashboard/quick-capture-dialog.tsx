"use client";

import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { Textarea } from "@avenire/ui/components/textarea";
import { Loader2, Plus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useMemo, useState } from "react";

export type CaptureKind = "task" | "note" | "misconception";

export interface QuickCaptureTaskValues {
  description: string;
  dueAt: string;
  title: string;
}

interface QuickCaptureDialogProps {
  initialKind?: CaptureKind;
  taskId?: string;
  taskMode?: "create" | "edit";
  taskValues?: QuickCaptureTaskValues;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger: ReactElement;
}

const defaultConfidence = "0.85";

function resetTaskState() {
  return {
    description: "",
    dueAt: "",
    title: "",
  };
}

function resetNoteState() {
  return {
    content: "",
    title: "",
  };
}

function resetMisconceptionState() {
  return {
    concept: "",
    confidence: defaultConfidence,
    reason: "",
    subject: "",
    topic: "",
  };
}

export function QuickCaptureDialog({
  initialKind = "task",
  taskId,
  taskMode = "create",
  taskValues,
  onOpenChange,
  open,
  trigger,
}: QuickCaptureDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<CaptureKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState(resetTaskState);
  const [note, setNote] = useState(resetNoteState);
  const [misconception, setMisconception] = useState(resetMisconceptionState);
  const kind = initialKind;
  const isTaskEdit = kind === "task" && taskMode === "edit";
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  let dialogTitle: string;
  let dialogDescription: string;

  if (kind === "task") {
    dialogTitle = isTaskEdit ? "Edit task" : "Capture task";
    dialogDescription = isTaskEdit
      ? "Update the task details and save the changes."
      : "Add the task now and set a due date so it shows up in the student calendar.";
  } else if (kind === "note") {
    dialogTitle = "Capture note";
    dialogDescription = "Capture a note without losing the thread.";
  } else {
    dialogTitle = "Capture misconception";
    dialogDescription =
      "Capture a misconception and feed it back into mastery.";
  }

  const isBusy = busyKind !== null;

  useEffect(() => {
    if (resolvedOpen) {
      if (kind === "task") {
        setTask(
          taskValues ??
            (taskMode === "edit" ? resetTaskState() : resetTaskState())
        );
      }
      return;
    }

    setBusyKind(null);
    setError(null);
    setTask(resetTaskState());
    setNote(resetNoteState());
    setMisconception(resetMisconceptionState());
  }, [kind, resolvedOpen, taskMode, taskValues]);

  const submitLabel = useMemo(() => {
    if (busyKind === kind) {
      return "Saving";
    }

    switch (kind) {
      case "note":
        return "Capture note";
      case "misconception":
        return "Capture misconception";
      default:
        return isTaskEdit ? "Save task" : "Capture task";
    }
  }, [busyKind, isTaskEdit, kind]);

  const submit = async (nextKind: CaptureKind) => {
    setBusyKind(nextKind);
    setError(null);

    try {
      let response: Response;
      if (nextKind === "task") {
        const payload = {
          description: task.description.trim(),
          dueAt: task.dueAt || null,
          title: task.title.trim(),
        };

        response =
          isTaskEdit && taskId
            ? await fetch(`/api/tasks/${taskId}`, {
                body: JSON.stringify(payload),
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
              })
            : await fetch("/api/capture", {
                body: JSON.stringify({
                  ...payload,
                  kind: nextKind,
                }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
              });
      } else if (nextKind === "note") {
        response = await fetch("/api/capture", {
          body: JSON.stringify({
            content: note.content,
            kind: nextKind,
            title: note.title,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
      } else {
        response = await fetch("/api/capture", {
          body: JSON.stringify({
            confidence: misconception.confidence,
            concept: misconception.concept,
            kind: nextKind,
            reason: misconception.reason,
            subject: misconception.subject,
            topic: misconception.topic,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to capture item.");
      }

      if (nextKind === "task") {
        window.dispatchEvent(new Event("dashboard.tasks.refresh"));
      }

      router.refresh();
      handleOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to capture item."
      );
    } finally {
      setBusyKind(null);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(nextOpen);
      return;
    }

    setInternalOpen(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={resolvedOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-4xl" largeWidth>
        <DialogHeader className="space-y-2">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {kind === "task" ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="quick-task-title">Title</Label>
                <Input
                  id="quick-task-title"
                  onChange={(event) =>
                    setTask((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Review Lagrangian mechanics notes"
                  value={task.title}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-task-description">Details</Label>
                <Textarea
                  id="quick-task-description"
                  onChange={(event) =>
                    setTask((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Add context, a link, or the next step."
                  value={task.description}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-task-due">Due</Label>
              <Input
                id="quick-task-due"
                onChange={(event) =>
                  setTask((prev) => ({ ...prev, dueAt: event.target.value }))
                }
                type="datetime-local"
                value={task.dueAt}
              />
              <p className="text-muted-foreground text-xs">
                Optional. Leave blank if it is just a capture.
              </p>
            </div>
          </div>
        ) : null}

        {kind === "note" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-note-title">Title</Label>
              <Input
                id="quick-note-title"
                onChange={(event) =>
                  setNote((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Lecture notes"
                value={note.title}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-note-content">Content</Label>
              <Textarea
                className="min-h-56"
                id="quick-note-content"
                onChange={(event) =>
                  setNote((prev) => ({ ...prev, content: event.target.value }))
                }
                placeholder="Write the idea, quote, or sketch here."
                value={note.content}
              />
            </div>
          </div>
        ) : null}

        {kind === "misconception" ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-misconception-subject">Subject</Label>
                <Input
                  id="quick-misconception-subject"
                  onChange={(event) =>
                    setMisconception((prev) => ({
                      ...prev,
                      subject: event.target.value,
                    }))
                  }
                  placeholder="Physics"
                  value={misconception.subject}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-misconception-topic">Topic</Label>
                <Input
                  id="quick-misconception-topic"
                  onChange={(event) =>
                    setMisconception((prev) => ({
                      ...prev,
                      topic: event.target.value,
                    }))
                  }
                  placeholder="Lagrangian mechanics"
                  value={misconception.topic}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-misconception-concept">Concept</Label>
              <Input
                id="quick-misconception-concept"
                onChange={(event) =>
                  setMisconception((prev) => ({
                    ...prev,
                    concept: event.target.value,
                  }))
                }
                placeholder="Euler-Lagrange equation"
                value={misconception.concept}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-misconception-reason">Reason</Label>
              <Textarea
                id="quick-misconception-reason"
                onChange={(event) =>
                  setMisconception((prev) => ({
                    ...prev,
                    reason: event.target.value,
                  }))
                }
                placeholder="What is wrong and what the user keeps getting wrong."
                value={misconception.reason}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="quick-misconception-confidence">
                  Confidence
                </Label>
                <Input
                  id="quick-misconception-confidence"
                  inputMode="decimal"
                  onChange={(event) =>
                    setMisconception((prev) => ({
                      ...prev,
                      confidence: event.target.value,
                    }))
                  }
                  placeholder="0.85"
                  value={misconception.confidence}
                />
              </div>
              <div className="flex items-end">
                <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-muted-foreground text-xs">
                  Records a misconception directly into the mastery model.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              isBusy ||
              (kind === "task" && !task.title.trim()) ||
              (kind === "note" && !note.title.trim()) ||
              (kind === "misconception" &&
                !(
                  misconception.subject.trim() &&
                  misconception.topic.trim() &&
                  misconception.concept.trim() &&
                  misconception.reason.trim()
                ))
            }
            onClick={() => submit(kind)}
            type="button"
          >
            {busyKind === kind ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {submitLabel}
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
