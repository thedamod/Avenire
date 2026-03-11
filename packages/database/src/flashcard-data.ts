import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { member } from "./auth-schema";
import { db } from "./client";
import {
  applyFlashcardReview,
  compareDueQueueItems,
  type FlashcardRating,
  type FlashcardReviewStateName,
  type PersistedFlashcardSchedulerState,
} from "./flashcard-fsrs";
import {
  flashcardCard,
  flashcardReviewLog,
  flashcardReviewState,
  flashcardSet,
  flashcardSetEnrollment,
  workspace,
} from "./schema";

export type FlashcardSourceType = "manual" | "ai-generated";
export type FlashcardCardKind = "flashcard" | "multiple_choice_quiz";
export type FlashcardEnrollmentStatus = "active" | "paused";
export type FlashcardDisplayState =
  | "new"
  | "learning"
  | "relearning"
  | "young"
  | "mature"
  | "suspended"
  | "killed";

export type FlashcardStateCounts = Record<FlashcardDisplayState, number>;

export interface FlashcardSetEnrollmentRecord {
  createdAt: string;
  id: string;
  lastStudiedAt: string | null;
  newCardsPerDay: number;
  setId: string;
  status: FlashcardEnrollmentStatus;
  updatedAt: string;
  userId: string;
}

export interface FlashcardCardRecord {
  backMarkdown: string;
  createdAt: string;
  frontMarkdown: string;
  id: string;
  kind: FlashcardCardKind;
  notesMarkdown: string | null;
  ordinal: number;
  payload: Record<string, unknown>;
  setId: string;
  source: Record<string, unknown>;
  tags: string[];
  updatedAt: string;
}

export interface FlashcardReviewStateRecord {
  createdAt: string;
  difficulty: number | null;
  dueAt: string;
  elapsedDays: number;
  flashcardId: string;
  id: string;
  lapses: number;
  lastRating: FlashcardRating | null;
  lastReviewedAt: string | null;
  reps: number;
  scheduledDays: number;
  schedulerVersion: number;
  stability: number | null;
  state: FlashcardReviewStateName;
  suspended: boolean;
  updatedAt: string;
  userId: string;
}

export interface FlashcardReviewLogRecord {
  flashcardId: string;
  id: string;
  nextState: FlashcardReviewStateName;
  previousState: FlashcardReviewStateName | null;
  rating: FlashcardRating;
  reviewedAt: string;
}

export interface FlashcardReviewEventRecord {
  card: FlashcardCardRecord;
  flashcardId: string;
  id: string;
  nextState: FlashcardReviewStateName;
  previousState: FlashcardReviewStateName | null;
  rating: FlashcardRating;
  reviewedAt: string;
  set: Pick<FlashcardSetSummary, "id" | "sourceType" | "title">;
}

export interface FlashcardCardSnapshot {
  archivedAt: string | null;
  card: FlashcardCardRecord;
  displayState: FlashcardDisplayState;
  dueAt: string | null;
  reviewState: FlashcardReviewStateRecord | null;
}

export interface FlashcardSetSummary {
  cardCount: number;
  description: string | null;
  dueCount: number;
  enrollmentStatus: FlashcardEnrollmentStatus | null;
  id: string;
  lastStudiedAt: string | null;
  newCount: number;
  reviewCount7d: number;
  reviewCountToday: number;
  sourceChatSlug: string | null;
  sourceType: FlashcardSourceType;
  tags: string[];
  title: string;
  updatedAt: string;
  workspaceId: string;
}

export interface FlashcardSetRecord extends FlashcardSetSummary {
  cardSnapshots: FlashcardCardSnapshot[];
  cards: FlashcardCardRecord[];
  enrollment: FlashcardSetEnrollmentRecord | null;
  recentReviews: FlashcardReviewLogRecord[];
  reviewEventsToday: FlashcardReviewEventRecord[];
  stateCounts: FlashcardStateCounts;
}

export interface FlashcardReviewQueueItem {
  card: FlashcardCardRecord;
  position: number;
  remainingDueCount: number;
  reviewState: FlashcardReviewStateRecord | null;
  set: Pick<FlashcardSetSummary, "id" | "sourceType" | "title">;
}

export interface FlashcardDashboardRecord {
  cardSnapshots: FlashcardCardSnapshot[];
  dueCount: number;
  newCount: number;
  reviewCount7d: number;
  reviewCountToday: number;
  reviewEventsToday: FlashcardReviewEventRecord[];
  sets: FlashcardSetSummary[];
  stateCounts: FlashcardStateCounts;
}

function sanitizeTitle(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed.slice(0, 160) : "Untitled Set";
}

