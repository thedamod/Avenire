import { eq } from "drizzle-orm";
import { db } from "./client";
import { userSettings } from "./schema";

export interface UserSettingsRecord {
  emailReceipts: boolean;
  onboardingCompleted: boolean;
}

const DEFAULT_USER_SETTINGS: UserSettingsRecord = {
  emailReceipts: true,
  onboardingCompleted: false,
};

export async function getUserSettings(userId: string): Promise<UserSettingsRecord> {
  const [settings] = await db
    .select({
      emailReceipts: userSettings.emailReceipts,
      onboardingCompleted: userSettings.onboardingCompleted,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings) {
    return DEFAULT_USER_SETTINGS;
  }

  return {
    emailReceipts: settings.emailReceipts,
    onboardingCompleted: settings.onboardingCompleted,
  };
}

export async function upsertUserSettings(
  userId: string,
  updates: Partial<UserSettingsRecord>,
): Promise<UserSettingsRecord> {
  const now = new Date();
  const hasValidEmailReceipts = typeof updates.emailReceipts === "boolean";
  const hasValidOnboardingCompleted =
    typeof updates.onboardingCompleted === "boolean";

  const insertValues: typeof userSettings.$inferInsert = {
    userId,
    createdAt: now,
    updatedAt: now,
    ...(hasValidEmailReceipts ? { emailReceipts: updates.emailReceipts } : {}),
    ...(hasValidOnboardingCompleted
      ? { onboardingCompleted: updates.onboardingCompleted }
      : {}),
  };

  const conflictSet: Partial<typeof userSettings.$inferInsert> = {
    updatedAt: now,
    ...(hasValidEmailReceipts ? { emailReceipts: updates.emailReceipts } : {}),
    ...(hasValidOnboardingCompleted
      ? { onboardingCompleted: updates.onboardingCompleted }
      : {}),
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
      onboardingCompleted: userSettings.onboardingCompleted,
    });

  return {
    emailReceipts: settings.emailReceipts,
    onboardingCompleted: settings.onboardingCompleted,
  };
}
