import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "./client";
import { sudoChallenge } from "./schema";

const MAX_ATTEMPTS = 5;

export async function getLatestActiveSudoChallenge(userId: string) {
  const [challenge] = await db
    .select()
    .from(sudoChallenge)
    .where(
      and(
        eq(sudoChallenge.userId, userId),
        isNull(sudoChallenge.usedAt),
        gt(sudoChallenge.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sudoChallenge.createdAt))
    .limit(1);

  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    return null;
  }

  return challenge;
}

export async function createSudoChallenge(input: {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}) {
  const [challenge] = await db
    .insert(sudoChallenge)
    .values({
      userId: input.userId,
      codeHash: input.codeHash,
      attempts: 0,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    })
    .returning();

  return challenge;
}

export async function consumeSudoChallenge(input: {
  challengeId: string;
  success: boolean;
}) {
  if (input.success) {
    await db
      .update(sudoChallenge)
      .set({ usedAt: new Date() })
      .where(eq(sudoChallenge.id, input.challengeId));
    return;
  }

  const [current] = await db
    .select({ attempts: sudoChallenge.attempts })
    .from(sudoChallenge)
    .where(eq(sudoChallenge.id, input.challengeId))
    .limit(1);

  if (!current) {
    return;
  }

  const nextAttempts = current.attempts + 1;
  await db
    .update(sudoChallenge)
    .set({
      attempts: nextAttempts,
      usedAt: nextAttempts >= MAX_ATTEMPTS ? new Date() : null,
    })
    .where(eq(sudoChallenge.id, input.challengeId));
}

export async function invalidateSudoChallenge(challengeId: string) {
  await db
    .update(sudoChallenge)
    .set({ usedAt: new Date() })
    .where(eq(sudoChallenge.id, challengeId));
}
