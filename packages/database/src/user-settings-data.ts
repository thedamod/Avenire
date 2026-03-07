import { eq } from "drizzle-orm";
import { db } from "./client";
import { userSettings } from "./schema";

export interface UserSettingsRecord {
  emailReceipts: boolean;
}

const DEFAULT_USER_SETTINGS: UserSettingsRecord = {
  emailReceipts: true,
};

export async function getUserSettings(userId: string): Promise<UserSettingsRecord> {
  const [settings] = await db
    .select({
      emailReceipts: userSettings.emailReceipts,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings) {
    return DEFAULT_USER_SETTINGS;
  }

  return {
    emailReceipts: settings.emailReceipts,
  };
}

export async function upsertUserSettings(
  userId: string,
  updates: Partial<UserSettingsRecord>,
): Promise<UserSettingsRecord> {
  const now = new Date();
  const hasValidEmailReceipts = typeof updates.emailReceipts === "boolean";

  const insertValues: typeof userSettings.$inferInsert = {
    userId,
    createdAt: now,
    updatedAt: now,
    ...(hasValidEmailReceipts ? { emailReceipts: updates.emailReceipts } : {}),
  };

  const conflictSet: Partial<typeof userSettings.$inferInsert> = {
    updatedAt: now,
    ...(hasValidEmailReceipts ? { emailReceipts: updates.emailReceipts } : {}),
  };

  const [settings] = await db
    .insert(userSettings)
    .values(insertValues)
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: conflictSet,
    })
    .returning({
      emailReceipts: userSettings.emailReceipts,
    });

  return {
    emailReceipts: settings.emailReceipts,
  };
}
