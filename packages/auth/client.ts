import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { usernameClient } from "better-auth/client/plugins";

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  passkey,
  $ERROR_CODES,
  sendVerificationEmail,
  linkSocial,
  updateUser,
  useListPasskeys,
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
} = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [passkeyClient(), usernameClient()]
});
