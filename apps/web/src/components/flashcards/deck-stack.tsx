"use client";

import { Badge } from "@avenire/ui/components/badge";
import { cn } from "@avenire/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { FlashcardFlipCard } from "@/components/flashcards/flip-card";

export interface FlashcardDeckItem {
  back: ReactNode;
  front: ReactNode;
  id: string;
  meta?: React.ReactNode;
  title?: string;
}

interface FlashcardDeckStackProps {
  autoAdvanceMs?: number;
  cards: FlashcardDeckItem[];
  className?: string;
  deckLabel?: string;
  flipped?: boolean;
  onFlippedChange?: (next: boolean) => void;
  onOrderChange?: (nextCards: FlashcardDeckItem[]) => void;
  showCounter?: boolean;
  showDeckLabel?: boolean;
}

const deckSpring = {
  damping: 24,
  stiffness: 140,
  type: "spring" as const,
};

export function FlashcardDeckStack({
  autoAdvanceMs,
  cards,
  className,
  flipped,
  onFlippedChange,
  onOrderChange,
  showCounter = true,
  showDeckLabel = true,
  deckLabel = "Deck",
}: FlashcardDeckStackProps) {
  const [internalCards, setInternalCards] = useState(cards);
  const [internalFlipped, setInternalFlipped] = useState(false);

  useLayoutEffect(() => {
    setInternalCards(cards);
    setInternalFlipped(false);
  }, [cards]);

  const activeCards = internalCards;
  const currentCard = activeCards[0] ?? null;
  const currentCardId = currentCard?.id ?? null;
  const nextCards = activeCards.slice(1, 4);
  const isControlledFlipped = typeof flipped === "boolean";
  const isFlipped = isControlledFlipped ? flipped : internalFlipped;

  useEffect(() => {
    if (!autoAdvanceMs || activeCards.length <= 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInternalCards((current) => {
        if (current.length <= 1) {
          return current;
        }
        const [head, ...rest] = current;
        const next = [...rest, head];
        onOrderChange?.(next);
        return next;
      });
      if (isControlledFlipped) {
        onFlippedChange?.(false);
      } else {
        setInternalFlipped(false);
      }
    }, autoAdvanceMs);

    return () => window.clearTimeout(timer);
  }, [
    currentCardId,
    autoAdvanceMs,
    isControlledFlipped,
    onFlippedChange,
    onOrderChange,
  ]);

  if (!currentCard) {
    return null;
  }

  const handleFlipChange = (next: boolean) => {
    if (isControlledFlipped) {
      onFlippedChange?.(next);
      return;
    }
    setInternalFlipped(next);
    onFlippedChange?.(next);
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      {showDeckLabel ? (
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="space-y-0.5">
            <p className="font-medium text-foreground text-sm">{deckLabel}</p>
            <p className="text-muted-foreground text-xs">
              {activeCards.length} card{activeCards.length === 1 ? "" : "s"}
            </p>
          </div>
          {showCounter ? (
            <Badge className="rounded-sm" variant="outline">
              {currentCard.title ?? "Current"}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="relative h-[22rem] overflow-visible sm:h-[26rem] md:h-[32rem]">
        {nextCards.slice(0, 2).map((card, index) => {
          const stackIndex = index + 1;
          return (
            <motion.div
              animate={{
                opacity: Math.max(0.18, 0.92 - stackIndex * 0.18),
                rotate: stackIndex * -0.8,
                scale: 1 - stackIndex * 0.045,
                y: stackIndex * 18,
              }}
              className="absolute inset-x-3 top-3"
              key={card.id}
              transition={deckSpring}
            >
              <div className="overflow-hidden rounded-[1.45rem] border border-border/45 bg-card/80 p-5">
                <div className="space-y-2">
                  <p className="line-clamp-2 text-foreground text-sm">
                    {card.title ?? "Flashcard"}
                  </p>
                  <p className="line-clamp-3 text-muted-foreground text-xs">
                    {typeof card.front === "string" ? card.front : "Preview"}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}

        <AnimatePresence mode="popLayout">
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute inset-0"
            exit={{ opacity: 0, scale: 0.95, y: -18 }}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            key={currentCard.id}
            layout
            transition={deckSpring}
          >
            <FlashcardFlipCard
              back={currentCard.back}
              className="h-full"
              flipped={isFlipped}
              front={currentCard.front}
              onFlippedChange={handleFlipChange}
              surfaceClassName="border-border/45 bg-card/90"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs">
        <span className="text-muted-foreground">
          {showCounter
            ? `${Math.min(activeCards.length, 1)} active · ${Math.max(activeCards.length - 1, 0)} queued`
            : null}
        </span>
      </div>
    </div>
  );
}
