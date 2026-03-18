import {
  and,
  asc,
  desc,
  eq,
  gte,
  sql,
} from "drizzle-orm";
import { db } from "./client";
import {
  conceptMastery,
  flashcardCard,
  flashcardReviewLog,
  flashcardReviewState,
  flashcardSet,
  misconception,
} from "./schema";
import type { FlashcardRating } from "./flashcard-fsrs";

export type MisconceptionSource = "manual" | "review" | "tool";

export interface MisconceptionRecord {
  active: boolean;
  confidence: number;
  concept: string;
  createdAt: string;
  evidenceCount: number;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  reason: string;
  resolvedAt: string | null;
  source: string;
  subject: string;
  topic: string;
  updatedAt: string;
  userId: string;
  workspaceId: string;
}

export interface ConceptMasteryRecord {
  activeMisconceptionCount: number;
  concept: string;
  createdAt: string;
  id: string;
  lastMisconceptionAt: string | null;
  lastReviewedAt: string | null;
  negativeReviewCount: number;
  positiveReviewCount: number;
  reviewCount: number;
  score: number;
  subject: string;
  topic: string;
  updatedAt: string;
  userId: string;
  workspaceId: string;
}

export interface UpsertMisconceptionInput {
  confidence?: number;
  concept: string;
  reason: string;
  source?: MisconceptionSource | string;
  subject: string;
  topic: string;
  userId: string;
  workspaceId: string;
  observedAt?: Date;
}

export interface GetActiveMisconceptionsInput {
  concept?: string;
  limit?: number;
  subject?: string;
  topic?: string;
  userId: string;
  workspaceId?: string | null;
}

export interface ResolveMisconceptionsForConceptInput {
  concept: string;
  resolvedAt?: Date;
  subject?: string;
  topic?: string;
  userId: string;
  workspaceId?: string | null;
}

export interface CountRecentConsecutiveRatingsInput {
  concept: string;
  limit?: number;
  rating: FlashcardRating;
  since?: Date;
  subject?: string;
  topic?: string;
  userId: string;
  workspaceId?: string | null;
}

export interface ListRecentCardRatingsInput {
  cardId: string;
  limit?: number;
  userId: string;
}

export interface ListRecentConceptRatingsInput {
  concept: string;
  limit?: number;
  subject?: string;
  topic?: string;
  userId: string;
  workspaceId?: string | null;
}

export interface UpdateMasteryInput {
  activeMisconceptionCount?: number;
  concept: string;
  lastMisconceptionAt?: Date | null;
  lastReviewedAt?: Date | null;
  negativeReviewCount?: number;
  positiveReviewCount?: number;
  reviewCount?: number;
  score?: number;
  subject: string;
  topic: string;
  userId: string;
  workspaceId: string;
}

export interface GetMasteryBySubjectInput {
  limit?: number;
  subject: string;
  userId: string;
  workspaceId?: string | null;
}

export interface GetWeakestConceptsInput {
  limit?: number;
  subject?: string;
  userId: string;
  workspaceId?: string | null;
}

export interface RecomputeConceptMasteryInput {
  concept: string;
  reviewedAt?: Date;
  subject: string;
  topic: string;
  userId: string;
  workspaceId: string;
}

const DEFAULT_ACTIVE_MISCONCEPTION_LIMIT = 50;
const DEFAULT_MASTERY_LIMIT = 200;
const DEFAULT_RECENT_RATING_LIMIT = 100;

const normalizeText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const normalizeRequiredText = (
  value: unknown,
  fieldName: string,
  maxLength = fieldName === "concept" ? 180 : 120
) => {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) {
    throw new Error(`Missing required field: ${fieldName}.`);
  }

  return normalized;
};

const normalizeScore = (value: number | undefined | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(1, Math.max(0, value));
};

const normalizeCount = (value: number | undefined | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
};