function sanitizeCardKind(value: string | undefined | null): FlashcardCardKind {
  return value === "multiple_choice_quiz"
    ? "multiple_choice_quiz"
    : "flashcard";
}

function sanitizeDescription(value: string | undefined | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 600) : null;
}

function sanitizeTags(value: string[] | undefined | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeCardPayload(
  kind: FlashcardCardKind,
  value: Record<string, unknown> | undefined | null
) {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return {};
  }

  if (kind !== "multiple_choice_quiz") {
    return value;
  }

  const options = Array.isArray(value.options)
    ? value.options
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const correctOptionIndex =
    typeof value.correctOptionIndex === "number" &&
    Number.isInteger(value.correctOptionIndex)
      ? value.correctOptionIndex
      : 0;

  return {
    ...value,
    options,
    correctOptionIndex: Math.max(
      0,
      Math.min(correctOptionIndex, Math.max(0, options.length - 1))
    ),
    explanation:
      typeof value.explanation === "string"
        ? sanitizeDescription(value.explanation)
        : null,
  } satisfies Record<string, unknown>;
}

function createEmptyStateCounts(): FlashcardStateCounts {
  return {
    killed: 0,
    learning: 0,
    mature: 0,
    new: 0,
    relearning: 0,
    suspended: 0,
    young: 0,
  };
}

function startOfDay(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function sevenDaysAgo(date = new Date()) {
  return new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function mapEnrollment(
  row: typeof flashcardSetEnrollment.$inferSelect
): FlashcardSetEnrollmentRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    lastStudiedAt: row.lastStudiedAt ? row.lastStudiedAt.toISOString() : null,
    newCardsPerDay: row.newCardsPerDay,
    setId: row.setId,
    status: row.status as FlashcardEnrollmentStatus,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
  };
}

function mapCard(row: typeof flashcardCard.$inferSelect): FlashcardCardRecord {
  return {
    backMarkdown: row.backMarkdown,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: sanitizeCardKind(row.kind),
    notesMarkdown: row.notesMarkdown ?? null,
    ordinal: row.ordinal,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    setId: row.setId,
    source: row.source,
    tags: row.tags as string[],
    frontMarkdown: row.frontMarkdown,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReviewState(
  row: typeof flashcardReviewState.$inferSelect
): FlashcardReviewStateRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    difficulty: row.difficulty ?? null,
    dueAt: row.dueAt.toISOString(),
    elapsedDays: row.elapsedDays,
    flashcardId: row.flashcardId,
    id: row.id,
    lapses: row.lapses,
    lastRating: (row.lastRating as FlashcardRating | null) ?? null,
    lastReviewedAt: row.lastReviewedAt
      ? row.lastReviewedAt.toISOString()
      : null,
    reps: row.reps,
    scheduledDays: row.scheduledDays,
    schedulerVersion: row.schedulerVersion,
    stability: row.stability ?? null,
    state: row.state as FlashcardReviewStateName,
    suspended: row.suspended,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
  };
}

