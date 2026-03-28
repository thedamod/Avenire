"use client";

import { Button } from "@avenire/ui/components/button";
import { motion } from "motion/react";
import { memo } from "react";

interface SuggestedActionsProps {
  onAction: (text: string) => void;
}

function PureSuggestedActions({ onAction }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: "Explain the twin paradox",
      label: "with a visual analogy",
      action: "Explain the twin paradox with a visual analogy",
    },
    {
      title: "Summarize the French Revolution",
      label: "like a high school teacher would",
      action:
        "Summarize the French Revolution like a high school teacher would",
    },
    {
      title: "Generate 5 quiz questions",
      label: "about Newton's three laws",
      action: "Generate 5 quiz questions about Newton's three laws",
    },
    {
      title: "Compare reinforcement learning",
      label: "to how humans form habits",
      action: "Compare reinforcement learning to how humans form habits",
    },
  ];

  return (
    <div
      className="mx-auto mt-2 grid w-full max-w-3xl gap-2 px-3 sm:grid-cols-2 sm:px-0"
      data-testid="suggested-actions"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
          exit={{ opacity: 0, y: 20 }}
          initial={{ opacity: 0, y: 20 }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          transition={{ delay: 0.05 * index }}
        >
          <Button
            className="h-auto w-full justify-start overflow-hidden whitespace-nowrap rounded-2xl border border-border/80 bg-card px-4 py-3 text-left text-muted-foreground text-sm hover:bg-accent/40 hover:text-foreground"
            onClick={() => {
              onAction(suggestedAction.action);
            }}
            type="button"
            variant="outline"
          >
            <span className="block min-w-0 overflow-hidden text-clip whitespace-nowrap">
              <span className="font-medium">{suggestedAction.title}</span>
              <span className="text-muted-foreground/80 lowercase">
                {" "}
                - {suggestedAction.label}
              </span>
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
