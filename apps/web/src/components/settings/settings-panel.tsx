"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Avatar, AvatarFallback, AvatarImage } from "@avenire/ui/components/avatar";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { Progress } from "@avenire/ui/components/progress";
import { Switch } from "@avenire/ui/components/switch";
import {
  authClient,
  linkSocial,
  listAccounts,
  revokeOtherSessions,
  unlinkAccount,
  updateUser,
  useSession,
} from "@avenire/auth/client";
import { getFacehashUrl } from "@/lib/avatar";
import { useUploadThing } from "@/lib/uploadthing";
import {
  Camera,
  Check,
  Github,
  Globe,
  Key,
  Shield,
  TriangleAlert,
  Unlink,
  Users,
} from "lucide-react";

type WorkspaceSummary = {
  workspaceId: string;
  organizationId: string;
  rootFolderId: string;
  name: string;
};

type WorkspaceMember = {
  id: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: string;
};

type AccountEntry = {
  id?: string;
  providerId?: string;
  accountId?: string;
};

type PasskeyEntry = {
  id: string;
  name?: string | null;
  createdAt?: string;
  deviceType?: string;
};

type MeterUsage = {
  fourHourCapacity: number;
  fourHourBalance: number;
  overageCapacity: number;
  overageBalance: number;
  totalCapacity: number;
  totalBalance: number;
  refillAt: string | null;
};

type BillingUsage = {
  plan: "access" | "core" | "scholar";
  chat: MeterUsage;
  upload: MeterUsage;
  combined: {
    totalCapacity: number;
    totalBalance: number;
  };
};

type UserSettings = {
  emailReceipts: boolean;
};