function mapReviewLog(
  row: typeof flashcardReviewLog.$inferSelect
): FlashcardReviewLogRecord {
  return {
    flashcardId: row.flashcardId,
    id: row.id,
    nextState: row.nextState as FlashcardReviewStateName,
    previousState:
      (row.previousState as FlashcardReviewStateName | null) ?? null,
    rating: row.rating as FlashcardRating,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}

async function workspaceAccessibleByUser(userId: string, workspaceId: string) {
  const [row] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .innerJoin(member, eq(member.organizationId, workspace.organizationId))
    .where(and(eq(workspace.id, workspaceId), eq(member.userId, userId)))
    .limit(1);

  return Boolean(row);
}

function listAccessibleSetRows(
  userId: string,
  workspaceId: string,
  setId?: string
) {
  return db
    .select({
      enrollment: flashcardSetEnrollment,
      set: flashcardSet,
    })
    .from(flashcardSet)
    .innerJoin(workspace, eq(workspace.id, flashcardSet.workspaceId))
    .innerJoin(
      member,
      and(
        eq(member.organizationId, workspace.organizationId),
        eq(member.userId, userId)
      )
    )
    .leftJoin(
      flashcardSetEnrollment,
      and(
        eq(flashcardSetEnrollment.setId, flashcardSet.id),
        eq(flashcardSetEnrollment.userId, userId)
      )
    )
    .where(
      and(
        eq(flashcardSet.workspaceId, workspaceId),
        isNull(flashcardSet.archivedAt),
        setId ? eq(flashcardSet.id, setId) : undefined
      )
    )
    .orderBy(desc(flashcardSet.updatedAt));
}

function listCardsForSetIds(
  setIds: string[],
  options?: { includeArchived?: boolean }
) {
  if (setIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(flashcardCard)
    .where(
      and(
        inArray(flashcardCard.setId, setIds),
        options?.includeArchived ? undefined : isNull(flashcardCard.archivedAt)
      )
    )
    .orderBy(flashcardCard.ordinal);
}

function listReviewStatesForCardIds(userId: string, cardIds: string[]) {
  if (cardIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(flashcardReviewState)
    .where(
      and(
        eq(flashcardReviewState.userId, userId),
        inArray(flashcardReviewState.flashcardId, cardIds)
      )
    );
}

function listReviewLogSetIdsSince(
  userId: string,
  setIds: string[],
  since: Date
) {
  if (setIds.length === 0) {
    return [];
  }

  return db
    .select({
      setId: flashcardCard.setId,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .where(
      and(
        eq(flashcardReviewLog.userId, userId),
        inArray(flashcardCard.setId, setIds),
        gte(flashcardReviewLog.reviewedAt, since)
      )
    );
}

function listRecentReviewLogsForSet(
  userId: string,
  setId: string,
  limit: number
) {
  return db
    .select({
      log: flashcardReviewLog,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .where(
      and(eq(flashcardReviewLog.userId, userId), eq(flashcardCard.setId, setId))
    )
    .orderBy(desc(flashcardReviewLog.reviewedAt))
    .limit(limit);
}

function listReviewEventsForSetIdsSince(
  userId: string,
  setIds: string[],
  since: Date
) {
  if (setIds.length === 0) {
    return [];
  }

  return db
    .select({
      card: flashcardCard,
      log: flashcardReviewLog,
      set: flashcardSet,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewLog.userId, userId),
        inArray(flashcardCard.setId, setIds),
        gte(flashcardReviewLog.reviewedAt, since)
      )
    )
    .orderBy(desc(flashcardReviewLog.reviewedAt));
}

function resolveFlashcardDisplayState(
  card: typeof flashcardCard.$inferSelect,
  reviewState: FlashcardReviewStateRecord | null
): FlashcardDisplayState {
  if (card.archivedAt) {
    return "killed";
  }

  if (!reviewState) {
    return "new";
  }

  if (reviewState.suspended) {
    return "suspended";
  }

  if (reviewState.state === "learning") {
    return "learning";
  }

  if (reviewState.state === "relearning") {
    return "relearning";
  }

  if (reviewState.state === "review") {
    return reviewState.scheduledDays >= 21 ? "mature" : "young";
  }

  return "new";
}

function mapCardSnapshot(
  card: typeof flashcardCard.$inferSelect,
  reviewState: FlashcardReviewStateRecord | null
): FlashcardCardSnapshot {
  return {
    archivedAt: card.archivedAt ? card.archivedAt.toISOString() : null,
    card: mapCard(card),
    displayState: resolveFlashcardDisplayState(card, reviewState),
    dueAt: reviewState?.dueAt ?? null,
    reviewState,
  };
}

function buildStateCounts(
  cards: (typeof flashcardCard.$inferSelect)[],
  reviewStates: Map<string, FlashcardReviewStateRecord>
) {
  const counts = createEmptyStateCounts();

  for (const card of cards) {
    const displayState = resolveFlashcardDisplayState(
      card,
      reviewStates.get(card.id) ?? null
    );
    counts[displayState] += 1;
  }

  return counts;
}

function mapReviewEvent(input: {
  card: typeof flashcardCard.$inferSelect;
  log: typeof flashcardReviewLog.$inferSelect;
  set: typeof flashcardSet.$inferSelect;
}): FlashcardReviewEventRecord {
  return {
    card: mapCard(input.card),
    flashcardId: input.log.flashcardId,
    id: input.log.id,
    nextState: input.log.nextState as FlashcardReviewStateName,
    previousState:
      (input.log.previousState as FlashcardReviewStateName | null) ?? null,
    rating: input.log.rating as FlashcardRating,
    reviewedAt: input.log.reviewedAt.toISOString(),
    set: {
      id: input.set.id,
      sourceType: input.set.sourceType as FlashcardSourceType,
      title: input.set.title,
    },
  };
}

function buildSetSummaries(input: {
  cards: (typeof flashcardCard.$inferSelect)[];
  enrollments: Map<string, FlashcardSetEnrollmentRecord | null>;
  now: Date;
  reviewCounts7d: Map<string, number>;
  reviewCountsToday: Map<string, number>;
  reviewStates: Map<string, FlashcardReviewStateRecord>;
  sets: (typeof flashcardSet.$inferSelect)[];
}): FlashcardSetSummary[] {
  const cardsBySetId = new Map<string, (typeof flashcardCard.$inferSelect)[]>();
  for (const card of input.cards) {
    const existing = cardsBySetId.get(card.setId) ?? [];
    existing.push(card);
    cardsBySetId.set(card.setId, existing);
  }

  return input.sets.map((set) => {
    const cards = cardsBySetId.get(set.id) ?? [];
    const enrollment = input.enrollments.get(set.id) ?? null;
    const activeEnrollment = enrollment?.status === "active";
    const dueCount = activeEnrollment
      ? cards.filter((card) => {
          const state = input.reviewStates.get(card.id);
          return Boolean(
            state && !state.suspended && new Date(state.dueAt) <= input.now
          );
        }).length
      : 0;
    const newCount = activeEnrollment
      ? cards.filter((card) => !input.reviewStates.has(card.id)).length
      : 0;

    return {
      cardCount: cards.length,
      description: set.description ?? null,
      dueCount,
      enrollmentStatus: enrollment?.status ?? null,
      id: set.id,
      lastStudiedAt: enrollment?.lastStudiedAt ?? null,
      newCount,
      reviewCountToday: input.reviewCountsToday.get(set.id) ?? 0,
      reviewCount7d: input.reviewCounts7d.get(set.id) ?? 0,
      sourceChatSlug: set.sourceChatSlug ?? null,
      sourceType: set.sourceType as FlashcardSourceType,
      tags: (set.tags as string[]) ?? [],
      title: set.title,
      updatedAt: set.updatedAt.toISOString(),
      workspaceId: set.workspaceId,
    } satisfies FlashcardSetSummary;
  });
}

async function hydrateSetSummaries(
  userId: string,
  workspaceId: string,
  setId?: string
) {
  const now = new Date();
  const rows = await listAccessibleSetRows(userId, workspaceId, setId);
  const sets = rows.map((row) => row.set);
  const setIds = sets.map((row) => row.id);
  const cards = await listCardsForSetIds(setIds);
  const states = await listReviewStatesForCardIds(
    userId,
    cards.map((card) => card.id)
  );
  const reviewTodayRows = await listReviewLogSetIdsSince(
    userId,
    setIds,
    startOfDay(now)
  );
  const review7dRows = await listReviewLogSetIdsSince(
    userId,
    setIds,
    sevenDaysAgo(now)
  );

  const reviewStates = new Map<string, FlashcardReviewStateRecord>();
  for (const row of states) {
    reviewStates.set(row.flashcardId, mapReviewState(row));
  }

  const enrollments = new Map<string, FlashcardSetEnrollmentRecord | null>();
  for (const row of rows) {
    enrollments.set(
      row.set.id,
      row.enrollment ? mapEnrollment(row.enrollment) : null
    );
  }
  const reviewCountsToday = new Map<string, number>();
  const reviewCounts7d = new Map<string, number>();

  for (const row of reviewTodayRows) {
    reviewCountsToday.set(
      row.setId,
      (reviewCountsToday.get(row.setId) ?? 0) + 1
    );
  }

  for (const row of review7dRows) {
    reviewCounts7d.set(row.setId, (reviewCounts7d.get(row.setId) ?? 0) + 1);
  }

  return {
    cards,
    reviewStates,
    rows,
    summaries: buildSetSummaries({
      cards,
      enrollments,
      now,
      reviewCounts7d,
      reviewCountsToday,
      reviewStates,
      sets,
    }),
  };
}

async function getAccessibleCardRow(input: {
  cardId: string;
  userId: string;
  workspaceId?: string;
}) {
  const [row] = await db
    .select({
      card: flashcardCard,
      set: flashcardSet,
    })
    .from(flashcardCard)
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .innerJoin(workspace, eq(workspace.id, flashcardSet.workspaceId))
    .innerJoin(
      member,
      and(
        eq(member.organizationId, workspace.organizationId),
        eq(member.userId, input.userId)
      )
    )
    .where(
      and(
        eq(flashcardCard.id, input.cardId),
        isNull(flashcardCard.archivedAt),
        isNull(flashcardSet.archivedAt),
        input.workspaceId
          ? eq(flashcardSet.workspaceId, input.workspaceId)
          : undefined
      )
    )
    .limit(1);

  return row ?? null;
}

function ensurePersistedSchedulerState(
  state: typeof flashcardReviewState.$inferSelect | null | undefined
): PersistedFlashcardSchedulerState | null {
  if (!state) {
    return null;
  }

  return {
    difficulty: state.difficulty ?? null,
    dueAt: state.dueAt.toISOString(),
    elapsedDays: state.elapsedDays,
    lapses: state.lapses,
    lastReviewedAt: state.lastReviewedAt
      ? state.lastReviewedAt.toISOString()
      : null,
    reps: state.reps,
    scheduledDays: state.scheduledDays,
    stability: state.stability ?? null,
    state: state.state as FlashcardReviewStateName,
  };
}

async function countReviewedTodayForWorkspace(
  userId: string,
  workspaceId: string
) {
  const rows = await db
    .select({ id: flashcardReviewLog.id })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewLog.userId, userId),
        eq(flashcardSet.workspaceId, workspaceId),
        gte(flashcardReviewLog.reviewedAt, startOfDay())
      )
    );

  return rows.length;
}

export async function listFlashcardSetSummariesForUser(
  userId: string,
  workspaceId: string
): Promise<FlashcardSetSummary[]> {
  if (!(await workspaceAccessibleByUser(userId, workspaceId))) {
    return [];
  }

  const { summaries } = await hydrateSetSummaries(userId, workspaceId);
  return summaries;
}

export async function getFlashcardSetForUser(
  userId: string,
  workspaceId: string,
  setId: string
): Promise<FlashcardSetRecord | null> {
  const hydrated = await hydrateSetSummaries(userId, workspaceId, setId);
  const summary = hydrated.summaries[0];
  const row = hydrated.rows[0];

  if (!(summary && row)) {
    return null;
  }

  const [allCards, recentReviews, reviewEventsToday] = await Promise.all([
    listCardsForSetIds([setId], { includeArchived: true }),
    listRecentReviewLogsForSet(userId, setId, 12),
    listReviewEventsForSetIdsSince(userId, [setId], startOfDay()),
  ]);

  return {
    ...summary,
    cards: hydrated.cards.filter((card) => card.setId === setId).map(mapCard),
    cardSnapshots: allCards.map((card) =>
      mapCardSnapshot(card, hydrated.reviewStates.get(card.id) ?? null)
    ),
    enrollment: row.enrollment ? mapEnrollment(row.enrollment) : null,
    recentReviews: recentReviews.map((entry) => mapReviewLog(entry.log)),
    reviewEventsToday: reviewEventsToday.map(mapReviewEvent),
    stateCounts: buildStateCounts(allCards, hydrated.reviewStates),
  };
}

export async function getFlashcardDashboardForUser(
  userId: string,
  workspaceId: string
): Promise<FlashcardDashboardRecord | null> {
  if (!(await workspaceAccessibleByUser(userId, workspaceId))) {
    return null;
  }

  const hydrated = await hydrateSetSummaries(userId, workspaceId);
  const setIds = hydrated.summaries.map((summary) => summary.id);
  const [allCards, reviewEventsToday] = await Promise.all([
    listCardsForSetIds(setIds, { includeArchived: true }),
    listReviewEventsForSetIdsSince(userId, setIds, startOfDay()),
  ]);

  return {
    cardSnapshots: allCards.map((card) =>
      mapCardSnapshot(card, hydrated.reviewStates.get(card.id) ?? null)
    ),
    dueCount: hydrated.summaries.reduce(
      (total, set) => total + set.dueCount,
      0
    ),
    newCount: hydrated.summaries.reduce(
      (total, set) => total + set.newCount,
      0
    ),
    reviewCount7d: hydrated.summaries.reduce(
      (total, set) => total + set.reviewCount7d,
      0
    ),
    reviewCountToday: hydrated.summaries.reduce(
      (total, set) => total + set.reviewCountToday,
      0
    ),
    reviewEventsToday: reviewEventsToday.map(mapReviewEvent),
    sets: hydrated.summaries,
    stateCounts: buildStateCounts(allCards, hydrated.reviewStates),
  };
}

export async function createFlashcardSetForUser(input: {
  description?: string | null;
  sourceChatSlug?: string | null;
  sourceType?: FlashcardSourceType;
  tags?: string[];
  title?: string;
  userId: string;
  workspaceId: string;
}) {
  if (!(await workspaceAccessibleByUser(input.userId, input.workspaceId))) {
    return null;
  }

  const now = new Date();
  const [created] = await db
    .insert(flashcardSet)
    .values({
      createdAt: now,
      createdBy: input.userId,
      description: sanitizeDescription(input.description),
      sourceChatSlug: input.sourceChatSlug ?? null,
      sourceType: input.sourceType ?? "manual",
      tags: sanitizeTags(input.tags),
      title: sanitizeTitle(input.title),
      updatedAt: now,
      updatedBy: input.userId,
      workspaceId: input.workspaceId,
    })
    .returning();

  await upsertFlashcardSetEnrollmentForUser({
    newCardsPerDay: 20,
    setId: created.id,
    status: "active",
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  return getFlashcardSetForUser(input.userId, input.workspaceId, created.id);
}

export async function updateFlashcardSetForUser(input: {
  description?: string | null;
  setId: string;
  tags?: string[];
  title?: string;
  userId: string;
  workspaceId: string;
}) {
  const existing = await getFlashcardSetForUser(
    input.userId,
    input.workspaceId,
    input.setId
  );
  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(flashcardSet)
    .set({
      ...(typeof input.description !== "undefined"
        ? { description: sanitizeDescription(input.description) }
        : {}),
      ...(Array.isArray(input.tags) ? { tags: sanitizeTags(input.tags) } : {}),
      ...(typeof input.title === "string"
        ? { title: sanitizeTitle(input.title) }
        : {}),
      updatedAt: new Date(),
      updatedBy: input.userId,
    })
    .where(
      and(
        eq(flashcardSet.id, input.setId),
        eq(flashcardSet.workspaceId, input.workspaceId),
        isNull(flashcardSet.archivedAt)
      )
    )
    .returning({ id: flashcardSet.id });

  if (!updated) {
    return null;
  }

  return getFlashcardSetForUser(input.userId, input.workspaceId, input.setId);
}

export async function archiveFlashcardSetForUser(
  userId: string,
  workspaceId: string,
  setId: string
) {
  const existing = await getFlashcardSetForUser(userId, workspaceId, setId);
  if (!existing) {
    return null;
  }

  const [archived] = await db
    .update(flashcardSet)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(
      and(
        eq(flashcardSet.id, setId),
        eq(flashcardSet.workspaceId, workspaceId),
        isNull(flashcardSet.archivedAt)
      )
    )
    .returning({ id: flashcardSet.id });

  return archived ?? null;
}

export async function createFlashcardCardForUser(input: {
  backMarkdown: string;
  frontMarkdown: string;
  kind?: FlashcardCardKind;
  notesMarkdown?: string | null;
  payload?: Record<string, unknown>;
  setId: string;
  source?: Record<string, unknown>;
  tags?: string[];
  userId: string;
  workspaceId: string;
}) {
  const set = await getFlashcardSetForUser(
    input.userId,
    input.workspaceId,
    input.setId
  );
  if (!set) {
    return null;
  }

  const [lastCard] = await db
    .select({ ordinal: flashcardCard.ordinal })
    .from(flashcardCard)
    .where(
      and(
        eq(flashcardCard.setId, input.setId),
        isNull(flashcardCard.archivedAt)
      )
    )
    .orderBy(desc(flashcardCard.ordinal))
    .limit(1);

  const now = new Date();
  const kind = sanitizeCardKind(input.kind);
  const [created] = await db
    .insert(flashcardCard)
    .values({
      backMarkdown: input.backMarkdown.trim(),
      createdAt: now,
      createdBy: input.userId,
      frontMarkdown: input.frontMarkdown.trim(),
      kind,
      notesMarkdown: sanitizeDescription(input.notesMarkdown),
      ordinal: (lastCard?.ordinal ?? 0) + 1,
      payload: sanitizeCardPayload(kind, input.payload),
      setId: input.setId,
      source: input.source ?? {},
      tags: sanitizeTags(input.tags),
      updatedAt: now,
      updatedBy: input.userId,
    })
    .returning();

  await db
    .update(flashcardSet)
    .set({ updatedAt: now, updatedBy: input.userId })
    .where(eq(flashcardSet.id, input.setId));

  return mapCard(created);
}

export async function updateFlashcardCardForUser(input: {
  backMarkdown?: string;
  cardId: string;
  frontMarkdown?: string;
  kind?: FlashcardCardKind;
  notesMarkdown?: string | null;
  payload?: Record<string, unknown>;
  tags?: string[];
  userId: string;
  workspaceId: string;
}) {
  const existing = await getAccessibleCardRow({
    cardId: input.cardId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!existing) {
    return null;
  }

  const kind = sanitizeCardKind(input.kind ?? existing.card.kind);
  const [updated] = await db
    .update(flashcardCard)
    .set({
      ...(typeof input.backMarkdown === "string"
        ? { backMarkdown: input.backMarkdown.trim() }
        : {}),
      ...(typeof input.frontMarkdown === "string"
        ? { frontMarkdown: input.frontMarkdown.trim() }
        : {}),
      ...(typeof input.kind === "string" ? { kind } : {}),
      ...(typeof input.notesMarkdown !== "undefined"
        ? { notesMarkdown: sanitizeDescription(input.notesMarkdown) }
        : {}),
      ...(typeof input.payload !== "undefined"
        ? { payload: sanitizeCardPayload(kind, input.payload) }
        : {}),
      ...(Array.isArray(input.tags) ? { tags: sanitizeTags(input.tags) } : {}),
      updatedAt: new Date(),
      updatedBy: input.userId,
    })
    .where(eq(flashcardCard.id, input.cardId))
    .returning();

  if (!updated) {
    return null;
  }

  await db
    .update(flashcardSet)
    .set({ updatedAt: new Date(), updatedBy: input.userId })
    .where(eq(flashcardSet.id, existing.set.id));

  return mapCard(updated);
}

export async function archiveFlashcardCardForUser(
  userId: string,
  workspaceId: string,
  cardId: string
) {
  const existing = await getAccessibleCardRow({ cardId, userId, workspaceId });
  if (!existing) {
    return null;
  }

  const [archived] = await db
    .update(flashcardCard)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(flashcardCard.id, cardId))
    .returning();

  if (!archived) {
    return null;
  }

  await db
    .update(flashcardSet)
    .set({ updatedAt: new Date(), updatedBy: userId })
    .where(eq(flashcardSet.id, existing.set.id));

  return mapCard(archived);
}

export async function upsertFlashcardSetEnrollmentForUser(input: {
  newCardsPerDay?: number;
  setId: string;
  status?: FlashcardEnrollmentStatus;
  userId: string;
  workspaceId: string;
}) {
  const existing = await getFlashcardSetForUser(
    input.userId,
    input.workspaceId,
    input.setId
  );
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [enrollment] = await db
    .insert(flashcardSetEnrollment)
    .values({
      createdAt: now,
      newCardsPerDay: Math.max(1, Math.min(input.newCardsPerDay ?? 20, 100)),
      setId: input.setId,
      status: input.status ?? "active",
      updatedAt: now,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: [flashcardSetEnrollment.setId, flashcardSetEnrollment.userId],
      set: {
        newCardsPerDay: Math.max(1, Math.min(input.newCardsPerDay ?? 20, 100)),
        status: input.status ?? "active",
        updatedAt: now,
      },
    })
    .returning();

  return mapEnrollment(enrollment);
}

export async function listDueFlashcardsForUser(input: {
  limit?: number;
  setId?: string;
  userId: string;
  workspaceId: string;
}) {
  const hydrated = await hydrateSetSummaries(
    input.userId,
    input.workspaceId,
    input.setId
  );
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const setsById = new Map<string, FlashcardSetSummary>();
  for (const summary of hydrated.summaries) {
    setsById.set(summary.id, summary);
  }

  const enrollmentBySetId = new Map<
    string,
    FlashcardSetEnrollmentRecord | null
  >();
  for (const row of hydrated.rows) {
    enrollmentBySetId.set(
      row.set.id,
      row.enrollment ? mapEnrollment(row.enrollment) : null
    );
  }

  const now = new Date();
  const queue: Array<{
    card: typeof flashcardCard.$inferSelect;
    dueAt: string | null;
    reviewState: FlashcardReviewStateRecord | null;
    set: FlashcardSetSummary;
  }> = [];

  for (const card of hydrated.cards) {
    const set = setsById.get(card.setId);
    const enrollment = enrollmentBySetId.get(card.setId);
    if (!(set && enrollment?.status === "active")) {
      continue;
    }

    const state = hydrated.reviewStates.get(card.id) ?? null;
    if (state) {
      if (state.suspended || new Date(state.dueAt) > now) {
        continue;
      }

      queue.push({
        card,
        dueAt: state.dueAt,
        reviewState: state,
        set,
      });
      continue;
    }

    queue.push({
      card,
      dueAt: null,
      reviewState: null,
      set,
    });
  }

  queue.sort((a, b) =>
    compareDueQueueItems(
      {
        dueAt: a.dueAt,
        id: a.card.id,
        ordinal: a.card.ordinal,
        setTitle: a.set.title,
      },
      {
        dueAt: b.dueAt,
        id: b.card.id,
        ordinal: b.card.ordinal,
        setTitle: b.set.title,
      }
    )
  );

  const seenNewBySet = new Map<string, number>();
  const filteredQueue = queue.filter((item) => {
    if (item.reviewState) {
      return true;
    }

    const enrollment = enrollmentBySetId.get(item.card.setId);
    const nextCount = (seenNewBySet.get(item.card.setId) ?? 0) + 1;
    if (nextCount > (enrollment?.newCardsPerDay ?? 20)) {
      return false;
    }

    seenNewBySet.set(item.card.setId, nextCount);
    return true;
  });

  return filteredQueue.slice(0, limit).map((item, index) => ({
    card: mapCard(item.card),
    position: index + 1,
    remainingDueCount: filteredQueue.length - index - 1,
    reviewState: item.reviewState,
    set: {
      id: item.set.id,
      sourceType: item.set.sourceType,
      title: item.set.title,
    },
  })) satisfies FlashcardReviewQueueItem[];
}

export async function reviewFlashcardForUser(input: {
  cardId: string;
  rating: FlashcardRating;
  userId: string;
  workspaceId: string;
}) {
  const access = await getAccessibleCardRow({
    cardId: input.cardId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!access) {
    return null;
  }

  const reviewedAt = new Date();

  const updatedState = await db.transaction(async (tx) => {
    const [currentState] = await tx
      .select()
      .from(flashcardReviewState)
      .where(
        and(
          eq(flashcardReviewState.flashcardId, input.cardId),
          eq(flashcardReviewState.userId, input.userId)
        )
      )
      .limit(1);

    await tx
      .insert(flashcardSetEnrollment)
      .values({
        createdAt: reviewedAt,
        lastStudiedAt: reviewedAt,
        newCardsPerDay: 20,
        setId: access.set.id,
        status: "active",
        updatedAt: reviewedAt,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: [flashcardSetEnrollment.setId, flashcardSetEnrollment.userId],
        set: {
          lastStudiedAt: reviewedAt,
          status: "active",
          updatedAt: reviewedAt,
        },
      });

    const scheduled = applyFlashcardReview({
      now: reviewedAt,
      rating: input.rating,
      state: ensurePersistedSchedulerState(currentState),
    });

    const [nextState] = await tx
      .insert(flashcardReviewState)
      .values({
        createdAt: reviewedAt,
        difficulty: scheduled.nextState.difficulty,
        dueAt: new Date(scheduled.nextState.dueAt),
        elapsedDays: scheduled.nextState.elapsedDays,
        flashcardId: input.cardId,
        lapses: scheduled.nextState.lapses,
        lastRating: input.rating,
        lastReviewedAt: reviewedAt,
        reps: scheduled.nextState.reps,
        scheduledDays: scheduled.nextState.scheduledDays,
        schedulerVersion: 1,
        stability: scheduled.nextState.stability,
        state: scheduled.nextState.state,
        suspended: false,
        updatedAt: reviewedAt,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: [flashcardReviewState.flashcardId, flashcardReviewState.userId],
        set: {
          difficulty: scheduled.nextState.difficulty,
          dueAt: new Date(scheduled.nextState.dueAt),
          elapsedDays: scheduled.nextState.elapsedDays,
          lapses: scheduled.nextState.lapses,
          lastRating: input.rating,
          lastReviewedAt: reviewedAt,
          reps: scheduled.nextState.reps,
          scheduledDays: scheduled.nextState.scheduledDays,
          schedulerVersion: 1,
          stability: scheduled.nextState.stability,
          state: scheduled.nextState.state,
          suspended: false,
          updatedAt: reviewedAt,
        },
      })
      .returning();

    await tx.insert(flashcardReviewLog).values({
      elapsedDays: scheduled.reviewLog.elapsedDays,
      flashcardId: input.cardId,
      metadata: {
        dueAt: scheduled.reviewLog.dueAt,
        lastElapsedDays: scheduled.reviewLog.lastElapsedDays,
        learningSteps: scheduled.reviewLog.learningSteps,
      },
      nextDifficulty: scheduled.nextState.difficulty,
      nextStability: scheduled.nextState.stability,
      nextState: scheduled.nextState.state,
      previousDifficulty: currentState?.difficulty ?? null,
      previousStability: currentState?.stability ?? null,
      previousState: currentState?.state ?? null,
      rating: input.rating,
      reviewedAt,
      scheduledDays: scheduled.nextState.scheduledDays,
      userId: input.userId,
    });

    return mapReviewState(nextState);
  });

  const [nextCard] = await listDueFlashcardsForUser({
    limit: 1,
    setId: access.set.id,
    userId: input.userId,
    workspaceId: access.set.workspaceId,
  });

  return {
    nextCard: nextCard ?? null,
    remainingDueCount: nextCard?.remainingDueCount ?? 0,
    reviewedTodayCount: await countReviewedTodayForWorkspace(
      input.userId,
      input.workspaceId
    ),
    updatedState,
  };
}
