"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { cn } from "@avenire/ui/lib/utils";
import { Spinner } from "@avenire/ui/components/spinner";
import {
  BookOpen, CalendarDots as CalendarDays, Calendar as CalendarRange, CaretLeft as ChevronLeft, CaretRight as ChevronRight, ListChecks as ListTodo } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

export type CalendarMode = "month" | "week";

export interface RevisionItem {
  dueCount: number;
  id: string;
  setId: string;
  title: string;
}

export type RevisionData = Record<string, RevisionItem[]>;

interface UpcomingTask {
  description: string | null;
  dueAt: string | null;
  id: string;
  status: "pending" | "in_progress" | "completed";
  title: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

const addUtcDays = (date: Date, days: number) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days
    )
  );

const dateKeyUtc = (date: Date) =>
  startOfUtcDay(date).toISOString().slice(0, 10);

async function fetchUpcomingTasks() {
  const response = await fetch("/api/tasks?includeCompleted=false&limit=8", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to load upcoming tasks.");
  }

  const payload = (await response.json()) as { tasks?: UpcomingTask[] };
  return payload.tasks ?? [];
}

const getDaysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const getFirstDay = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).getUTCDay();

const getWeekStartUtc = (date: Date) => {
  const base = startOfUtcDay(date);
  return addUtcDays(base, -base.getUTCDay());
};

const getWeekDates = (sunday: Date) =>
  Array.from({ length: 7 }, (_, idx) => addUtcDays(sunday, idx));

