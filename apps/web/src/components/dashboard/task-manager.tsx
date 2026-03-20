"use client";

import { Button } from "@avenire/ui/components/button";
import { Card, CardContent, CardHeader } from "@avenire/ui/components/card";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { Textarea } from "@avenire/ui/components/textarea";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const notifyTaskRefresh = () => {
    window.dispatchEvent(new Event("dashboard.tasks.refresh"));
  };
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{
    description: string;
    dueAt: string;
    title: string;
  }>({
    description: "",
    dueAt: "",
    title: "",
  });

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

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title || savingTask) {
      return;
    }

    setSavingTask(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: taskDescription.trim() || null,
          dueAt: taskDueAt || null,
          title,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create task.");
      }

      const data = (await response.json()) as { task: TaskRecord };
      setTasks((prev) => [data.task, ...prev]);
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueAt("");
      notifyTaskRefresh();
      requestAnimationFrame(() => {
        taskInputRef.current?.focus();
      });
    } catch {
      setErrorMessage("Could not create that task.");
    } finally {
      setSavingTask(false);
    }
  };

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

  const beginEditingTask = (task: TaskRecord) => {
    setEditingTaskId(task.id);
    setEditingDraft({
      description: task.description ?? "",
      dueAt: task.dueAt ?? "",
      title: task.title,
    });
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditingDraft({
      description: "",
      dueAt: "",
      title: "",
    });
  };

  const handleSaveTask = async (taskId: string) => {
    const title = editingDraft.title.trim();
    if (!title) {
      setErrorMessage("Task title is required.");
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editingDraft.description.trim() || null,
          dueAt: editingDraft.dueAt || null,
          title,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to update task.");
      }

      const data = (await response.json()) as { task: TaskRecord };
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? data.task : task))
      );
      setEditingTaskId(null);
      notifyTaskRefresh();
    } catch {
      setErrorMessage("Could not update that task.");
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
              Tap to mark complete, or add a task below.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {pendingCount} active
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[22rem] space-y-3 overflow-auto">
        <form className="space-y-2" onSubmit={handleCreateTask}>
          <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_13rem]">
              <Input
                aria-label="New task title"
                className="min-w-0"
                disabled={savingTask}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Add a quick task"
                ref={taskInputRef}
                value={taskTitle}
              />
              <Input
                aria-label="New task due date"
                disabled={savingTask}
                onChange={(event) => setTaskDueAt(event.target.value)}
                type="datetime-local"
                value={taskDueAt}
              />
            </div>
            <Textarea
              aria-label="New task details"
              className="min-h-20"
              disabled={savingTask}
              onChange={(event) => setTaskDescription(event.target.value)}
              placeholder="Optional details for the task"
              value={taskDescription}
            />
            <div className="flex justify-end">
              <Button
                className="w-full sm:w-auto"
                disabled={savingTask}
                type="submit"
              >
                {savingTask ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>
          {errorMessage && (
            <p className="text-destructive text-xs">{errorMessage}</p>
          )}
        </form>

        <div className="space-y-1">
          {loading && (
            <div className="text-muted-foreground text-xs">
              Loading tasks...
            </div>
          )}
          {!loading && sortedTasks.length === 0 && (
            <div className="rounded-md border border-border/70 border-dashed bg-muted/20 px-3 py-4 text-muted-foreground text-xs">
              No tasks yet. Add one above to get started.
            </div>
          )}
          {!loading &&
            displayTasks.length > 0 &&
            displayTasks.map((task) => {
              const isCompleted = task.status === "completed";
              const isEditing = editingTaskId === task.id;
              return (
                <div className="space-y-1" key={task.id}>
                  <div className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60">
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
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEditingTask(task);
                      }}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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

                  {isEditing && (
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                      <div className="grid gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`task-edit-title-${task.id}`}>
                            Title
                          </Label>
                          <Input
                            id={`task-edit-title-${task.id}`}
                            onChange={(event) =>
                              setEditingDraft((prev) => ({
                                ...prev,
                                title: event.target.value,
                              }))
                            }
                            value={editingDraft.title}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`task-edit-desc-${task.id}`}>
                            Details
                          </Label>
                          <Textarea
                            id={`task-edit-desc-${task.id}`}
                            onChange={(event) =>
                              setEditingDraft((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                            value={editingDraft.description}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`task-edit-due-${task.id}`}>
                            Due date
                          </Label>
                          <Input
                            id={`task-edit-due-${task.id}`}
                            onChange={(event) =>
                              setEditingDraft((prev) => ({
                                ...prev,
                                dueAt: event.target.value,
                              }))
                            }
                            type="datetime-local"
                            value={editingDraft.dueAt}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={cancelEditingTask}
                            type="button"
                            variant="outline"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              handleSaveTask(task.id).catch(() => undefined);
                            }}
                            type="button"
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
