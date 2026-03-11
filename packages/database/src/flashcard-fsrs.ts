import {
  type Card,
  createEmptyCard,
  fsrs,
  Rating,
  type ReviewLog,
  State,
} from "ts-fsrs";

export type FlashcardRating = "again" | "hard" | "good" | "easy";
export type FlashcardReviewStateName =
  | "new"
  | "learning"
  | "review"
  | "relearning";

export interface PersistedFlashcardSchedulerState {
  difficulty: number | null;
  dueAt: string;
  elapsedDays: number;
  lapses: number;
  lastReviewedAt: string | null;
  reps: number;
  scheduledDays: number;
  stability: number | null;
  state: FlashcardReviewStateName;
}

export interface NormalizedImportedFlashcardCard {
  back: string;
  front: string;
  notes: string | null;
  source: Record<string, unknown>;
  tags: string[];
}

export interface DueQueueComparable {
  dueAt: string | null;
  id: string;
  ordinal: number;
  setTitle: string;
}

const scheduler = fsrs();

const ratingMap: Record<FlashcardRating, Exclude<Rating, Rating.Manual>> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function mapStateToName(state: State): FlashcardReviewStateName {
  switch (state) {
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    case State.Relearning:
      return "relearning";
    default:
      return "new";
  }
}

function mapNameToState(state: FlashcardReviewStateName): State {
  switch (state) {
    case "learning":
      return State.Learning;
    case "review":
      return State.Review;
    case "relearning":
      return State.Relearning;
    default:
      return State.New;
  }
}

function sanitizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return null;
  }

  return value as Record<string, unknown>;
}

function sanitizeCardText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function createSchedulerCardFromState(
  state: PersistedFlashcardSchedulerState | null | undefined,
  now: Date
): Card {
  if (!state) {
    return createEmptyCard(now);
  }

  return {
    due: new Date(state.dueAt),
    stability: state.stability ?? 0,
    difficulty: state.difficulty ?? 0,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: 0,
    reps: state.reps,
    lapses: state.lapses,
    state: mapNameToState(state.state),
    last_review: state.lastReviewedAt
      ? new Date(state.lastReviewedAt)
      : undefined,
  };
}

export function applyFlashcardReview(input: {
  now?: Date;
  rating: FlashcardRating;
  state?: PersistedFlashcardSchedulerState | null;
}) {
  const now = input.now ?? new Date();
  const card = createSchedulerCardFromState(input.state, now);
  const scheduled = scheduler.next(card, now, ratingMap[input.rating]);

  return {
    nextState: mapCardToPersistedState(scheduled.card),
    reviewLog: mapReviewLogToPersistedLog(scheduled.log),
  };
}

export function mapCardToPersistedState(
  card: Card
): PersistedFlashcardSchedulerState {
  return {
    difficulty: card.difficulty,
    dueAt: card.due.toISOString(),
    elapsedDays: card.elapsed_days,
    lapses: card.lapses,
    lastReviewedAt: card.last_review ? card.last_review.toISOString() : null,
    reps: card.reps,
    scheduledDays: card.scheduled_days,
    stability: card.stability,
    state: mapStateToName(card.state),
  };
}

export function mapReviewLogToPersistedLog(log: ReviewLog) {
  return {
    dueAt: log.due.toISOString(),
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    learningSteps: log.learning_steps,
    rating: mapRatingToName(log.rating),
    reviewedAt: log.review.toISOString(),
    scheduledDays: log.scheduled_days,
    stability: log.stability,
    state: mapStateToName(log.state),
  };
}

export function mapRatingToName(rating: Rating): FlashcardRating {
  switch (rating) {
    case Rating.Hard:
      return "hard";
    case Rating.Good:
      return "good";
    case Rating.Easy:
      return "easy";
    default:
      return "again";
  }
}

export function normalizeImportedFlashcardCards(
  content: Record<string, unknown>
): NormalizedImportedFlashcardCard[] {
  let cardsSource: unknown[] = [];
  if (Array.isArray(content.cards)) {
    cardsSource = content.cards;
  } else if (Array.isArray(content.flashcards)) {
    cardsSource = content.flashcards;
  }

  const normalized: NormalizedImportedFlashcardCard[] = [];

  for (const [index, item] of cardsSource.entries()) {
    const record = asObjectRecord(item);
    if (!record) {
      continue;
    }

    const front = sanitizeCardText(record.front);
    const back = sanitizeCardText(record.back);
    if (!(front && back)) {
      continue;
    }

    normalized.push({
      back,
      front,
      notes: sanitizeCardText(record.notes) || null,
      source: {
        importIndex: index,
        ...(typeof record.interval !== "undefined"
          ? { interval: record.interval }
          : {}),
      },
      tags: sanitizeTags(record.tags),
    });
  }

  return normalized;
}

export function compareDueQueueItems(
  a: DueQueueComparable,
  b: DueQueueComparable
) {
  if (a.dueAt && b.dueAt) {
    const dueDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    if (dueDiff !== 0) {
      return dueDiff;
    }
  } else if (a.dueAt && !b.dueAt) {
    return -1;
  } else if (!a.dueAt && b.dueAt) {
    return 1;
  }

  const titleDiff = a.setTitle.localeCompare(b.setTitle);
  if (titleDiff !== 0) {
    return titleDiff;
  }

  if (a.ordinal !== b.ordinal) {
    return a.ordinal - b.ordinal;
  }

  return a.id.localeCompare(b.id);
}