const tabs = [
  { key: "account", label: "Account" },
  { key: "billing", label: "Billing" },
  { key: "security", label: "Security" },
  { key: "workspaces", label: "Workspaces" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const KEYBOARD_SHORTCUTS = [
  { label: "Search", keys: ["Ctrl", "K"] },
  { label: "New Chat", keys: ["Ctrl", "Shift", "O"] },
  { label: "Toggle Sidebar", keys: ["Ctrl", "B"] },
  { label: "Open Model Picker", keys: ["Ctrl", "/"] },
  { label: "Delete Current Chat", keys: ["Ctrl", "Shift", "⌫"] },
];

const PLAN_LABELS: Record<string, string> = {
  access: "Free Plan",
  core: "Core Plan",
  scholar: "Scholar Plan",
};

function getTimeUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Resetting...";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `Resets in ${h}h ${m}m`;
}

export function SettingsPanel({
  initialWorkspaces,
}: {
  initialWorkspaces: WorkspaceSummary[];
}) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = (searchParams.get("tab") as TabKey | null) ?? "account";

  // Profile state
  const [profileName, setProfileName] = useState(session?.user?.name ?? "");
  const [profileImage, setProfileImage] = useState(session?.user?.image ?? "");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accounts
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [accountsStatus, setAccountsStatus] = useState<string | null>(null);

  // Billing
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [preferencesStatus, setPreferencesStatus] = useState<string | null>(null);
  const [emailReceipts, setEmailReceipts] = useState(true);
  const [sessionsStatus, setSessionsStatus] = useState<string | null>(null);

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [passkeysStatus, setPasskeysStatus] = useState<string | null>(null);

  // Workspaces
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaces[0]?.workspaceId ?? "");
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceEmail, setWorkspaceEmail] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [workspaceDeleteConfirm, setWorkspaceDeleteConfirm] = useState("");
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState("");
  const [dangerStatus, setDangerStatus] = useState<string | null>(null);
  const [sudoActive, setSudoActive] = useState(false);
  const [sudoCode, setSudoCode] = useState("");
  const [sudoStatus, setSudoStatus] = useState<string | null>(null);
  const { startUpload: startAvatarUpload } = useUploadThing("imageUploader");

  useEffect(() => {
    setProfileName(session?.user?.name ?? "");
    setProfileImage(session?.user?.image ?? "");
  }, [session?.user?.image, session?.user?.name]);

  useEffect(() => {
    const src = session?.user?.image ?? getFacehashUrl(session?.user?.name ?? session?.user?.email ?? "");
    setAvatarPreview(src);
  }, [session?.user?.image, session?.user?.name, session?.user?.email]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.workspaceId === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const refreshAccounts = async () => {
    const result = await listAccounts();
    setAccounts(((result as { data?: AccountEntry[] | null }).data ?? []) as AccountEntry[]);
  };

  const refreshBillingUsage = async (showLoading = false) => {
    if (showLoading) {
      setBillingStatus("Loading usage...");
    }
    const response = await fetch("/api/billing/usage", { cache: "no-store" });
    if (!response.ok) {
      if (showLoading) {
        setBillingStatus("Unable to load billing usage.");
      }
      return;
    }
    const payload = (await response.json()) as { usage?: BillingUsage };
    setBillingUsage(payload.usage ?? null);
    if (showLoading) {
      setBillingStatus(null);
    }
  };

  const refreshPasskeys = async () => {
    const response = await fetch("/api/auth/passkey/list-user-passkeys", { cache: "no-store" });
    if (!response.ok) { setPasskeys([]); return; }
    const payload = (await response.json()) as PasskeyEntry[];
    setPasskeys(Array.isArray(payload) ? payload : []);
  };

  const refreshUserSettings = async () => {
    setPreferencesStatus("Loading preferences...");
    const response = await fetch("/api/user-settings", { cache: "no-store" });
    if (!response.ok) {
      setPreferencesStatus("Unable to load preferences.");
      return;
    }
    const payload = (await response.json()) as { settings?: UserSettings };
    setEmailReceipts(payload.settings?.emailReceipts ?? true);
    setPreferencesStatus(null);
  };

  const refreshMembers = async (workspaceId: string) => {
    const response = await fetch(`/api/workspaces/${workspaceId}/share/members`, { cache: "no-store" });
    if (!response.ok) { setWorkspaceMembers([]); return; }
    const payload = (await response.json()) as { members?: WorkspaceMember[] };
    setWorkspaceMembers(payload.members ?? []);
  };

  const refreshWorkspaces = async () => {
    const response = await fetch("/api/workspaces/list", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { workspaces?: WorkspaceSummary[] };
    setWorkspaces(payload.workspaces ?? []);
    if (!activeWorkspaceId && payload.workspaces?.[0]) {
      setActiveWorkspaceId(payload.workspaces[0].workspaceId);
    }
  };

  const refreshSudoStatus = async () => {
    const response = await fetch("/api/security/sudo", { cache: "no-store" });
    if (!response.ok) {
      setSudoActive(false);
      return;
    }
    const payload = (await response.json()) as { active?: boolean };
    setSudoActive(Boolean(payload.active));
    if (payload.active) {
      setSudoStatus("Sudo mode is active.");
    }
  };

  useEffect(() => {
    if (currentTab === "account" || currentTab === "billing") void refreshAccounts();
    if (currentTab === "billing") void refreshBillingUsage(true);
    if (currentTab === "billing") void refreshUserSettings();
    if (currentTab === "security") void refreshPasskeys();
    if (currentTab === "security" || currentTab === "workspaces") void refreshSudoStatus();
    if (currentTab === "workspaces" && activeWorkspaceId) void refreshMembers(activeWorkspaceId);
  }, [activeWorkspaceId, currentTab]);

  useEffect(() => {
    void refreshBillingUsage(false);

    const intervalId = window.setInterval(() => {
      void refreshBillingUsage(false);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
    void refreshSudoStatus();
  }, []);

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/settings?${params.toString()}` as Route);
  };

  const usagePct = billingUsage?.combined.totalCapacity
    ? (billingUsage.combined.totalBalance / billingUsage.combined.totalCapacity) * 100
    : 0;

  const planLabel = billingUsage ? (PLAN_LABELS[billingUsage.plan] ?? "Free Plan") : "Free Plan";

  const displayAvatar = avatarPreview || profileImage || getFacehashUrl(profileName || session?.user?.email || "");
  const fallbackInitials = (profileName || session?.user?.name || "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ─── Left Profile Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border/60 bg-sidebar p-6">
        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative group">
            <Avatar className="h-24 w-24 ring-2 ring-border ring-offset-2 ring-offset-sidebar">
              <AvatarImage src={displayAvatar} alt={profileName} />
              <AvatarFallback className="text-2xl">{fallbackInitials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Change avatar"
            >
              <Camera className="h-5 w-5 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const inputElement = e.currentTarget;
                const file = e.target.files?.[0];
                if (!file) return;
                void (async () => {
                  setIsUploadingAvatar(true);
                  try {
                    setProfileStatus("Uploading avatar...");
                    const uploadedFiles = await startAvatarUpload([file]);
                    const uploaded = uploadedFiles?.[0];
                    const uploadedFile = uploaded as
                      | { ufsUrl?: string | null; url?: string | null }
                      | undefined;
                    const uploadedUrl = uploadedFile?.ufsUrl ?? uploadedFile?.url ?? null;

                    if (!uploadedUrl) {
                      setProfileStatus("Unable to upload avatar.");
                      return;
                    }

                    setProfileImage(uploadedUrl);
                    setAvatarPreview(uploadedUrl);
                    setProfileStatus("Avatar uploaded. Save changes to apply.");
                  } catch {
                    setProfileStatus("Unable to upload avatar.");
                  } finally {
                    inputElement.value = "";
                    setIsUploadingAvatar(false);
                  }
                })();
              }}
            />
          </div>
          <div>
            <p className="font-semibold text-base leading-tight">{session?.user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{session?.user?.email}</p>
            <Badge variant="secondary" className="mt-2 text-xs">{planLabel}</Badge>
          </div>
        </div>

        {/* Usage limit */}
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Usage Limit</span>
            <span className="text-muted-foreground text-xs">
              {billingUsage ? `${Math.round(usagePct)}% remaining` : "100% remaining"}
            </span>
          </div>
          <Progress value={usagePct} className="h-1.5" />
          {billingUsage?.chat.refillAt ? (
            <p className="text-xs text-muted-foreground">{getTimeUntil(billingUsage.chat.refillAt)}</p>
          ) : null}
        </div>

        {/* Keyboard shortcuts */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Keyboard Shortcuts</p>
          <div className="space-y-2">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground/80">{shortcut.label}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="inline-flex items-center justify-center rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground leading-none"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ─── Right Content Area ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Mobile: compact profile header */}
        <div className="flex md:hidden items-center gap-3 border-b border-border/60 px-4 py-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={displayAvatar} alt={profileName} />
            <AvatarFallback>{fallbackInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session?.user?.name || "User"}</p>
            <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
          </div>
          <Badge variant="secondary" className="ml-auto shrink-0 text-xs">{planLabel}</Badge>
        </div>

        {/* Tab nav */}
        <div className="flex items-center gap-1 border-b border-border/60 px-4 md:px-6 py-2 overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTab(tab.key)}
              className={[
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                currentTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8">

          {/* ── Account Tab ── */}
          {currentTab === "account" ? (
            <>
              <Section title="Profile" description="Update your display name and avatar URL.">
                <div className="space-y-3 max-w-md">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                    <Input
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      value={profileName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Avatar URL</label>
                    <Input
                      onChange={(e) => { setProfileImage(e.target.value); setAvatarPreview(e.target.value); }}
                      placeholder="https://example.com/avatar.png"
                      value={profileImage}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={isSavingProfile || isUploadingAvatar}
                    onClick={() => {
                      void (async () => {
                        setIsSavingProfile(true);
                        try {
                          setProfileStatus("Saving...");
                          const result = await updateUser({
                            name: profileName.trim() || undefined,
                            image: profileImage.trim() || undefined,
                          });
                          setProfileStatus(result.error ? "Unable to update profile." : "Profile updated.");
                        } finally {
                          setIsSavingProfile(false);
                        }
                      })();
                    }}
                    type="button"
                  >
                    Save Changes
                  </Button>
                  {profileStatus ? <p className="text-xs text-muted-foreground">{profileStatus}</p> : null}
                </div>
              </Section>

              <Divider />

              <Section title="Connected Providers" description="Link your Google or GitHub account for social sign-in.">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { void linkSocial({ provider: "google" }); }}
                      type="button"
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      Connect Google
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { void linkSocial({ provider: "github" }); }}
                      type="button"
                    >
                      <Github className="mr-2 h-4 w-4" />
                      Connect GitHub
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {accounts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No linked accounts yet.</p>
                    ) : (
                      accounts.map((account) => (
                        <div
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                          key={account.id ?? `${account.providerId}-${account.accountId}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{account.providerId ?? "email"}</Badge>
                            <span className="text-xs text-muted-foreground">{account.accountId ?? account.id}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              const providerId = account.providerId;
                              if (!providerId) return;
                              void (async () => {
                                const result = await unlinkAccount({ accountId: account.accountId ?? "", providerId });
                                setAccountsStatus(result.error ? "Unable to unlink account." : "Account unlinked.");
                                await refreshAccounts();
                              })();
                            }}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {accountsStatus ? <p className="text-xs text-muted-foreground">{accountsStatus}</p> : null}
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Billing Tab ── */}
          {currentTab === "billing" ? (
            <>
              <Section title="Choose Your Plan" description="">
                <div className="grid gap-4 sm:grid-cols-3">
                  <PlanCard
                    name="Free"
                    price="$0/month"
                    features={["Small monthly limits for basic usage", "Basic models only"]}
                    current={!billingUsage || billingUsage.plan === "access"}
                    onUpgrade={null}
                  />
                  <PlanCard
                    name="Core"
                    price="$8/month"
                    features={[
                      "Expanded monthly limits for more flexibility",
                      "Access to all models",
                      "File uploads and web search",
                    ]}
                    popular
                    current={billingUsage?.plan === "core"}
                    onUpgrade={() => router.push("/pricing" as Route)}
                  />
                  <PlanCard
                    name="Scholar"
                    price="$50/month"
                    features={[
                      "Over 10× Core limits for power users",
                      "Includes everything in Core",
                      "Priority support",
                    ]}
                    current={billingUsage?.plan === "scholar"}
                    onUpgrade={() => router.push("/pricing" as Route)}
                  />
                </div>
                {billingStatus ? <p className="text-xs text-muted-foreground mt-2">{billingStatus}</p> : null}
              </Section>

              <Divider />

              <Section title="Billing Preferences" description="">
                <div className="space-y-1">
                  <ToggleRow
                    label="Email me receipts"
                    description="Send receipts to your account email when a payment succeeds."
                    checked={emailReceipts}
                    onCheckedChange={(nextValue) => {
                      const previous = emailReceipts;
                      setEmailReceipts(nextValue);
                      void (async () => {
                        setPreferencesStatus("Saving preferences...");
                        const response = await fetch("/api/user-settings", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ emailReceipts: nextValue }),
                        });
                        if (!response.ok) {
                          setEmailReceipts(previous);
                          setPreferencesStatus("Unable to save preferences.");
                          return;
                        }
                        setPreferencesStatus("Preferences saved.");
                      })();
                    }}
                  />
                  {preferencesStatus ? (
                    <p className="text-xs text-muted-foreground mt-2">{preferencesStatus}</p>
                  ) : null}
                </div>
              </Section>

              <Divider />

              <Section title="Manage Subscription" description="">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const response = await fetch("/api/billing/portal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ returnPath: "/settings?tab=billing" }),
                      });
                      if (!response.ok) { setBillingStatus("No customer portal available yet."); return; }
                      const payload = (await response.json()) as { url?: string };
                      if (!payload.url) { setBillingStatus("No customer portal available yet."); return; }
                      window.location.href = payload.url;
                    })();
                  }}
                  type="button"
                >
                  Manage Billing &amp; Invoices
                </Button>
              </Section>
            </>
          ) : null}

          {/* ── Security Tab ── */}
          {currentTab === "security" ? (
            <>
              <Section
                title="Sudo Verification"
                description="Sensitive actions require a short-lived verification code, similar to GitHub sudo mode."
              >
                <div className="space-y-3 max-w-md rounded-lg border border-border/60 bg-card p-4">
                  <p className="text-xs text-muted-foreground">
                    {sudoActive
                      ? "Verified. You can now run danger-zone actions for a limited time."
                      : "Verify your identity before deleting workspaces or your account."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void (async () => {
                          setSudoStatus("Sending verification code...");
                          const response = await fetch("/api/security/sudo", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "request" }),
                          });
                          setSudoStatus(response.ok ? "Verification code sent to your email." : "Unable to send code.");
                        })();
                      }}
                    >
                      Send Code
                    </Button>
                    <Input
                      value={sudoCode}
                      onChange={(e) => setSudoCode(e.target.value)}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit code"
                      className="w-36"
                    />
                    <Button
                      size="sm"
                      type="button"
                      disabled={sudoCode.trim().length !== 6}
                      onClick={() => {
                        void (async () => {
                          setSudoStatus("Verifying code...");
                          const response = await fetch("/api/security/sudo", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "verify", code: sudoCode.trim() }),
                          });
                          if (!response.ok) {
                            setSudoActive(false);
                            setSudoStatus("Invalid or expired code.");
                            return;
                          }
                          setSudoActive(true);
                          setSudoCode("");
                          setSudoStatus("Sudo mode is active.");
                        })();
                      }}
                    >
                      Verify
                    </Button>
                  </div>
                  {sudoStatus ? <p className="text-xs text-muted-foreground">{sudoStatus}</p> : null}
                </div>
              </Section>

              <Divider />

              <Section title="Passkeys" description="Add or remove passkeys for passwordless sign-in.">
                <div className="space-y-3">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      void (async () => {
                        setPasskeysStatus("Adding passkey...");
                        const addPasskey = (authClient as any)?.passkey?.addPasskey as
                          | ((opts?: { name?: string }) => Promise<{ error: unknown }>)
                          | undefined;
                        if (!addPasskey) { setPasskeysStatus("Passkey client is unavailable."); return; }
                        const result = await addPasskey({ name: "Avenire Passkey" });
                        setPasskeysStatus(result?.error ? "Unable to add passkey." : "Passkey added.");
                        await refreshPasskeys();
                      })();
                    }}
                  >
                    <Key className="mr-2 h-4 w-4" />
                    Add Passkey
                  </Button>
                  <div className="space-y-2">
                    {passkeys.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No passkeys registered.</p>
                    ) : (
                      passkeys.map((passkey) => (
                        <div
                          key={passkey.id}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium">{passkey.name ?? "Passkey"}</p>
                            <p className="text-xs text-muted-foreground">{passkey.deviceType ?? "Unknown device"}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              void (async () => {
                                const response = await fetch("/api/auth/passkey/delete-passkey", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: passkey.id }),
                                });
                                setPasskeysStatus(response.ok ? "Passkey removed." : "Unable to remove passkey.");
                                await refreshPasskeys();
                              })();
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {passkeysStatus ? <p className="text-xs text-muted-foreground">{passkeysStatus}</p> : null}
                </div>
              </Section>

              <Divider />

              <Section title="Active Sessions" description="Manage and sign out from other devices that are currently logged in to your account.">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void (async () => {
                      setSessionsStatus("Signing out other devices...");
                      const result = await revokeOtherSessions();
                      setSessionsStatus(result.error ? "Unable to sign out other devices." : "Signed out from other devices.");
                    })();
                  }}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Sign Out Other Devices
                </Button>
                {sessionsStatus ? <p className="text-xs text-muted-foreground">{sessionsStatus}</p> : null}
              </Section>

              <Divider />

              <Section title="Danger Zone" description="Permanently delete your account. This action cannot be undone.">
                <div className="max-w-md rounded-lg border border-red-500/40 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-start gap-2 text-red-600">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      Type <span className="font-semibold">DELETE MY ACCOUNT</span> and use sudo mode first.
                    </p>
                  </div>
                  <Input
                    value={accountDeleteConfirm}
                    onChange={(e) => setAccountDeleteConfirm(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                  />
                  <Button
                    size="sm"
                    type="button"
                    disabled={!sudoActive || accountDeleteConfirm.trim() !== "DELETE MY ACCOUNT"}
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      void (async () => {
                        setDangerStatus("Deleting account...");
                        const response = await fetch("/api/account", { method: "DELETE" });
                        if (!response.ok) {
                          setDangerStatus("Unable to delete account.");
                          return;
                        }
                        window.location.href = "/login";
                      })();
                    }}
                  >
                    Delete Account
                  </Button>
                </div>
                {dangerStatus ? <p className="text-xs text-muted-foreground">{dangerStatus}</p> : null}
              </Section>
            </>
          ) : null}

          {/* ── Workspaces Tab ── */}
          {currentTab === "workspaces" ? (
            <>
              <Section title="Your Workspaces" description="Create and switch between workspaces.">
                <div className="space-y-3 max-w-md">
                  <div className="flex gap-2">
                    <Input
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="New workspace name"
                      value={workspaceName}
                    />
                    <Button
                      size="sm"
                      disabled={isCreatingWorkspace || !workspaceName.trim()}
                      type="button"
                      onClick={() => {
                        void (async () => {
                          setIsCreatingWorkspace(true);
                          try {
                            const response = await fetch("/api/workspaces", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: workspaceName.trim() }),
                            });
                            if (!response.ok) { setWorkspaceStatus("Unable to create workspace."); return; }
                            setWorkspaceStatus("Workspace created.");
                            setWorkspaceName("");
                            await refreshWorkspaces();
                          } finally {
                            setIsCreatingWorkspace(false);
                          }
                        })();
                      }}
                    >
                      Create
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {workspaces.map((workspace) => (
                      <button
                        key={workspace.workspaceId}
                        type="button"
                        className={[
                          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          workspace.workspaceId === activeWorkspaceId
                            ? "border-primary bg-accent/40"
                            : "border-border/60 bg-card",
                        ].join(" ")}
                        onClick={() => { setActiveWorkspaceId(workspace.workspaceId); setWorkspaceStatus(null); }}
                      >
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{workspace.name}</span>
                        {workspace.workspaceId === activeWorkspaceId && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              <Divider />

              <Section
                title="Workspace Members"
                description={`Add or remove people from ${selectedWorkspace?.name ?? "this workspace"}.`}
              >
                <div className="space-y-3 max-w-md">
                  <div className="flex gap-2">
                    <Input
                      onChange={(e) => setWorkspaceEmail(e.target.value)}
                      placeholder="teammate@example.com"
                      value={workspaceEmail}
                    />
                    <Button
                      size="sm"
                      disabled={isInvitingMember || !selectedWorkspace || !workspaceEmail.trim()}
                      type="button"
                      onClick={() => {
                        if (!selectedWorkspace) return;
                        void (async () => {
                          setIsInvitingMember(true);
                          try {
                            const response = await fetch(`/api/workspaces/${selectedWorkspace.workspaceId}/share/members`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: workspaceEmail.trim() }),
                            });
                            setWorkspaceStatus(response.ok ? "Member added." : "Unable to add member.");
                            if (response.ok) { setWorkspaceEmail(""); await refreshMembers(selectedWorkspace.workspaceId); }
                          } finally {
                            setIsInvitingMember(false);
                          }
                        })();
                      }}
                    >
                      Invite
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {workspaceMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No members found.</p>
                    ) : (
                      workspaceMembers.map((member, index) => (
                        (() => {
                          const currentUserId = session?.user?.id ?? null;
                          const currentUserEmail = session?.user?.email?.toLowerCase() ?? null;
                          const memberEmail = member.email?.toLowerCase() ?? null;
                          const isSelf =
                            (currentUserId && (member.userId === currentUserId || member.id === currentUserId)) ||
                            (currentUserEmail && memberEmail === currentUserEmail);
                          const isOwner = member.role === "owner";
                          const canRemove = Boolean(!isSelf && !isOwner);

                          return (
                            <div
                              key={member.id ?? member.email ?? member.userId ?? `member-${index}`}
                              className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium">{member.name ?? member.email ?? "Unknown user"}</p>
                                <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                              </div>
                              {canRemove ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  type="button"
                                  onClick={() => {
                                    if (!selectedWorkspace || !(member.id ?? member.email)) return;
                                    void (async () => {
                                      const response = await fetch(`/api/workspaces/${selectedWorkspace.workspaceId}/share/members`, {
                                        method: "DELETE",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ memberIdOrEmail: member.id ?? member.email }),
                                      });
                                      setWorkspaceStatus(response.ok ? "Member removed." : "Unable to remove member.");
                                      if (response.ok) await refreshMembers(selectedWorkspace.workspaceId);
                                    })();
                                  }}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          );
                        })()
                      ))
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedWorkspace}
                    type="button"
                    onClick={() => {
                      if (!selectedWorkspace) return;
                      void (async () => {
                        const response = await fetch(`/api/workspaces/${selectedWorkspace.workspaceId}/share/team`, { method: "POST" });
                        setWorkspaceStatus(response.ok ? "Workspace shared with team." : "Unable to share with team.");
                      })();
                    }}
                  >
                    Share workspace with whole team
                  </Button>
                  {workspaceStatus ? <p className="text-xs text-muted-foreground">{workspaceStatus}</p> : null}
                </div>
              </Section>

              <Divider />

              <Section
                title="Workspace Danger Zone"
                description="Delete the selected workspace and all associated files, shares, and access."
              >
                <div className="max-w-md rounded-lg border border-red-500/40 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-start gap-2 text-red-600">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      Type the workspace name exactly to confirm deletion.
                    </p>
                  </div>
                  <Input
                    value={workspaceDeleteConfirm}
                    onChange={(e) => setWorkspaceDeleteConfirm(e.target.value)}
                    placeholder={selectedWorkspace?.name ?? "Workspace name"}
                    disabled={!selectedWorkspace}
                  />
                  <Button
                    size="sm"
                    type="button"
                    className="bg-red-600 text-white hover:bg-red-700"
                    disabled={
                      !selectedWorkspace
                      || !sudoActive
                      || workspaceDeleteConfirm.trim() !== (selectedWorkspace?.name ?? "")
                    }
                    onClick={() => {
                      if (!selectedWorkspace) return;
                      void (async () => {
                        setWorkspaceStatus("Deleting workspace...");
                        const response = await fetch(`/api/workspaces/${selectedWorkspace.workspaceId}`, {
                          method: "DELETE",
                        });
                        if (!response.ok) {
                          setWorkspaceStatus("Unable to delete workspace.");
                          return;
                        }
                        const payload = (await response.json()) as { workspaces?: WorkspaceSummary[] };
                        const nextWorkspaces = payload.workspaces ?? [];
                        setWorkspaces(nextWorkspaces);
                        setWorkspaceDeleteConfirm("");
                        if (nextWorkspaces.length > 0) {
                          setActiveWorkspaceId(nextWorkspaces[0].workspaceId);
                        }
                        setWorkspaceStatus("Workspace deleted.");
                      })();
                    }}
                  >
                    Delete Workspace
                  </Button>
                </div>
              </Section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/40" />;
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  current,
  popular,
  onUpgrade,
}: {
  name: string;
  price: string;
  features: string[];
  current: boolean;
  popular?: boolean;
  onUpgrade: (() => void) | null;
}) {
  return (
    <div
      className={[
        "relative flex flex-col rounded-xl border p-5 gap-4 transition-all",
        popular
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border/60 bg-card",
      ].join(" ")}
    >
      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
          Most Popular
        </span>
      ) : null}
      <div>
        <p className="font-bold text-base">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{price}</p>
      </div>
      <ul className="flex-1 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {current ? (
        <Button size="sm" variant="outline" disabled className="w-full">Current Plan</Button>
      ) : (
        <Button size="sm" onClick={onUpgrade ?? undefined} className="w-full">Upgrade</Button>
      )}
    </div>
  );
}
