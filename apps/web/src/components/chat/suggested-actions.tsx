"use client";

import { memo } from "react";
import { motion } from "motion/react";

interface SuggestedActionsProps {
  onAction: (text: string) => void;
}

/**
 * Renders a vertically stacked list of suggested action buttons and invokes a callback when one is selected.
 *
 * Each rendered item displays a title with a short label and calls `onAction` with the item's action string when clicked.
 *
 * @param onAction - Callback invoked with the selected action text
 * @returns The React element containing the list of suggested action buttons
 */
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
      data-testid="suggested-actions"
      className="w-full max-w-3xl mx-auto mt-3 flex flex-col gap-2"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className="w-full"
        >
          <button
            type="button"
            onClick={() => {
              onAction(suggestedAction.action);
            }}
            className="block text-left px-1 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="truncate"> - {suggestedAction.label}</span>
          </button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
