import { describe, expect, it } from "vitest";
import {
  applyFlashcardReview,
  compareDueQueueItems,
  normalizeImportedFlashcardCards,
} from "./flashcard-fsrs";

describe("flashcard-fsrs", () => {
  it("normalizes imported flashcard cards", () => {
    const cards = normalizeImportedFlashcardCards({
      cards: [
        { back: "Answer", front: "Prompt", notes: "Hint", tags: ["a", "b"] },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      back: "Answer",
      front: "Prompt",
      notes: "Hint",
      tags: ["a", "b"],
    });
  });

  it("orders due cards before new cards and earlier due dates first", () => {
    const earlier = {
      dueAt: "2026-01-01T08:00:00.000Z",
      id: "a",
      ordinal: 1,
      setTitle: "Alpha",
    };
    const later = {
      dueAt: "2026-01-02T08:00:00.000Z",
      id: "b",
      ordinal: 1,
      setTitle: "Alpha",
    };
    const newCard = {
      dueAt: null,
      id: "c",
      ordinal: 1,
      setTitle: "Alpha",
    };

    expect(compareDueQueueItems(earlier, later)).toBeLessThan(0);
    expect(compareDueQueueItems(later, newCard)).toBeLessThan(0);
  });

  it("advances scheduler state from a new card review", () => {
    const result = applyFlashcardReview({
      now: new Date("2026-01-01T08:00:00.000Z"),
      rating: "good",
    });

    expect(result.nextState.reps).toBeGreaterThan(0);
    expect(new Date(result.nextState.dueAt).getTime()).toBeGreaterThan(
      new Date("2026-01-01T08:00:00.000Z").getTime()
    );
    expect(result.reviewLog.rating).toBe("good");
  });
});
