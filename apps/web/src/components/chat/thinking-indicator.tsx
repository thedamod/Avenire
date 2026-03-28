"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const circleA =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";

const infinityPath =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";

const circleB =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

const fallbackMessages = ["Thinking", "Moonwalking", "Planning", "Refining"];

function RotatingMessage({
  longestMessage,
  messages,
}: {
  longestMessage: string;
  messages: string[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [messages]);

  return (
    <span className="inline-grid overflow-hidden text-[13px] font-medium">
      <span
        aria-hidden="true"
        className="shimmer-text invisible col-start-1 row-start-1"
      >
        {longestMessage}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{
            opacity: 1,
            transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
            y: 0,
          }}
          className="shimmer-text col-start-1 row-start-1"
          exit={{
            opacity: 0,
            transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
            y: "-80%",
          }}
          initial={{ opacity: 0, y: "80%" }}
          key={messages[index]}
        >
          {messages[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ThinkingGlyph({ className }: { className?: string }) {
  return (
    <motion.svg
      aria-hidden
      className={cn("shrink-0 text-muted-foreground", className)}
      fill="none"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width="1em"
    >
      <motion.path
        animate={{
          d: [circleA, infinityPath, circleB, infinityPath, circleA],
        }}
        transition={{
          d: {
            duration: 6,
            ease: "easeInOut",
            repeat: Infinity,
            times: [0, 0.25, 0.5, 0.75, 1],
          },
        }}
      />
    </motion.svg>
  );
}

export const ThinkingIndicator = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { messages?: string[] }
>(function ThinkingIndicator({ className, messages, ...props }, ref) {
  const resolvedMessages = useMemo(() => {
    const nextMessages = (messages ?? [])
      .map((message) => message.trim())
      .filter(Boolean)
      .slice(0, 4);

    return nextMessages.length > 0 ? nextMessages : fallbackMessages;
  }, [messages]);

  const longestMessage = useMemo(
    () =>
      resolvedMessages.reduce((longest, word) =>
      longest.length >= word.length ? longest : word
      ),
    [resolvedMessages]
  );

  return (
    <div
      {...props}
      className={cn("flex items-center gap-2 px-3 py-2", className)}
      ref={ref}
      role="status"
      >
        <ThinkingGlyph className="size-5" />
      <RotatingMessage
        longestMessage={longestMessage}
        messages={resolvedMessages}
      />
    </div>
  );
});
