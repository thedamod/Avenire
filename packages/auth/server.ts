import { db } from "@avenire/database";
import {
  account,
  invitation,
  member,
  organization as organizationTable,
  passkey as passkeyTable,
  session,
  team,
  teamMember,
  user,
  verification,
} from "@avenire/database/auth-schema";
import {
  Emailer,
  renderDeleteAccountEmail,
  renderFileShareNotificationEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
  renderWelcomeEmail,
  renderWorkspaceShareNotificationEmail
} from "@avenire/emailer";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { organization } from "better-auth/plugins/organization";
import { username } from "better-auth/plugins/username";

const appUrl = process.env.BETTER_AUTH_URL?.trim();
if (!appUrl) {
  throw new Error("Missing BETTER_AUTH_URL. Set BETTER_AUTH_URL for auth server configuration.");
}
const emailer = new Emailer();
const slugifyWorkspace = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
const trustedOrigins = Array.from(new Set([appUrl, "https://avenire.space"]));
const generatedBetterAuthSchema = {
  user,
  session,
  account,
  verification,
  organization: organizationTable,
  member,
  invitation,
  team,
  teamMember,
  passkey: passkeyTable,
};

export const auth = betterAuth({
  trustedOrigins,
  database: drizzleAdapter(db, { provider: "pg", schema: generatedBetterAuthSchema }),
  session: {
    updateAge: 60 * 60
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await emailer.send({
        to: [user.email],
        subject: "Reset your password",
        html: await renderPasswordResetEmail({ name: user.name ?? "there", resetLink: url })
      });
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailer.send({
        to: [user.email],
        subject: "Verify your email",
        html: await renderVerificationEmail({ name: user.name ?? "there", confirmationLink: url })
      });
    }
  },
  user: {
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        await emailer.send({
          to: [user.email],
          subject: "Confirm account deletion",
          html: await renderDeleteAccountEmail({ name: user.name ?? "there", confirmationLink: url })
        });
      }
    }
  },
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
      trustedProviders: ["google", "github"]
    }
  },
  socialProviders: {
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? {
          google: {
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            mapProfileToUser: (profile) => ({
              name: profile.given_name ?? profile.name,
              username: profile.name
            })
          }
        }
      : {}),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? {
          github: {
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
            mapProfileToUser: (profile) => ({
              name: profile.name,
              username: profile.name
            })
          }
        }
      : {})
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.includes("sign-up")) return;
      const newSession = ctx.context.newSession;
      if (!newSession) return;

      await emailer.send({
        to: [newSession.user.email],
        subject: "Welcome to Avenire",
        html: await renderWelcomeEmail({ name: newSession.user.name ?? "there" })
      });

      try {
        const workspaceNameBase =
          newSession.user.name ?? newSession.user.email.split("@")[0] ?? "workspace";
        const slugBase = slugifyWorkspace(workspaceNameBase) || "workspace";
        await auth.api.createOrganization({
          body: {
            userId: newSession.user.id,
            name: `${workspaceNameBase}'s Workspace`,
            slug: `${slugBase}-${newSession.user.id.slice(0, 6)}`
          }
        });
      } catch (error) {
        console.error("Failed to create default workspace", error);
      }
    })
  },
  plugins: [
    username({
      usernameValidator: () => true
    }),
    organization({
      teams: {
        enabled: true,
      },
    }),
    passkey({
      rpName: "Avenire",
      origin: appUrl
    }),
    nextCookies()
  ],
  onAPIError: {
    throw: false
  }
});

export const authRouteHandlers = toNextJsHandler(auth);

export type Session = typeof auth.$Infer.Session;

export async function sendFileShareEmail(input: {
  toEmail: string;
  fileName: string;
  shareUrl: string;
  sharedByName?: string;
}) {
  await emailer.send({
    to: [input.toEmail],
    subject: `${input.sharedByName ?? "Someone"} shared a file with you`,
    html: await renderFileShareNotificationEmail({
      fileName: input.fileName,
      shareUrl: input.shareUrl,
      sharedByName: input.sharedByName,
    }),
  });
}

export async function sendWorkspaceShareEmail(input: {
  toEmail: string;
  workspaceName: string;
  workspaceUrl: string;
  sharedByName?: string;
}) {
  await emailer.send({
    to: [input.toEmail],
    subject: `${input.sharedByName ?? "Someone"} shared a workspace with you`,
    html: await renderWorkspaceShareNotificationEmail({
      workspaceName: input.workspaceName,
      workspaceUrl: input.workspaceUrl,
      sharedByName: input.sharedByName,
    }),
  });
}

export async function sendSudoVerificationCodeEmail(input: {
  toEmail: string;
  code: string;
  expiresInMinutes: number;
}) {
  await emailer.send({
    to: [input.toEmail],
    subject: "Your Avenire security verification code",
    html: `<p>Use this code to confirm a sensitive settings action:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${input.code}</p><p>This code expires in ${input.expiresInMinutes} minutes.</p>`,
  });
}
