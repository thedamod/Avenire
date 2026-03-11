import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient(),
    passkeyClient(),
    usernameClient(),
  ]
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  $ERROR_CODES,
  sendVerificationEmail,
  linkSocial,
  updateUser,
  listAccounts,
  unlinkAccount,
  listSessions,
  revokeSession,
  revokeSessions,
  revokeOtherSessions,
  deleteUser,
  changePassword,
  requestPasswordReset,
  resetPassword
} = authClient;
