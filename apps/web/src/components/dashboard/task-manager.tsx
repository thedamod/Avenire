"use client";

import { Button } from "@avenire/ui/components/button";
import { Card, CardContent, CardHeader } from "@avenire/ui/components/card";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { QuickCaptureDialog } from "@/components/dashboard/quick-capture-dialog";
import { cn } from "@/lib/utils";

interface TaskRecord {
  description: string | null;
  dueAt: string | null;
  id: string;
  status: "pending" | "in_progress" | "completed";
  title: string;
}

export function DashboardTaskManager() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const notifyTaskRefresh = () => {
    window.dispatchEvent(new Event("dashboard.tasks.refresh"));
  };

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const response = await fetch(
          "/api/tasks?limit=12&includeCompleted=true"
        );
        if (!response.ok) {
          throw new Error("Failed to load tasks.");
        }
        const data = (await response.json()) as { tasks: TaskRecord[] };
        setTasks(data.tasks);
        setErrorMessage(null);
      } catch {
        setErrorMessage("Could not load tasks right now.");
      } finally {
        setLoading(false);
      }
    };

    const refresh = () => {
      setLoading(true);
      loadTasks().catch(() => undefined);
    };

    window.addEventListener("dashboard.tasks.refresh", refresh);
    refresh();

    return () => {
      window.removeEventListener("dashboard.tasks.refresh", refresh);
    };
  }, []);

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        if (left.status === "completed" && right.status !== "completed") {
          return -1;
        }
        if (left.status !== "completed" && right.status === "completed") {
          return 1;
        }
        if (left.dueAt && right.dueAt) {
          return (
            new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
          );
        }
        if (left.dueAt) {
          return -1;
        }
        if (right.dueAt) {
          return 1;
        }
        return 0;
      }),
    [tasks]
  );

  const pendingCount = sortedTasks.filter(
    (task) => task.status !== "completed"
  ).length;

  const handleToggleTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const newStatus = task.status === "completed" ? "pending" : "completed";
    setTasks((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, status: newStatus } : item
      )
    );
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        throw new Error("Failed to update task.");
      }
      notifyTaskRefresh();
    } catch {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === taskId ? { ...item, status: task.status } : item
        )
      );
      setErrorMessage("Could not update that task.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    setTasks((prev) => prev.filter((item) => item.id !== taskId));
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete task.");
      }
      notifyTaskRefresh();
    } catch {
      setTasks((prev) => [...prev, task]);
      setErrorMessage("Could not delete that task.");
    }
  };

  const displayTasks = useMemo(() => {
    const completedTasks = sortedTasks.filter(
      (task) => task.status === "completed"
    );
    const nonCompletedTasks = sortedTasks.filter(
      (task) => task.status !== "completed"
    );

    if (sortedTasks.length > 10 && completedTasks.length > 0) {
      return nonCompletedTasks.slice(0, 10);
    }
    return sortedTasks.slice(0, 10);
  }, [sortedTasks]);

  return (
    <Card className="self-start" id="task-manager">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-foreground text-sm">
              Today&apos;s Tasks
            </p>
            <p className="text-muted-foreground text-xs">
              Tap to mark complete, edit, or delete below.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {pendingCount} active
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[22rem] space-y-3 overflow-auto">
        {errorMessage && (
          <p className="text-destructive text-xs">{errorMessage}</p>
        )}
        <div className="space-y-1">
          {loading && (
            <div className="text-muted-foreground text-xs">
              Loading tasks...
            </div>
          )}
          {!loading && sortedTasks.length === 0 && (
            <div className="rounded-md border border-border/70 border-dashed bg-muted/20 px-3 py-4 text-muted-foreground text-xs">
              No tasks yet.
            </div>
          )}
          {!loading &&
            displayTasks.length > 0 &&
            displayTasks.map((task) => {
              const isCompleted = task.status === "completed";
              return (
                <div className="space-y-1" key={task.id}>
                  <div className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60">
                    <button
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTask(task);
                      }}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <motion.button
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 text-left",
                        isCompleted && "text-muted-foreground"
                      )}
                      layout
                      onClick={() => handleToggleTask(task.id)}
                      type="button"
                    >
                      <motion.span
                        animate={{
                          scale: isCompleted ? 1 : 0.88,
                          opacity: isCompleted ? 1 : 0.8,
                        }}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                          isCompleted
                            ? "border-primary/40 bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        )}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </motion.span>
                      <span className="relative min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate">{task.title}</span>
                        <motion.span
                          animate={{ scaleX: isCompleted ? 1 : 0 }}
                          className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
                          style={{ translateY: "-50%" }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        />
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
                        <CalendarDays className="h-3 w-3" />
                        {task.dueAt
                          ? new Date(task.dueAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "No date"}
                      </span>
                    </motion.button>
                    <button
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTask(task.id);
                      }}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
        <QuickCaptureDialog
          initialKind="task"
          onOpenChange={(open) => {
            if (!open) {
              setEditingTask(null);
            }
          }}
          open={editingTask !== null}
          taskId={editingTask?.id}
          taskMode="edit"
          taskValues={
            editingTask
              ? {
                  description: editingTask.description ?? "",
                  dueAt: editingTask.dueAt ?? "",
                  title: editingTask.title,
                }
              : undefined
          }
          trigger={
            <Button className="sr-only" type="button">
              Edit task
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
