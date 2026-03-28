"use client";

import { createAuthClient } from "better-auth/react";
import { lastLoginMethodClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient(),
    passkeyClient(),
    usernameClient(),
    lastLoginMethodClient(),
    polarClient(),
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
