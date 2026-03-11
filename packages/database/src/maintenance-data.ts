import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "./client";
import { maintenanceLock } from "./schema";

export async function acquireMaintenanceLock(input: {
  name: string;
  ttlMs: number;
}) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - Math.max(0, input.ttlMs));

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(maintenanceLock)
      .values({
        name: input.name,
        lockedAt: now,
        heartbeatAt: now,
      })
      .onConflictDoNothing()
      .returning({ name: maintenanceLock.name });

    if (inserted.length > 0) {
      return true;
    }

    const updated = await tx
      .update(maintenanceLock)
      .set({ lockedAt: now, heartbeatAt: now })
      .where(
        and(
          eq(maintenanceLock.name, input.name),
          input.ttlMs > 0
            ? or(
                isNull(maintenanceLock.lockedAt),
                lt(maintenanceLock.lockedAt, cutoff)
              )
            : isNull(maintenanceLock.lockedAt)
        )
      )
      .returning({ name: maintenanceLock.name });

    return updated.length > 0;
  });
}

export async function releaseMaintenanceLock(name: string) {
  await db
    .update(maintenanceLock)
    .set({ lockedAt: null, heartbeatAt: null })
    .where(eq(maintenanceLock.name, name));
}