const mapMisconceptionRow = (
  row: typeof misconception.$inferSelect
): MisconceptionRecord => ({
  active: row.active,
  confidence: row.confidence,
  concept: row.concept,
  createdAt: row.createdAt.toISOString(),
  evidenceCount: row.evidenceCount,
  firstSeenAt: row.firstSeenAt.toISOString(),
  id: row.id,
  lastSeenAt: row.lastSeenAt.toISOString(),
  reason: row.reason,
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  source: row.source,
  subject: row.subject,
  topic: row.topic,
  updatedAt: row.updatedAt.toISOString(),
  userId: row.userId,
  workspaceId: row.workspaceId,
});

const mapMasteryRow = (
  row: typeof conceptMastery.$inferSelect
): ConceptMasteryRecord => ({
  activeMisconceptionCount: row.activeMisconceptionCount,
  concept: row.concept,
  createdAt: row.createdAt.toISOString(),
  id: row.id,
  lastMisconceptionAt: row.lastMisconceptionAt?.toISOString() ?? null,
  lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
  negativeReviewCount: row.negativeReviewCount,
  positiveReviewCount: row.positiveReviewCount,
  reviewCount: row.reviewCount,
  score: row.score,
  subject: row.subject,
  topic: row.topic,
  updatedAt: row.updatedAt.toISOString(),
  userId: row.userId,
  workspaceId: row.workspaceId,
});

const taxonomyFieldExpression = (
  field: "subject" | "topic" | "concept"
) => {
  switch (field) {
    case "subject":
      return sql<string>`coalesce(${flashcardCard.source} ->> 'subject', ${flashcardCard.source} -> 'taxonomy' ->> 'subject')`;
    case "topic":
      return sql<string>`coalesce(${flashcardCard.source} ->> 'topic', ${flashcardCard.source} -> 'taxonomy' ->> 'topic')`;
    case "concept":
      return sql<string>`coalesce(${flashcardCard.source} ->> 'concept', ${flashcardCard.source} -> 'taxonomy' ->> 'concept')`;
  }
};

const buildTaxonomyPredicates = (input: {
  concept: string;
  subject?: string;
  topic?: string;
}) => {
  const predicates = [eq(taxonomyFieldExpression("concept"), input.concept)];

  if (input.subject) {
    predicates.push(eq(taxonomyFieldExpression("subject"), input.subject));
  }

  if (input.topic) {
    predicates.push(eq(taxonomyFieldExpression("topic"), input.topic));
  }

  return predicates;
};

