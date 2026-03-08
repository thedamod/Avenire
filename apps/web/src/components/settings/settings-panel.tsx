"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Avatar, AvatarFallback, AvatarImage } from "@avenire/ui/components/avatar";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
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
import { cn } from "@/lib/utils";
import {
  Building2,
  Camera,
  Check,
  CreditCard,
  Database,
  Github,
  Globe,
  Key,
  SlidersHorizontal,
  Shield,
  TriangleAlert,
  Unlink,
  User,
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
  { key: "account", label: "Account", icon: User },
  { key: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { key: "workspace", label: "Workspace", icon: Building2 },
  { key: "data", label: "Data", icon: Database },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "security", label: "Security", icon: Shield },
  { key: "shortcuts", label: "Keyboard Shortcuts", icon: Key, mobileHidden: true },
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
const PRIVACY_MODE_STORAGE_KEY = "avenire:settings:privacy-mode";

export function SettingsPanel({
  initialWorkspaces,
  tabMode = "url",
  initialTab = "account",
}: {
  initialWorkspaces?: WorkspaceSummary[];
  tabMode?: "url" | "local";
  initialTab?: TabKey;
}) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [localTab, setLocalTab] = useState<TabKey>(initialTab);
  const validTabSet = useMemo(() => new Set<TabKey>(tabs.map((tab) => tab.key)), []);
  const tabFromQuery = searchParams.get("tab");
  const currentTab = tabMode === "url" && tabFromQuery && validTabSet.has(tabFromQuery as TabKey)
    ? (tabFromQuery as TabKey)
    : localTab;

  // Profile state
  const [profileName, setProfileName] = useState(session?.user?.name ?? "");
  const [profileImage, setProfileImage] = useState(session?.user?.image ?? "");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { startUpload: startAvatarUpload } = useUploadThing("imageUploader");

  // Accounts
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [accountsStatus, setAccountsStatus] = useState<string | null>(null);

  // Billing
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [preferencesStatus, setPreferencesStatus] = useState<string | null>(null);
  const [emailReceipts, setEmailReceipts] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [sessionsStatus, setSessionsStatus] = useState<string | null>(null);

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [passkeysStatus, setPasskeysStatus] = useState<string | null>(null);

  // Workspaces
  const [workspaces, setWorkspaces] = useState(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaces?.[0]?.workspaceId ?? "");
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
  const [sudoDialogOpen, setSudoDialogOpen] = useState(false);
  const [sudoActionLabel, setSudoActionLabel] = useState("this action");
  const [sudoRequestingCode, setSudoRequestingCode] = useState(false);
  const [sudoVerifyingCode, setSudoVerifyingCode] = useState(false);
  const pendingSudoActionRef = useRef<null | (() => Promise<void>)>(null);

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
      setSudoStatus(null);
      return;
    }
    const payload = (await response.json()) as { active?: boolean };
    setSudoActive(Boolean(payload.active));
    if (payload.active) {
      setSudoStatus("Sudo mode is active for this session.");
    } else {
      setSudoStatus(null);
    }
  };

  const saveProfile = async (nextImage?: string) => {
    setProfileStatus("Saving...");
    const result = await updateUser({
      name: profileName.trim() || undefined,
      image: (nextImage ?? profileImage).trim() || undefined,
    });
    setProfileStatus(result.error ? "Unable to update profile." : "Profile updated.");
    return !result.error;
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setAvatarUploading(true);
    setProfileStatus("Uploading avatar...");

    try {
      const uploaded = ((await startAvatarUpload([file])) ?? [])[0] as
        | { ufsUrl?: string | null; url?: string | null }
        | undefined;
      const uploadedUrl = uploaded?.ufsUrl ?? uploaded?.url ?? null;

      if (!uploadedUrl) {
        setProfileStatus("Unable to upload avatar.");
        return;
      }

      setProfileImage(uploadedUrl);
      setAvatarPreview(uploadedUrl);

      const saved = await saveProfile(uploadedUrl);
      if (saved) {
        setProfileStatus("Avatar uploaded and saved.");
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const requestSudoForAction = (actionLabel: string, action: () => Promise<void>) => {
    pendingSudoActionRef.current = action;
    setSudoActionLabel(actionLabel);
    setSudoCode("");
    setSudoStatus(null);
    setSudoDialogOpen(true);
  };

  const requestSudoCode = async () => {
    setSudoRequestingCode(true);
    setSudoStatus("Sending verification code...");

    try {
      const response = await fetch("/api/security/sudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setSudoStatus(response.ok ? "Verification code sent to your email." : (payload.error ?? "Unable to send code."));
    } finally {
      setSudoRequestingCode(false);
    }
  };

  const verifySudoCodeAndContinue = async () => {
    setSudoVerifyingCode(true);
    setSudoStatus("Verifying code...");

    try {
      const response = await fetch("/api/security/sudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: sudoCode.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setSudoActive(false);
        setSudoStatus(payload.error ?? "Invalid or expired code.");
        return;
      }

      setSudoActive(true);
      setSudoCode("");
      setSudoStatus("Sudo mode is active for 12 hours.");

      const pendingAction = pendingSudoActionRef.current;
      pendingSudoActionRef.current = null;
      setSudoDialogOpen(false);

      if (pendingAction) {
        await pendingAction();
      }
    } finally {
      setSudoVerifyingCode(false);
    }
  };

  useEffect(() => {
    if (currentTab === "account" || currentTab === "billing") void refreshAccounts();
    if (currentTab === "billing") void refreshBillingUsage(true);
    if (currentTab === "billing") void refreshUserSettings();
    if (currentTab === "security") void refreshPasskeys();
    if (currentTab === "security" || currentTab === "workspace") void refreshSudoStatus();
    if (currentTab === "workspace" && activeWorkspaceId) void refreshMembers(activeWorkspaceId);
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

  useEffect(() => {
    const stored = window.localStorage.getItem(PRIVACY_MODE_STORAGE_KEY);
    setPrivacyMode(stored === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      PRIVACY_MODE_STORAGE_KEY,
      privacyMode ? "1" : "0"
    );
  }, [privacyMode]);

  useEffect(() => {
    if (sudoDialogOpen && !sudoActive) {
      void requestSudoCode();
    }
  }, [sudoActive, sudoDialogOpen]);

  const setTab = (tab: TabKey) => {
    if (tabMode === "local") {
      setLocalTab(tab);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/settings?${params.toString()}` as Route);
  };

  const planLabel = billingUsage ? (PLAN_LABELS[billingUsage.plan] ?? "Free Plan") : "Free Plan";
  const mobileTabs = tabs.filter((tab) => !("mobileHidden" in tab && tab.mobileHidden));
  const hasPaidPlan = billingUsage?.plan === "core" || billingUsage?.plan === "scholar";

  const displayAvatar = avatarPreview || profileImage || getFacehashUrl(profileName || session?.user?.email || "");
  const fallbackInitials = (profileName || session?.user?.name || "U").slice(0, 2).toUpperCase();

  const handleManageBilling = async () => {
    if (!hasPaidPlan) {
      router.push("/pricing" as Route);
      return;
    }

    setBillingStatus("Opening billing portal...");
    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath: "/settings?tab=billing" }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string };

    if (!response.ok || !payload.url) {
      setBillingStatus(payload.error ?? "Unable to open billing portal.");
      return;
    }

    window.location.href = payload.url;
  };

  const runDeleteAccount = async () => {
    setDangerStatus("Deleting account...");
    const response = await fetch("/api/account", { method: "DELETE" });

    if (response.status === 403) {
      setSudoActive(false);
      setDangerStatus("Verification required.");
      requestSudoForAction("delete your account", runDeleteAccount);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setDangerStatus(payload.error ?? "Unable to delete account.");
      return;
    }

    window.location.href = "/login";
  };

  const runDeleteWorkspace = async () => {
    if (!selectedWorkspace) {
      return;
    }

    setWorkspaceStatus("Deleting workspace...");
    const response = await fetch(`/api/workspaces/${selectedWorkspace.workspaceId}`, {
      method: "DELETE",
    });

    if (response.status === 403) {
      setSudoActive(false);
      setWorkspaceStatus("Verification required.");
      requestSudoForAction(`delete ${selectedWorkspace.name}`, runDeleteWorkspace);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setWorkspaceStatus(payload.error ?? "Unable to delete workspace.");
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
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background sm:rounded-xl md:flex-row">
      {/* ─── Left Settings Navigation ─────────────────────────────── */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/60 bg-sidebar p-4 md:flex">
        <div className="mb-4">
          <h2 className="font-semibold text-xl">Settings</h2>
        </div>

        <div className="space-y-2">
          <p className="px-2 text-muted-foreground text-xs">Account</p>
          <Button
            onClick={() => setTab("account")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "account" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <User className="h-4 w-4" />
            Account
          </Button>
          <Button
            onClick={() => setTab("preferences")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "preferences" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Preferences
          </Button>
        </div>

        <div className="mt-5 space-y-2">
          <p className="px-2 text-muted-foreground text-xs">Workspace</p>
          <Button
            onClick={() => setTab("workspace")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "workspace" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <Building2 className="h-4 w-4" />
            Workspace
          </Button>
          <Button
            onClick={() => setTab("data")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "data" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <Database className="h-4 w-4" />
            Data
          </Button>
          <Button
            onClick={() => setTab("billing")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "billing" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Button>
          <Button
            onClick={() => setTab("security")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "security" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <Shield className="h-4 w-4" />
            Security
          </Button>
          <Button
            onClick={() => setTab("shortcuts")}
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "shortcuts" ? "bg-muted font-medium hover:bg-muted" : "hover:bg-muted/70",
            ].join(" ")}
            variant="ghost"
          >
            <Key className="h-4 w-4" />
            Keyboard Shortcuts
          </Button>
        </div>
      </aside>

      {/* ─── Right Content Area ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Mobile: compact profile header */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 md:hidden">
          <Avatar className="h-9 w-9">
            <AvatarImage src={displayAvatar} alt={profileName} />
            <AvatarFallback>{fallbackInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              <SensitiveText
                className="max-w-full"
                privacyMode={privacyMode}
                value={session?.user?.name || "User"}
              />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <SensitiveText
                className="max-w-full"
                privacyMode={privacyMode}
                value={session?.user?.email}
              />
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto shrink-0 text-xs">{planLabel}</Badge>
        </div>

        {/* Tab nav */}
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-border/60 px-4 py-3 md:hidden">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            return (
            <Button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={[
                "h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                currentTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              ].join(" ")}
              type="button"
              variant="ghost"
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </Button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 md:space-y-8 md:px-8 md:py-6">

          {/* ── Account Tab ── */}
          {currentTab === "account" ? (
            <>
              <Section title="Profile" description="Update your display name and avatar.">
                <div className="space-y-3 max-w-md">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                    <Input
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      value={profileName}
                    />
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={displayAvatar} alt={profileName} />
                        <AvatarFallback>{fallbackInitials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Profile photo</p>
                        <p className="text-xs text-muted-foreground">
                          Upload an image and we will save the CDN URL to your account automatically.
                        </p>
                      </div>
                    </div>
                    <input
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                      ref={fileInputRef}
                      type="file"
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        disabled={avatarUploading}
                        onClick={() => fileInputRef.current?.click()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        {avatarUploading ? "Uploading..." : "Upload Avatar"}
                      </Button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isSavingProfile || isUploadingAvatar}
                    onClick={() => {
                      void saveProfile();
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
                            <SensitiveText
                              className="max-w-[180px] text-xs text-muted-foreground"
                              privacyMode={privacyMode}
                              value={account.accountId ?? account.id}
                            />
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
                    void handleManageBilling();
                  }}
                  type="button"
                >
                  {hasPaidPlan ? "Manage Billing & Invoices" : "View Plans"}
                </Button>
                {billingStatus ? <p className="mt-2 text-xs text-muted-foreground">{billingStatus}</p> : null}
              </Section>
            </>
          ) : null}

          {/* ── Security Tab ── */}
          {currentTab === "security" ? (
            <>
              <Section
                title="Sensitive Actions"
                description="Protected actions will prompt for a 6-digit verification code and stay approved for 12 hours."
              >
                <div className="space-y-3 max-w-md rounded-lg border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Sudo verification</p>
                      <p className="text-xs text-muted-foreground">
                        {sudoActive
                          ? "Verified for this browser session."
                          : "You will only be prompted when you start a protected action."}
                      </p>
                    </div>
                    <Badge variant={sudoActive ? "default" : "secondary"}>
                      {sudoActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sudoActive
                      ? "Your current sudo session is valid for up to 12 hours."
                      : "Deleting your account or a workspace will open a verification dialog automatically."}
                  </p>
                  <Button
                    disabled={sudoActive}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      requestSudoForAction("verify this session", async () => {});
                    }}
                  >
                    {sudoActive ? "Verification Active" : "Verify Now"}
                  </Button>
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
                      Type <span className="font-semibold">DELETE MY ACCOUNT</span>. If needed, we will prompt for verification after you click delete.
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
                    disabled={accountDeleteConfirm.trim() !== "DELETE MY ACCOUNT"}
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      if (!sudoActive) {
                        requestSudoForAction("delete your account", runDeleteAccount);
                        return;
                      }
                      void runDeleteAccount();
                    }}
                  >
                    Delete Account
                  </Button>
                </div>
                {dangerStatus ? <p className="text-xs text-muted-foreground">{dangerStatus}</p> : null}
              </Section>
            </>
          ) : null}

          {/* ── Preferences Tab ── */}
          {currentTab === "preferences" ? (
            <>
              <Section title="Preferences" description="Control your account defaults and behavior.">
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
                  <ToggleRow
                    checked={privacyMode}
                    description="Blur personal details in settings until you click to reveal them."
                    label="Privacy mode"
                    onCheckedChange={(nextValue) => {
                      setPrivacyMode(nextValue);
                    }}
                  />
                  {preferencesStatus ? (
                    <p className="mt-2 text-xs text-muted-foreground">{preferencesStatus}</p>
                  ) : null}
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Workspace Tab ── */}
          {currentTab === "workspace" ? (
            <>
              <Section title="Your Workspaces" description="Create and switch between workspaces.">
                <div className="max-w-md space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
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
                      <Button
                        key={workspace.workspaceId}
                        className={[
                          "h-auto w-full justify-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          workspace.workspaceId === activeWorkspaceId
                            ? "border-primary bg-accent/40"
                            : "border-border/60 bg-card",
                        ].join(" ")}
                        type="button"
                        variant="ghost"
                        onClick={() => { setActiveWorkspaceId(workspace.workspaceId); setWorkspaceStatus(null); }}
                      >
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{workspace.name}</span>
                        {workspace.workspaceId === activeWorkspaceId && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              </Section>

              <Divider />

              <Section
                title="Workspace Members"
                description={`Add or remove people from ${selectedWorkspace?.name ?? "this workspace"}.`}
              >
                <div className="max-w-md space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
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
                        <div
                          key={member.id ?? member.email ?? member.userId ?? `member-${index}`}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              <SensitiveText
                                className="max-w-[220px]"
                                privacyMode={privacyMode}
                                value={member.name ?? member.email ?? "Unknown user"}
                              />
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                          </div>
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
                        </div>
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
                      Type the workspace name exactly. If verification is needed, we will prompt you after you continue.
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
                      || workspaceDeleteConfirm.trim() !== (selectedWorkspace?.name ?? "")
                    }
                    onClick={() => {
                      if (!selectedWorkspace) return;
                      if (!sudoActive) {
                        requestSudoForAction(`delete ${selectedWorkspace.name}`, runDeleteWorkspace);
                        return;
                      }
                      void runDeleteWorkspace();
                    }}
                  >
                    Delete Workspace
                  </Button>
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Data Tab ── */}
          {currentTab === "data" ? (
            <>
              <Section title="Data Retention" description="How workspace data is retained and cleaned up.">
                <div className="max-w-md space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Deleted files and folders are moved to Trash and retained for 30 days before permanent cleanup.
                  </p>
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Keyboard Shortcuts Tab ── */}
          {currentTab === "shortcuts" ? (
            <>
              <Section title="Keyboard Shortcuts" description="Implemented shortcuts available in Avenire.">
                <div className="max-w-xl space-y-2">
                  {KEYBOARD_SHORTCUTS.map((shortcut) => (
                    <div
                      key={shortcut.label}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                    >
                      <span className="text-sm">{shortcut.label}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={`${shortcut.label}-${key}`}
                            className="inline-flex items-center justify-center rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          ) : null}
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          setSudoDialogOpen(open);
          if (!open) {
            pendingSudoActionRef.current = null;
            setSudoCode("");
          }
        }}
        open={sudoDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Sensitive Action</DialogTitle>
            <DialogDescription>
              Enter the 6-digit code sent to{" "}
              <SensitiveText
                className="inline-block align-baseline"
                privacyMode={privacyMode}
                value={session?.user?.email}
              />{" "}
              to {sudoActionLabel}. Approval stays active for 12 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              className="text-center tracking-[0.35em]"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setSudoCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              value={sudoCode}
            />
            {sudoStatus ? <p className="text-xs text-muted-foreground">{sudoStatus}</p> : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              disabled={sudoRequestingCode}
              onClick={() => {
                void requestSudoCode();
              }}
              type="button"
              variant="outline"
            >
              {sudoRequestingCode ? "Sending..." : "Resend Code"}
            </Button>
            <Button
              disabled={sudoCode.trim().length !== 6 || sudoVerifyingCode}
              onClick={() => {
                void verifySudoCodeAndContinue();
              }}
              type="button"
            >
              {sudoVerifyingCode ? "Verifying..." : "Verify and Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function SensitiveText({
  value,
  privacyMode,
  className,
  fallback = "—",
}: {
  value?: string | null;
  privacyMode: boolean;
  className?: string;
  fallback?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!privacyMode) {
      setRevealed(false);
    }
  }, [privacyMode, value]);

  if (!value) {
    return <span className={className}>{fallback}</span>;
  }

  if (!privacyMode || revealed) {
    return <span className={className}>{value}</span>;
  }

  return (
    <button
      className={cn(
        "max-w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left",
        className
      )}
      onClick={() => setRevealed(true)}
      title="Click to reveal"
      type="button"
    >
      <span className="inline-block max-w-full truncate blur-[6px] select-none">
        {value}
      </span>
    </button>
  );
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
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
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