const formatRangeLabel = (
  mode: CalendarMode,
  year: number,
  month: number,
  weekStart: Date
) => {
  if (mode === "month") {
    return `${MONTHS[month]} ${year}`;
  }
  const end = addUtcDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (weekStart.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${weekStart.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  if (weekStart.getUTCMonth() !== end.getUTCMonth()) {
    return `${weekStart.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  return `${weekStart.toLocaleDateString("en-US", opts)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
};

const getMonthRange = (year: number, month: number) => {
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month, getDaysInMonth(year, month)));
  return { from, to };
};

const getWeekRange = (weekStart: Date) => ({
  from: weekStart,
  to: addUtcDays(weekStart, 6),
});

const formatTaskDue = (dueAt: string | null) => {
  if (!dueAt) {
    return "No due date";
  }

  return new Date(dueAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

interface PopoverPos {
  left: number;
  originX: string;
  top: number;
}

function DayPopover({
  dayKey: dk,
  items,
  tasks,
  pos,
  onClose,
}: {
  dayKey: string;
  items: RevisionItem[];
  tasks: UpcomingTask[];
  pos: PopoverPos;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const total = items.reduce((s, i) => s + i.dueCount, 0);
  const label = new Date(`${dk}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(
      () => document.addEventListener("mousedown", handler),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
      exit={{
        opacity: 0,
        scale: 0.96,
        y: -4,
        transition: { duration: 0.12, ease: "easeIn" },
      }}
      initial={{ opacity: 0, scale: 0.94, y: -6 }}
      key={dk}
      ref={ref}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        transformOrigin: `${pos.originX} top`,
        zIndex: 50,
        width: 272,
      }}
      transition={{ type: "spring", stiffness: 340, damping: 26, mass: 0.9 }}
    >
      <div className="border-border border-b px-4 pt-3 pb-2.5">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
          {label}
        </p>
        <p className="mt-0.5 font-semibold text-base text-foreground">
          {total}{" "}
          <span className="font-normal text-muted-foreground text-sm">
            cards due
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-0.5 p-1.5">
        {items.map((item, idx) => (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
            initial={{ opacity: 0, x: -8 }}
            key={item.id}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 28,
              delay: 0.04 + idx * 0.04,
            }}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground text-sm leading-none">
                {item.title}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold text-foreground text-sm">
                {item.dueCount}
              </span>
            </div>
          </motion.div>
        ))}
        {tasks.length > 0 ? (
          <div className="border-border/70 border-t px-3 pt-2 pb-1">
            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              Tasks
            </p>
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <div
                  className="flex items-start gap-2 rounded-lg bg-secondary/40 px-2 py-1.5"
                  key={task.id}
                >
                  <ListTodo className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground text-xs font-medium">
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-muted-foreground text-[10px]">
                      {task.dueAt ? formatTaskDue(task.dueAt) : "No due date"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function DayCell({
  day,
  dayKey: dk,
  items,
  tasks,
  isToday,
  isActive,
  onClick,
  tall = false,
}: {
  day: number;
  dayKey: string;
  items: RevisionItem[];
  tasks: UpcomingTask[];
  isToday: boolean;
  isActive: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>, key: string) => void;
  tall?: boolean;
}) {
  const hasItems = items.length > 0;
  const hasTasks = tasks.length > 0;
  const shown = items.slice(0, tall ? 5 : 2);
  const overflow = items.length - shown.length;
  const shownTasks = tasks.slice(0, tall ? 3 : 1);
  const taskOverflow = tasks.length - shownTasks.length;

  return (
    <button
      className={cn(
        "relative flex w-full select-none flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors duration-150",
        tall ? "min-h-[190px]" : "min-h-[108px]",
        hasItems || hasTasks ? "cursor-pointer" : "cursor-default",
        isActive && "border-primary/50 bg-primary/5",
        !isActive && isToday && "border-primary/30 bg-primary/[0.04]",
        !(isActive || isToday) && "border-border bg-card hover:bg-muted/50",
        !(hasItems || hasTasks) && "opacity-50"
      )}
      disabled={!(hasItems || hasTasks)}
      onClick={(e) => (hasItems || hasTasks) && onClick(e, dk)}
      type="button"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-sm leading-none",
            isToday
              ? "font-semibold text-primary"
              : "font-normal text-muted-foreground"
          )}
        >
          {day}
        </span>
        {isToday && (
          <Badge
            className="h-4 rounded-sm border-primary/20 bg-primary/10 px-1.5 font-medium text-[9px] text-primary"
            variant="secondary"
          >
            today
          </Badge>
        )}
      </div>

      {(hasItems || hasTasks) && (
        <div className="flex w-full flex-col gap-1">
          {shown.map((item) => (
            <div
              className="flex items-center gap-1.5 rounded-[5px] bg-muted/40 px-1.5 py-0.5"
              key={item.id}
            >
              <BookOpen className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {item.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {item.dueCount}
              </span>
            </div>
          ))}
          {overflow > 0 && (
            <span className="pl-0.5 text-[10px] text-muted-foreground">
              +{overflow} more
            </span>
          )}
          {shownTasks.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1">
              {shownTasks.map((task) => (
                <div
                  className="flex items-center gap-1.5 rounded-[5px] bg-amber-500/10 px-1.5 py-0.5"
                  key={task.id}
                >
                  <ListTodo className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                    {task.title}
                  </span>
                </div>
              ))}
              {taskOverflow > 0 && (
                <span className="pl-0.5 text-[10px] text-muted-foreground">
                  +{taskOverflow} more tasks
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </button>
  );
}

function MonthGrid({
  curYear,
  curMonth,
  data,
  tasksByDay,
  activeKey,
  todayKey,
  onDayClick,
}: {
  curYear: number;
  curMonth: number;
  data: RevisionData;
  tasksByDay: Record<string, UpcomingTask[]>;
  activeKey: string | null;
  todayKey: string;
  onDayClick: (e: React.MouseEvent<HTMLButtonElement>, key: string) => void;
}) {
  const daysInMonth = getDaysInMonth(curYear, curMonth);
  const firstDay = getFirstDay(curYear, curMonth);
  const cells: (number | null)[] = [
    ...new Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAYS_SHORT.map((d) => (
          <div
            className="py-1.5 text-center font-medium text-[11px] text-muted-foreground"
            key={d}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) =>
          day == null ? (
            <div className="min-h-[84px]" key={`empty-${i}`} />
          ) : (
            <DayCell
              day={day}
              dayKey={dateKeyUtc(new Date(Date.UTC(curYear, curMonth, day)))}
              isActive={
                activeKey ===
                dateKeyUtc(new Date(Date.UTC(curYear, curMonth, day)))
              }
              isToday={
                dateKeyUtc(new Date(Date.UTC(curYear, curMonth, day))) ===
                todayKey
              }
              items={
                data[dateKeyUtc(new Date(Date.UTC(curYear, curMonth, day)))] ??
                []
              }
              tasks={
                tasksByDay[
                  dateKeyUtc(new Date(Date.UTC(curYear, curMonth, day)))
                ] ?? []
              }
              key={day}
              onClick={onDayClick}
            />
          )
        )}
      </div>
    </>
  );
}

function WeekGrid({
  weekStart,
  data,
  tasksByDay,
  activeKey,
  todayKey,
  onDayClick,
}: {
  weekStart: Date;
  data: RevisionData;
  tasksByDay: Record<string, UpcomingTask[]>;
  activeKey: string | null;
  todayKey: string;
  onDayClick: (e: React.MouseEvent<HTMLButtonElement>, key: string) => void;
}) {
  const days = getWeekDates(weekStart);

  return (
    <>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {days.map((_, i) => (
          <div
            className="py-1.5 text-center font-medium text-[11px] text-muted-foreground"
            key={i}
          >
            {DAYS_FULL[i]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = dateKeyUtc(d);
          return (
            <DayCell
              day={d.getUTCDate()}
              dayKey={k}
              isActive={activeKey === k}
              isToday={k === todayKey}
              items={data[k] ?? []}
              tasks={tasksByDay[k] ?? []}
              key={k}
              onClick={onDayClick}
              tall
            />
          );
        })}
      </div>
    </>
  );
}

export function StudentCalendar() {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<CalendarMode>("month");
  const [curYear, setCurYear] = useState(today.getUTCFullYear());
  const [curMonth, setCurMonth] = useState(today.getUTCMonth());
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStartUtc(today)
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const [data, setData] = useState<RevisionData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, RevisionData>>(new Map());
  const tasksLoadedRef = useRef(false);
  const tasksRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const loadTasks = (background = false) => {
      if (tasksRequestRef.current) {
        return tasksRequestRef.current;
      }

      const showLoading = !background && !tasksLoadedRef.current;
      if (showLoading) {
        setTasksLoading(true);
        setTasksError(null);
      }

      tasksRequestRef.current = (async () => {
        try {
          const nextTasks = await fetchUpcomingTasks();
          tasksLoadedRef.current = true;
          setUpcomingTasks(nextTasks);
          setTasksError(null);
        } catch (err) {
          if (showLoading || !tasksLoadedRef.current) {
            setTasksError(
              err instanceof Error
                ? err.message
                : "Unable to load upcoming tasks."
            );
          }
        } finally {
          if (showLoading) {
            setTasksLoading(false);
          }
          tasksRequestRef.current = null;
        }
      })();

      return tasksRequestRef.current;
    };

    loadTasks().catch(() => undefined);

    const refresh = () => {
      loadTasks(true).catch(() => undefined);
    };

    window.addEventListener("dashboard.tasks.refresh", refresh);
    return () => {
      window.removeEventListener("dashboard.tasks.refresh", refresh);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const { from, to } =
      mode === "month"
        ? getMonthRange(curYear, curMonth)
        : getWeekRange(weekStart);

    const rangeKey = `${mode}-${dateKeyUtc(from)}-${dateKeyUtc(to)}`;
    const cached = cacheRef.current.get(rangeKey);
    if (cached) {
      setData(cached);
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          from: dateKeyUtc(from),
          to: dateKeyUtc(to),
        });
        const response = await fetch(
          `/api/flashcards/revision-calendar?${params.toString()}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error("Unable to load revision calendar.");
        }
        const payload = (await response.json()) as { data?: RevisionData };
        const nextData = payload.data ?? {};
        cacheRef.current.set(rangeKey, nextData);
        setData(nextData);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load revision calendar."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [curMonth, curYear, isActive, mode, weekStart]);

  const todayKey = dateKeyUtc(today);
  const headerLabel = formatRangeLabel(mode, curYear, curMonth, weekStart);

  const periodKey =
    mode === "month"
      ? `m-${curYear}-${curMonth}`
      : `w-${weekStart.toISOString().slice(0, 10)}`;

  const totalDue = useMemo(() => {
    if (mode === "month") {
      const prefix = `${curYear}-${String(curMonth + 1).padStart(2, "0")}`;
      return Object.entries(data)
        .filter(([k]) => k.startsWith(prefix))
        .reduce(
          (acc, [, items]) => acc + items.reduce((s, i) => s + i.dueCount, 0),
          0
        );
    }
    return getWeekDates(weekStart).reduce((acc, d) => {
      const k = dateKeyUtc(d);
      return acc + (data[k] ?? []).reduce((s, i) => s + i.dueCount, 0);
    }, 0);
  }, [curMonth, curYear, data, mode, weekStart]);

  const activeItems = activeKey ? (data[activeKey] ?? []) : [];
  const sortedUpcomingTasks = useMemo(
    () =>
      upcomingTasks
        .slice()
        .sort((left, right) => {
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
          return left.title.localeCompare(right.title);
        })
        .slice(0, 6),
    [upcomingTasks]
  );
  const tasksByDay = useMemo(() => {
    return upcomingTasks.reduce<Record<string, UpcomingTask[]>>((acc, task) => {
      if (!task.dueAt) {
        return acc;
      }
      const key = dateKeyUtc(new Date(task.dueAt));
      const next = acc[key] ?? [];
      next.push(task);
      acc[key] = next;
      return acc;
    }, {});
  }, [upcomingTasks]);

  const jumpToTaskManager = () => {
    const element = document.getElementById("task-manager");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  let taskFeedContent: React.ReactNode;
  if (tasksLoading) {
    taskFeedContent = (
      <div className="inline-flex w-full items-center gap-2 rounded-lg border border-border/70 border-dashed px-3 py-4 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        Loading upcoming tasks...
      </div>
    );
  } else if (tasksError) {
    taskFeedContent = (
      <div className="w-full rounded-lg border border-border/70 border-dashed px-3 py-4 text-xs text-muted-foreground">
        {tasksError}
      </div>
    );
  } else if (sortedUpcomingTasks.length === 0) {
    taskFeedContent = (
      <div className="w-full rounded-lg border border-border/70 border-dashed px-3 py-4 text-xs text-muted-foreground">
        No upcoming tasks yet.
      </div>
    );
  } else {
    taskFeedContent = sortedUpcomingTasks.map((task) => (
      <button
        className="min-w-[12.5rem] flex-1 rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:min-w-[14rem]"
        key={task.id}
        onClick={jumpToTaskManager}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {task.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {task.description?.trim()
                ? task.description
                : "Open the task manager to add details or change the date."}
            </p>
          </div>
          <Badge className="shrink-0 rounded-sm" variant="outline">
            {formatTaskDue(task.dueAt)}
          </Badge>
        </div>
      </button>
    ));
  }

  const handleDayClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    key: string
  ) => {
    if (activeKey === key) {
      setActiveKey(null);
      return;
    }

    const cell = e.currentTarget.getBoundingClientRect();
    const containerEl = containerRef.current;
    if (!containerEl) {
      return;
    }
    const container = containerEl.getBoundingClientRect();

    const rawLeft = cell.left - container.left;
    const left = Math.max(0, Math.min(rawLeft, container.width - 280));
    const top = cell.bottom - container.top + 8;
    const originX = `${cell.left - container.left + cell.width / 2 - left}px`;

    setPopoverPos({ top, left, originX });
    setActiveKey(key);
  };

  const navigate = (forward: boolean) => {
    setDir(forward ? 1 : -1);
    setActiveKey(null);
    if (mode === "month") {
      setCurMonth((prev) => {
        if (forward) {
          if (prev === 11) {
            setCurYear((year) => year + 1);
            return 0;
          }
          return prev + 1;
        }
        if (prev === 0) {
          setCurYear((year) => year - 1);
          return 11;
        }
        return prev - 1;
      });
      return;
    }
    setWeekStart((prev) => addUtcDays(prev, forward ? 7 : -7));
  };

  const goToday = () => {
    setDir(1);
    setActiveKey(null);
    setCurYear(today.getUTCFullYear());
    setCurMonth(today.getUTCMonth());
    setWeekStart(getWeekStartUtc(today));
  };

  return (
    <div className="relative w-full space-y-3" ref={containerRef}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <AnimatePresence initial={false} mode="wait">
            <motion.h2
              animate={{
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 300, damping: 28 },
              }}
              className="font-medium text-foreground text-sm tracking-tight"
              exit={{ opacity: 0, y: 5, transition: { duration: 0.12 } }}
              initial={{ opacity: 0, y: -5 }}
              key={headerLabel}
            >
              {headerLabel}
            </motion.h2>
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge
            className="font-normal text-muted-foreground text-xs"
            variant="outline"
          >
            <span className="mr-1 font-semibold text-foreground">
              {totalDue}
            </span>
            cards due
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          className="h-7 w-7"
          onClick={() => navigate(false)}
          size="icon"
          variant="outline"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          className="h-7 w-7"
          onClick={() => navigate(true)}
          size="icon"
          variant="outline"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          className="h-7 px-2.5 text-xs"
          onClick={goToday}
          size="sm"
          variant="outline"
        >
          Today
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {(["month", "week"] as CalendarMode[]).map((m) => (
            <button
              className={cn(
                "flex h-6 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={m}
              onClick={() => {
                setMode(m);
                setActiveKey(null);
              }}
              type="button"
            >
              {m === "month" ? (
                <CalendarDays className="h-3 w-3" />
              ) : (
                <CalendarRange className="h-3 w-3" />
              )}
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="min-w-0 space-y-3">
          {loading ? (
            <div className="inline-flex items-center gap-2 text-muted-foreground text-xs">
              <Spinner className="size-3.5" />
              Loading upcoming reviews...
            </div>
          ) : null}
          {error ? (
            <div className="text-muted-foreground text-xs">{error}</div>
          ) : null}

          <div className="overflow-hidden">
            <AnimatePresence custom={dir} initial={false} mode="wait">
              <motion.div
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: {
                    type: "spring",
                    stiffness: 280,
                    damping: 28,
                    mass: 0.85,
                  },
                }}
                custom={dir}
                exit={{
                  opacity: 0,
                  x: dir * -30,
                  transition: { duration: 0.15, ease: [0.32, 0, 0.67, 0] },
                }}
                initial={{ opacity: 0, x: dir * 40 }}
                key={periodKey}
              >
                {mode === "month" ? (
                  <MonthGrid
                    activeKey={activeKey}
                    curMonth={curMonth}
                    curYear={curYear}
                    data={data}
                    tasksByDay={tasksByDay}
                    onDayClick={handleDayClick}
                    todayKey={todayKey}
                  />
                ) : (
                  <WeekGrid
                    activeKey={activeKey}
                    data={data}
                    tasksByDay={tasksByDay}
                    onDayClick={handleDayClick}
                    todayKey={todayKey}
                    weekStart={weekStart}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-foreground text-sm">
                <ListTodo className="size-4 text-muted-foreground" />
                Upcoming tasks
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Due tasks are embedded into the calendar. This feed stays in the
                same view.
              </p>
            </div>
            <Button
              className="shrink-0"
              onClick={jumpToTaskManager}
              size="sm"
              type="button"
              variant="ghost"
            >
              Manage
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {taskFeedContent}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeKey && popoverPos && (
          <DayPopover
            dayKey={activeKey}
            items={activeItems}
            tasks={tasksByDay[activeKey] ?? []}
            onClose={() => setActiveKey(null)}
            pos={popoverPos}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