export async function upsertMisconception(
  input: UpsertMisconceptionInput
): Promise<MisconceptionRecord> {
  const now = input.observedAt ?? new Date();
  const subject = normalizeRequiredText(input.subject, "subject");
  const topic = normalizeRequiredText(input.topic, "topic");
  const concept = normalizeRequiredText(input.concept, "concept");
  const reason = normalizeRequiredText(input.reason, "reason", 600);
  const confidence = normalizeScore(input.confidence);

  const values = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    subject,
    topic,
    concept,
    reason,
    source: input.source ?? "review",
    confidence: confidence ?? 0,
    active: true,
    lastSeenAt: now,
    resolvedAt: null,
    updatedAt: now,
  };

  const [row] = await db
    .insert(misconception)
    .values(values)
    .onConflictDoUpdate({
      target: [
        misconception.workspaceId,
        misconception.userId,
        misconception.subject,
        misconception.topic,
        misconception.concept,
      ],
      set: {
        active: true,
        confidence:
          confidence === null
            ? misconception.confidence
            : sql`greatest(${misconception.confidence}, ${confidence})`,
        evidenceCount: sql`${misconception.evidenceCount} + 1`,
        lastSeenAt: now,
        reason,
        resolvedAt: null,
        source: input.source ?? "review",
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert misconception.");
  }

  return mapMisconceptionRow(row);
}

export async function getActiveMisconceptions(
  input: GetActiveMisconceptionsInput
): Promise<MisconceptionRecord[]> {
  const subject = normalizeText(input.subject, 120);
  const topic = normalizeText(input.topic, 120);
  const concept = normalizeText(input.concept, 180);

  const rows = await db
    .select()
    .from(misconception)
    .where(
      and(
        eq(misconception.userId, input.userId),
        input.workspaceId
          ? eq(misconception.workspaceId, input.workspaceId)
          : undefined,
        eq(misconception.active, true),
        subject ? eq(misconception.subject, subject) : undefined,
        topic ? eq(misconception.topic, topic) : undefined,
        concept ? eq(misconception.concept, concept) : undefined
      )
    )
    .orderBy(desc(misconception.lastSeenAt), desc(misconception.createdAt))
    .limit(Math.max(1, input.limit ?? DEFAULT_ACTIVE_MISCONCEPTION_LIMIT));

  return rows.map(mapMisconceptionRow);
}

export async function resolveMisconceptionsForConcept(
  input: ResolveMisconceptionsForConceptInput
): Promise<MisconceptionRecord[]> {
  const resolvedAt = input.resolvedAt ?? new Date();
  const subject = normalizeText(input.subject, 120);
  const topic = normalizeText(input.topic, 120);
  const concept = normalizeRequiredText(input.concept, "concept");

  const rows = await db
    .update(misconception)
    .set({
      active: false,
      resolvedAt,
      updatedAt: resolvedAt,
    })
    .where(
      and(
        eq(misconception.userId, input.userId),
        input.workspaceId
          ? eq(misconception.workspaceId, input.workspaceId)
          : undefined,
        eq(misconception.active, true),
        subject ? eq(misconception.subject, subject) : undefined,
        topic ? eq(misconception.topic, topic) : undefined,
        eq(misconception.concept, concept)
      )
    )
    .returning();

  return rows.map(mapMisconceptionRow);
}

export async function countRecentConsecutiveRatings(
  input: CountRecentConsecutiveRatingsInput
): Promise<number> {
  const subject = normalizeText(input.subject, 120);
  const topic = normalizeText(input.topic, 120);
  const concept = normalizeRequiredText(input.concept, "concept");
  const rows = await db
    .select({
      rating: flashcardReviewLog.rating,
      reviewedAt: flashcardReviewLog.reviewedAt,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewLog.userId, input.userId),
        input.workspaceId
          ? eq(flashcardSet.workspaceId, input.workspaceId)
          : undefined,
        gte(flashcardReviewLog.reviewedAt, input.since ?? new Date(0)),
        ...buildTaxonomyPredicates({
          concept,
          subject: subject ?? undefined,
          topic: topic ?? undefined,
        })
      )
    )
    .orderBy(desc(flashcardReviewLog.reviewedAt), desc(flashcardReviewLog.id))
    .limit(Math.max(1, input.limit ?? DEFAULT_RECENT_RATING_LIMIT));

  let count = 0;
  for (const row of rows) {
    if (row.rating !== input.rating) {
      break;
    }
    count += 1;
  }

  return count;
}

export async function listRecentCardRatings(
  input: ListRecentCardRatingsInput
): Promise<FlashcardRating[]> {
  const rows = await db
    .select({
      rating: flashcardReviewLog.rating,
    })
    .from(flashcardReviewLog)
    .where(
      and(
        eq(flashcardReviewLog.userId, input.userId),
        eq(flashcardReviewLog.flashcardId, input.cardId)
      )
    )
    .orderBy(desc(flashcardReviewLog.reviewedAt), desc(flashcardReviewLog.id))
    .limit(Math.max(1, input.limit ?? DEFAULT_RECENT_RATING_LIMIT));

  return rows.map((row) => row.rating as FlashcardRating);
}

export async function listRecentConceptRatings(
  input: ListRecentConceptRatingsInput
): Promise<FlashcardRating[]> {
  const subject = normalizeText(input.subject, 120);
  const topic = normalizeText(input.topic, 120);
  const concept = normalizeRequiredText(input.concept, "concept");

  const rows = await db
    .select({
      rating: flashcardReviewLog.rating,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewLog.userId, input.userId),
        input.workspaceId
          ? eq(flashcardSet.workspaceId, input.workspaceId)
          : undefined,
        ...buildTaxonomyPredicates({
          concept,
          subject: subject ?? undefined,
          topic: topic ?? undefined,
        })
      )
    )
    .orderBy(desc(flashcardReviewLog.reviewedAt), desc(flashcardReviewLog.id))
    .limit(Math.max(1, input.limit ?? DEFAULT_RECENT_RATING_LIMIT));

  return rows.map((row) => row.rating as FlashcardRating);
}

function normalizeMasteryScore(params: {
  activeMisconceptionCount: number;
  averageStability: number;
  negativeReviewCount: number;
  positiveReviewCount: number;
  reviewCount: number;
}) {
  if (params.reviewCount <= 0) {
    return 0;
  }

  const stabilityComponent = Math.max(
    0,
    Math.min(1, params.averageStability > 0 ? params.averageStability / 20 : 0)
  );
  const performanceComponent =
    params.reviewCount > 0
      ? params.positiveReviewCount / params.reviewCount
      : 0;
  const negativePenalty =
    params.reviewCount > 0
      ? Math.min(0.3, params.negativeReviewCount / params.reviewCount / 2)
      : 0;
  const misconceptionPenalty = Math.min(
    0.35,
    params.activeMisconceptionCount * 0.08
  );

  return Number(
    Math.max(
      0,
      Math.min(
        1,
        stabilityComponent * 0.6 +
          performanceComponent * 0.4 -
          negativePenalty -
          misconceptionPenalty
      )
    ).toFixed(4)
  );
}

export async function recomputeConceptMastery(
  input: RecomputeConceptMasteryInput
): Promise<ConceptMasteryRecord> {
  const concept = normalizeRequiredText(input.concept, "concept");
  const subject = normalizeRequiredText(input.subject, "subject");
  const topic = normalizeRequiredText(input.topic, "topic");

  const reviewStats = await db
    .select({
      lastReviewedAt: sql<Date | null>`max(${flashcardReviewLog.reviewedAt})`,
      negativeReviewCount:
        sql<number>`count(*) filter (where ${flashcardReviewLog.rating} = 'again')`,
      positiveReviewCount:
        sql<number>`count(*) filter (where ${flashcardReviewLog.rating} in ('good', 'easy'))`,
      reviewCount: sql<number>`count(*)`,
    })
    .from(flashcardReviewLog)
    .innerJoin(
      flashcardCard,
      eq(flashcardCard.id, flashcardReviewLog.flashcardId)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewLog.userId, input.userId),
        eq(flashcardSet.workspaceId, input.workspaceId),
        ...buildTaxonomyPredicates({ concept, subject, topic })
      )
    );

  const stabilityRows = await db
    .select({
      averageStability: sql<number | null>`avg(${flashcardReviewState.stability})`,
    })
    .from(flashcardReviewState)
    .innerJoin(
      flashcardCard,
      eq(flashcardReviewState.flashcardId, flashcardCard.id)
    )
    .innerJoin(flashcardSet, eq(flashcardSet.id, flashcardCard.setId))
    .where(
      and(
        eq(flashcardReviewState.userId, input.userId),
        eq(flashcardSet.workspaceId, input.workspaceId),
        eq(flashcardReviewState.suspended, false),
        ...buildTaxonomyPredicates({ concept, subject, topic })
      )
    );

  const activeMisconceptions = await getActiveMisconceptions({
    concept,
    subject,
    topic,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const [reviewRow] = reviewStats;
  const averageStability = Number(
    stabilityRows[0]?.averageStability ?? 0
  );
  const reviewCount = Number(reviewRow?.reviewCount ?? 0);
  const positiveReviewCount = Number(reviewRow?.positiveReviewCount ?? 0);
  const negativeReviewCount = Number(reviewRow?.negativeReviewCount ?? 0);
  const activeMisconceptionCount = activeMisconceptions.length;
  const lastMisconceptionAt =
    activeMisconceptions[0]?.updatedAt != null
      ? new Date(activeMisconceptions[0].updatedAt)
      : null;
  const lastReviewedAt =
    input.reviewedAt ??
    (reviewRow?.lastReviewedAt ? new Date(reviewRow.lastReviewedAt) : null) ??
    null;

  return updateMastery({
    activeMisconceptionCount,
    concept,
    lastMisconceptionAt,
    lastReviewedAt,
    negativeReviewCount,
    positiveReviewCount,
    reviewCount,
    score: normalizeMasteryScore({
      activeMisconceptionCount,
      averageStability,
      negativeReviewCount,
      positiveReviewCount,
      reviewCount,
    }),
    subject,
    topic,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
}

export async function updateMastery(
  input: UpdateMasteryInput
): Promise<ConceptMasteryRecord> {
  const now = new Date();
  const subject = normalizeRequiredText(input.subject, "subject");
  const topic = normalizeRequiredText(input.topic, "topic");
  const concept = normalizeRequiredText(input.concept, "concept");
  const score = normalizeScore(input.score);
  const reviewCount = normalizeCount(input.reviewCount);
  const positiveReviewCount = normalizeCount(input.positiveReviewCount);
  const negativeReviewCount = normalizeCount(input.negativeReviewCount);
  const activeMisconceptionCount = normalizeCount(
    input.activeMisconceptionCount
  );

  const values = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    subject,
    topic,
    concept,
    score: score ?? 0,
    reviewCount: reviewCount ?? 0,
    positiveReviewCount: positiveReviewCount ?? 0,
    negativeReviewCount: negativeReviewCount ?? 0,
    activeMisconceptionCount: activeMisconceptionCount ?? 0,
    lastReviewedAt: input.lastReviewedAt ?? null,
    lastMisconceptionAt: input.lastMisconceptionAt ?? null,
    updatedAt: now,
  };

  const [row] = await db
    .insert(conceptMastery)
    .values(values)
    .onConflictDoUpdate({
      target: [
        conceptMastery.workspaceId,
        conceptMastery.userId,
        conceptMastery.subject,
        conceptMastery.topic,
        conceptMastery.concept,
      ],
      set: {
        ...(score === null ? {} : { score }),
        ...(reviewCount === null ? {} : { reviewCount }),
        ...(positiveReviewCount === null
          ? {}
          : { positiveReviewCount }),
        ...(negativeReviewCount === null
          ? {}
          : { negativeReviewCount }),
        ...(activeMisconceptionCount === null
          ? {}
          : { activeMisconceptionCount }),
        ...(input.lastReviewedAt === undefined
          ? {}
          : { lastReviewedAt: input.lastReviewedAt }),
        ...(input.lastMisconceptionAt === undefined
          ? {}
          : { lastMisconceptionAt: input.lastMisconceptionAt }),
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to update concept mastery.");
  }

  return mapMasteryRow(row);
}

export async function getMasteryBySubject(
  input: GetMasteryBySubjectInput
): Promise<ConceptMasteryRecord[]> {
  const rows = await db
    .select()
    .from(conceptMastery)
    .where(
      and(
        eq(conceptMastery.userId, input.userId),
        eq(
          conceptMastery.subject,
          normalizeRequiredText(input.subject, "subject")
        ),
        input.workspaceId
          ? eq(conceptMastery.workspaceId, input.workspaceId)
          : undefined
      )
    )
    .orderBy(
      desc(conceptMastery.score),
      desc(conceptMastery.lastReviewedAt),
      asc(conceptMastery.topic),
      asc(conceptMastery.concept)
    )
    .limit(Math.max(1, input.limit ?? DEFAULT_MASTERY_LIMIT));

  return rows.map(mapMasteryRow);
}

export async function getWeakestConcepts(
  input: GetWeakestConceptsInput
): Promise<ConceptMasteryRecord[]> {
  const subject = input.subject
    ? normalizeRequiredText(input.subject, "subject")
    : null;

  const rows = await db
    .select()
    .from(conceptMastery)
    .where(
      and(
        eq(conceptMastery.userId, input.userId),
        subject ? eq(conceptMastery.subject, subject) : undefined,
        input.workspaceId
          ? eq(conceptMastery.workspaceId, input.workspaceId)
          : undefined
      )
    )
    .orderBy(
      asc(conceptMastery.score),
      desc(conceptMastery.activeMisconceptionCount),
      desc(conceptMastery.lastReviewedAt),
      asc(conceptMastery.topic),
      asc(conceptMastery.concept)
    )
    .limit(Math.max(1, input.limit ?? DEFAULT_MASTERY_LIMIT));

  return rows.map(mapMasteryRow);
}
