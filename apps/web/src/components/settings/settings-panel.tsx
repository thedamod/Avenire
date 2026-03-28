"use client";

import { authClient, linkSocial, listAccounts, revokeOtherSessions, unlinkAccount, updateUser, useSession, } from "@avenire/auth/client";
import {
  Avatar, AvatarFallback, AvatarImage, } from "@avenire/ui/components/avatar";
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
import { Spinner } from "@avenire/ui/components/spinner";
import { Switch } from "@avenire/ui/components/switch";
import { Building as Building2, Camera, Check, CreditCard, Database, FileText, Folder, GithubLogo as Github, Globe, HardDrive, Key, Shield, SlidersHorizontal, Warning as TriangleAlert, LinkBreak as Unlink, User, Users } from "@phosphor-icons/react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode, type SVGProps } from "react";
import { SensitiveText } from "@/components/shared/sensitive-text";
import { getFacehashUrl } from "@/lib/avatar";
import {
  DEFAULT_NOTE_TEMPLATE,
  getDefaultNoteTemplates,
  getNoteTemplateStorageKey,
  type NoteTemplate,
} from "@/lib/note-templates";
import { PRIVACY_MODE_STORAGE_KEY } from "@/lib/privacy-mode";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";

const DeferredAvenireEditor = dynamic(
  () => import("@/components/editor"),
  {
    loading: () => (
      <div className="flex min-h-[18rem] items-center justify-center text-muted-foreground text-sm">
        Loading editor...
      </div>
    ),
    ssr: false,
  }
);

type WorkspaceSummary = {
  logo: string | null;
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

type WorkspaceUsage = {
  fileCount: number;
  folderCount: number;
  indexedFileCount: number;
  memberCount: number;
  pendingIngestionCount: number;
  totalSizeBytes: number;
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

type PolarCustomerState = {
  customer?: {
    email?: string | null;
    name?: string | null;
  } | null;
  subscriptions?: Array<{
    id?: string;
    status?: string;
    product?: {
      name?: string | null;
    } | null;
  }>;
  benefits?: Array<{
    id?: string;
    name?: string | null;
  }>;
  meters?: Array<{
    id?: string;
    name?: string | null;
    balance?: number | null;
  }>;
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
  {
    key: "shortcuts",
    label: "Keyboard Shortcuts",
    icon: Key,
    mobileHidden: true,
  },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const KEYBOARD_SHORTCUTS = [
  { label: "Command Palette", keys: ["Ctrl", "Shift", "P"] },
  { label: "Open Manage", keys: ["Ctrl", "K"] },
  { label: "New Method", keys: ["Ctrl", "Shift", "O"] },
  { label: "Toggle Sidebar", keys: ["Ctrl", "B"] },
  { label: "Open Model Picker", keys: ["Ctrl", "/"] },
  { label: "Delete Current Method", keys: ["Ctrl", "Shift", "⌫"] },
];

const PLAN_LABELS: Record<string, string> = {
  access: "Free Plan",
  core: "Core Plan",
  scholar: "Scholar Plan",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
export function SettingsPanel({
  initialWorkspaces,
  initialWorkspaceId,
  tabMode = "url",
  initialTab = "account",
}: {
  initialWorkspaces?: WorkspaceSummary[];
  initialWorkspaceId?: string;
  tabMode?: "url" | "local";
  initialTab?: TabKey;
}) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [localTab, setLocalTab] = useState<TabKey>(initialTab);
  const validTabSet = useMemo(
    () => new Set<TabKey>(tabs.map((tab) => tab.key)),
    []
  );
  const tabFromQuery = searchParams.get("tab");
  const currentTab =
    tabMode === "url" && tabFromQuery && validTabSet.has(tabFromQuery as TabKey)
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
  const [polarCustomerState, setPolarCustomerState] =
    useState<PolarCustomerState | null>(null);
  const [polarCustomerStatus, setPolarCustomerStatus] = useState<string | null>(
    null
  );
  const [preferencesStatus, setPreferencesStatus] = useState<string | null>(
    null
  );
  const [emailReceipts, setEmailReceipts] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [sessionsStatus, setSessionsStatus] = useState<string | null>(null);

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [passkeysStatus, setPasskeysStatus] = useState<string | null>(null);

  // Workspaces
  const [workspaces, setWorkspaces] = useState(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    initialWorkspaceId ?? initialWorkspaces?.[0]?.workspaceId ?? ""
  );
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(
    []
  );
  const [workspaceUsage, setWorkspaceUsage] = useState<WorkspaceUsage | null>(
    null
  );
  const [workspaceUsageStatus, setWorkspaceUsageStatus] = useState<
    string | null
  >(null);
  const [workspaceEmail, setWorkspaceEmail] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [workspaceDeleteConfirm, setWorkspaceDeleteConfirm] = useState("");
  const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([
    DEFAULT_NOTE_TEMPLATE,
  ]);
  const [noteTemplateDialogOpen, setNoteTemplateDialogOpen] = useState(false);
  const [noteTemplateDraft, setNoteTemplateDraft] = useState<NoteTemplate>(
    DEFAULT_NOTE_TEMPLATE
  );
  const [noteTemplateEditorKey, setNoteTemplateEditorKey] = useState(0);
  const noteTemplatesWorkspaceRef = useRef<string | null>(null);
  const noteTemplatesHydratedRef = useRef(false);
  const [workspaceIconDraft, setWorkspaceIconDraft] = useState("");
  const [workspaceIconStatus, setWorkspaceIconStatus] = useState<string | null>(
    null
  );
  const [workspaceIconUploading, setWorkspaceIconUploading] = useState(false);
  const workspaceIconInputRef = useRef<HTMLInputElement | null>(null);
  const [noteTemplateBannerUrl, setNoteTemplateBannerUrl] = useState("");
  const [noteTemplateBannerStatus, setNoteTemplateBannerStatus] = useState<
    string | null
  >(null);
  const [noteTemplateBannerUploading, setNoteTemplateBannerUploading] =
    useState(false);
  const noteTemplateBannerInputRef = useRef<HTMLInputElement | null>(null);
  const noteTemplateEditorScrollRef = useRef<HTMLDivElement | null>(null);
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
  const codeRequestedForSessionRef = useRef(false);
  const accountsLoadedRef = useRef(false);
  const preferencesLoadedRef = useRef(false);
  const billingLoadedRef = useRef(false);
  const securityLoadedRef = useRef(false);
  const workspaceLoadedRef = useRef(false);
  const workspaceUsageLoadedForRef = useRef<string>("");

  useEffect(() => {
    setProfileName(session?.user?.name ?? "");
    setProfileImage(session?.user?.image ?? "");
  }, [session?.user?.image, session?.user?.name]);

  useEffect(() => {
    const src =
      session?.user?.image ??
      getFacehashUrl(session?.user?.name ?? session?.user?.email ?? "");
    setAvatarPreview(src);
  }, [session?.user?.image, session?.user?.name, session?.user?.email]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.workspaceId === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces]
  );

  useEffect(() => {
    setWorkspaceIconDraft(selectedWorkspace?.logo ?? "");
  }, [selectedWorkspace?.logo]);

  useEffect(() => {
    setWorkspaceIconStatus(null);
  }, [selectedWorkspace?.workspaceId]);

  const refreshAccounts = async () => {
    const result = await listAccounts();
    setAccounts(
      ((result as { data?: AccountEntry[] | null }).data ??
        []) as AccountEntry[]
    );
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

  const refreshPolarCustomerState = async () => {
    const customerState = (authClient as any)?.customer?.state as
      | undefined
      | (() => Promise<{ data?: PolarCustomerState | null; error?: unknown }>);

    if (!customerState) {
      setPolarCustomerState(null);
      setPolarCustomerStatus("Polar billing is unavailable.");
      return;
    }

    setPolarCustomerStatus("Loading billing details...");
    try {
      const result = await customerState();
      setPolarCustomerState(result.data ?? null);
      setPolarCustomerStatus(null);
    } catch (error) {
      console.error("[settings] failed to load Polar customer state", error);
      setPolarCustomerState(null);
      setPolarCustomerStatus("Unable to load billing details.");
    }
  };

  const refreshPasskeys = async () => {
    const response = await fetch("/api/auth/passkey/list-user-passkeys", {
      cache: "no-store",
    });
    if (!response.ok) {
      setPasskeys([]);
      return;
    }
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
    const response = await fetch(
      `/api/workspaces/${workspaceId}/share/members`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      setWorkspaceMembers([]);
      return;
    }
    const payload = (await response.json()) as { members?: WorkspaceMember[] };
    setWorkspaceMembers(payload.members ?? []);
  };

  const refreshWorkspaceUsage = async (
    workspaceId: string,
    showLoading = false
  ) => {
    if (showLoading) {
      setWorkspaceUsageStatus("Loading workspace stats...");
    }

    const response = await fetch(`/api/workspaces/${workspaceId}/usage`, {
      cache: "no-store",
    });

    if (!response.ok) {
      setWorkspaceUsage(null);
      setWorkspaceUsageStatus("Unable to load workspace stats.");
      return;
    }

    const payload = (await response.json()) as { usage?: WorkspaceUsage };
    setWorkspaceUsage(payload.usage ?? null);
    if (showLoading) {
      setWorkspaceUsageStatus(null);
    }
  };

  const refreshWorkspaces = async () => {
    const response = await fetch("/api/workspaces/list", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      workspaces?: WorkspaceSummary[];
    };
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
    setProfileStatus(
      result.error ? "Unable to update profile." : "Profile updated."
    );
    return !result.error;
  };

  const handleAvatarFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
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

  const saveWorkspaceIcon = async (nextLogo?: string | null) => {
    if (!selectedWorkspace) {
      return false;
    }

    setWorkspaceIconStatus("Saving workspace icon...");
    const response = await fetch(
      `/api/workspaces/${selectedWorkspace.workspaceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logo: nextLogo ?? (workspaceIconDraft.trim() || null),
        }),
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setWorkspaceIconStatus(
        payload.error ?? "Unable to update workspace icon."
      );
      return false;
    }

    setWorkspaceIconStatus("Workspace icon updated.");
    await refreshWorkspaces();
    return true;
  };

  const handleWorkspaceIconFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !selectedWorkspace) {
      return;
    }

    setWorkspaceIconUploading(true);
    setWorkspaceIconStatus("Uploading workspace icon...");

    try {
      const uploaded = ((await startAvatarUpload([file])) ?? [])[0] as
        | { ufsUrl?: string | null; url?: string | null }
        | undefined;
      const uploadedUrl = uploaded?.ufsUrl ?? uploaded?.url ?? null;

      if (!uploadedUrl) {
        setWorkspaceIconStatus("Unable to upload workspace icon.");
        return;
      }

      setWorkspaceIconDraft(uploadedUrl);
      await saveWorkspaceIcon(uploadedUrl);
    } finally {
      setWorkspaceIconUploading(false);
    }
  };

  const handleNoteTemplateBannerFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setNoteTemplateBannerUploading(true);
    setNoteTemplateBannerStatus("Uploading banner...");

    try {
      const uploaded = ((await startAvatarUpload([file])) ?? [])[0] as
        | { ufsUrl?: string | null; url?: string | null }
        | undefined;
      const uploadedUrl = uploaded?.ufsUrl ?? uploaded?.url ?? null;

      if (!uploadedUrl) {
        setNoteTemplateBannerStatus("Unable to upload banner.");
        return;
      }

      setNoteTemplateBannerUrl(uploadedUrl);
      setNoteTemplateBannerStatus("Banner uploaded.");
    } finally {
      setNoteTemplateBannerUploading(false);
    }
  };

  const requestSudoForAction = (
    actionLabel: string,
    action: () => Promise<void>
  ) => {
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
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setSudoStatus(
        response.ok
          ? "Verification code sent to your email."
          : (payload.error ?? "Unable to send code.")
      );
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
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setSudoActive(false);
        setSudoStatus(payload.error ?? "Invalid or expired code.");
        return;
      }

      setSudoActive(true);
      setSudoCode("");
      setSudoStatus("Sudo mode is active for 12 hours.");

      const pendingAction = pendingSudoActionRef.current;
      pendingSudoActionRef.current = null;
      codeRequestedForSessionRef.current = false;
      setSudoDialogOpen(false);

      if (pendingAction) {
        await pendingAction();
      }
    } finally {
      setSudoVerifyingCode(false);
    }
  };

  useEffect(() => {
    if (currentTab !== "account" || accountsLoadedRef.current) {
      return;
    }
    accountsLoadedRef.current = true;
    refreshAccounts().catch(() => undefined);
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== "preferences" || preferencesLoadedRef.current) {
      return;
    }
    preferencesLoadedRef.current = true;
    refreshUserSettings().catch(() => undefined);
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== "billing" || billingLoadedRef.current) {
      return;
    }
    billingLoadedRef.current = true;
    refreshBillingUsage(true).catch(() => undefined);
    refreshPolarCustomerState().catch(() => undefined);
    refreshUserSettings().catch(() => undefined);
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== "billing" || !billingLoadedRef.current) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshBillingUsage(false).catch(() => undefined);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== "security" || securityLoadedRef.current) {
      return;
    }
    securityLoadedRef.current = true;
    refreshPasskeys().catch(() => undefined);
    refreshSudoStatus().catch(() => undefined);
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== "workspace") {
      return;
    }

    if (!workspaceLoadedRef.current) {
      workspaceLoadedRef.current = true;
      if (workspaces.length === 0) {
        refreshWorkspaces().catch(() => undefined);
      }
      refreshSudoStatus().catch(() => undefined);
    }

    if (
      activeWorkspaceId &&
      workspaceUsageLoadedForRef.current !== activeWorkspaceId
    ) {
      workspaceUsageLoadedForRef.current = activeWorkspaceId;
      refreshMembers(activeWorkspaceId).catch(() => undefined);
      refreshWorkspaceUsage(activeWorkspaceId, true).catch(() => undefined);
      refreshSudoStatus().catch(() => undefined);
    }
  }, [activeWorkspaceId, currentTab, workspaces.length]);

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
    const workspaceId = activeWorkspaceId.trim();
    noteTemplatesWorkspaceRef.current = workspaceId || null;
    noteTemplatesHydratedRef.current = false;

    if (!workspaceId) {
      setNoteTemplates(getDefaultNoteTemplates());
      noteTemplatesHydratedRef.current = true;
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        getNoteTemplateStorageKey(workspaceId)
      );
      if (!raw) {
        setNoteTemplates(getDefaultNoteTemplates());
        noteTemplatesHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setNoteTemplates(getDefaultNoteTemplates());
        return;
      }

      const templates = parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const candidate = entry as Partial<NoteTemplate>;
          const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
          const name =
            typeof candidate.name === "string" ? candidate.name.trim() : "";
          const content =
            typeof candidate.content === "string"
              ? candidate.content
              : DEFAULT_NOTE_TEMPLATE.content;
          const bannerUrl =
            typeof candidate.bannerUrl === "string" &&
            candidate.bannerUrl.trim().length > 0
              ? candidate.bannerUrl.trim()
              : null;
          if (!(id && name)) {
            return null;
          }

          return { id, name, content, bannerUrl } satisfies NoteTemplate;
        })
        .filter((entry): entry is NoteTemplate => Boolean(entry));

      setNoteTemplates(
        templates.length > 0 ? templates : getDefaultNoteTemplates()
      );
      noteTemplatesHydratedRef.current = true;
    } catch {
      setNoteTemplates(getDefaultNoteTemplates());
      noteTemplatesHydratedRef.current = true;
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    const workspaceId = noteTemplatesWorkspaceRef.current;
    if (!workspaceId || !noteTemplatesHydratedRef.current) {
      return;
    }

    try {
      window.localStorage.setItem(
        getNoteTemplateStorageKey(workspaceId),
        JSON.stringify(noteTemplates)
      );
    } catch {
      return;
    }
  }, [noteTemplates]);

  useEffect(() => {
    if (sudoDialogOpen && !sudoActive && !codeRequestedForSessionRef.current) {
      codeRequestedForSessionRef.current = true;
      void requestSudoCode();
    }
  }, [sudoActive, sudoDialogOpen]);

  const openNoteTemplateEditor = (template?: NoteTemplate | null) => {
    setNoteTemplateDraft(
      template ?? {
        ...DEFAULT_NOTE_TEMPLATE,
        id: "",
      }
    );
    setNoteTemplateBannerUrl(template?.bannerUrl ?? "");
    setNoteTemplateBannerStatus(null);
    setNoteTemplateEditorKey((current) => current + 1);
    setNoteTemplateDialogOpen(true);
  };

  const saveNoteTemplateDraft = () => {
    const trimmedName = noteTemplateDraft.name.trim();
    const trimmedContent = noteTemplateDraft.content.trim();
    if (!(trimmedName && trimmedContent)) {
      return;
    }

    const id =
      noteTemplateDraft.id.trim() ||
      globalThis.crypto?.randomUUID?.() ||
      `template-${Date.now()}`;
    const nextTemplate: NoteTemplate = {
      id,
      name: trimmedName,
      content: noteTemplateDraft.content,
      bannerUrl: noteTemplateBannerUrl.trim() || null,
    };

    setNoteTemplates((current) => {
      const existingIndex = current.findIndex((item) => item.id === id);
      if (existingIndex < 0) {
        return [...current, nextTemplate];
      }
      return current.map((item) => (item.id === id ? nextTemplate : item));
    });
    setNoteTemplateDialogOpen(false);
  };

  const deleteNoteTemplateDraft = () => {
    const id = noteTemplateDraft.id.trim();
    if (!id) {
      setNoteTemplateDialogOpen(false);
      return;
    }

    setNoteTemplates((current) => {
      const next = current.filter((template) => template.id !== id);
      return next.length > 0 ? next : getDefaultNoteTemplates();
    });
    setNoteTemplateDialogOpen(false);
  };

  const setTab = (tab: TabKey) => {
    if (tabMode === "local") {
      setLocalTab(tab);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/settings?${params.toString()}` as Route);
  };

  const planLabel = billingUsage
    ? (PLAN_LABELS[billingUsage.plan] ?? "Free Plan")
    : "Free Plan";
  const mobileTabs = tabs.filter(
    (tab) => !("mobileHidden" in tab && tab.mobileHidden)
  );
  const hasPaidPlan =
    billingUsage?.plan === "core" || billingUsage?.plan === "scholar";
  const currentUserEmail = session?.user?.email?.toLowerCase() ?? null;
  const selectedWorkspaceInitial = (
    selectedWorkspace?.name?.trim().charAt(0) || "A"
  ).toUpperCase();
  const selectedWorkspaceMemberCount =
    workspaceUsage?.memberCount ?? workspaceMembers.length;

  const displayAvatar =
    avatarPreview ||
    profileImage ||
    getFacehashUrl(profileName || session?.user?.email || "");
  const fallbackInitials = (profileName || session?.user?.name || "U")
    .slice(0, 2)
    .toUpperCase();

  const handleManageBilling = async () => {
    if (!hasPaidPlan) {
      router.push("/pricing" as Route);
      return;
    }

    setBillingStatus("Opening billing portal...");
    const portal = (authClient as any)?.customer?.portal as
      | undefined
      | (() => Promise<unknown>);

    if (portal) {
      try {
        await portal();
        return;
      } catch (error) {
        console.error("[settings] failed to open Polar portal", error);
      }
    }

    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath: "/settings?tab=billing" }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      url?: string;
    };

    if (!(response.ok && payload.url)) {
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
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
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
    const response = await fetch(
      `/api/workspaces/${selectedWorkspace.workspaceId}`,
      {
        method: "DELETE",
      }
    );

    if (response.status === 403) {
      setSudoActive(false);
      setWorkspaceStatus("Verification required.");
      requestSudoForAction(
        `delete ${selectedWorkspace.name}`,
        runDeleteWorkspace
      );
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setWorkspaceStatus(payload.error ?? "Unable to delete workspace.");
      return;
    }

    const payload = (await response.json()) as {
      workspaces?: WorkspaceSummary[];
    };
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
      <aside className="hidden w-72 shrink-0 flex-col border-border/60 border-r bg-sidebar p-4 md:flex">
        <div className="mb-4">
          <h2 className="font-semibold text-xl">Settings</h2>
        </div>

        <div className="space-y-2">
          <p className="px-2 text-muted-foreground text-xs">Account</p>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "account"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("account")}
            variant="ghost"
          >
            <User className="h-4 w-4" />
            Account
          </Button>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "preferences"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("preferences")}
            variant="ghost"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Preferences
          </Button>
        </div>

        <div className="mt-5 space-y-2">
          <p className="px-2 text-muted-foreground text-xs">Workspace</p>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "workspace"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("workspace")}
            variant="ghost"
          >
            <Building2 className="h-4 w-4" />
            Workspace
          </Button>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "data"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("data")}
            variant="ghost"
          >
            <Database className="h-4 w-4" />
            Data
          </Button>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "billing"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("billing")}
            variant="ghost"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Button>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "security"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("security")}
            variant="ghost"
          >
            <Shield className="h-4 w-4" />
            Security
          </Button>
          <Button
            className={[
              "h-auto w-full justify-start gap-2 px-2 py-2 text-left text-sm transition-colors",
              currentTab === "shortcuts"
                ? "bg-muted font-medium hover:bg-muted"
                : "hover:bg-muted/70",
            ].join(" ")}
            onClick={() => setTab("shortcuts")}
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
        <div className="flex items-center gap-3 border-border/60 border-b px-4 py-3 md:hidden">
          <Avatar className="h-9 w-9">
            <AvatarImage alt={profileName} src={displayAvatar} />
            <AvatarFallback>{fallbackInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">
              <SensitiveText
                className="max-w-full"
                privacyMode={privacyMode}
                value={session?.user?.name || "User"}
              />
            </p>
            <p className="truncate text-muted-foreground text-xs">
              <SensitiveText
                className="max-w-full"
                privacyMode={privacyMode}
                value={session?.user?.email}
              />
            </p>
          </div>
          <Badge className="ml-auto shrink-0 text-xs" variant="secondary">
            {planLabel}
          </Badge>
        </div>

        {/* Tab nav */}
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto border-border/60 border-b px-4 py-3 md:hidden">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                className={[
                  "h-9 shrink-0 gap-1.5 rounded-full px-3 font-medium text-xs transition-colors",
                  currentTab === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
                key={tab.key}
                onClick={() => setTab(tab.key)}
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
              <Section
                description="Update your display name and avatar."
                title="Profile"
              >
                <div className="max-w-md space-y-3">
                  <div className="space-y-1">
                    <label className="font-medium text-muted-foreground text-xs">
                      Display Name
                    </label>
                    <Input
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      value={profileName}
                    />
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarImage alt={profileName} src={displayAvatar} />
                        <AvatarFallback>{fallbackInitials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Profile photo</p>
                        <p className="text-muted-foreground text-xs">
                          Upload an image and we will save the CDN URL to your
                          account automatically.
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
                    disabled={isSavingProfile || isUploadingAvatar}
                    onClick={() => {
                      void saveProfile();
                    }}
                    size="sm"
                    type="button"
                  >
                    Save Changes
                  </Button>
                  {profileStatus ? (
                    <p className="text-muted-foreground text-xs">
                      {profileStatus}
                    </p>
                  ) : null}
                </div>
              </Section>

              <Divider />

              <Section
                description="Link your Google or GitHub account for social sign-in."
                title="Connected Providers"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        void linkSocial({ provider: "google" });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      Connect Google
                    </Button>
                    <Button
                      onClick={() => {
                        void linkSocial({ provider: "github" });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Github className="mr-2 h-4 w-4" />
                      Connect GitHub
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {accounts.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        No linked accounts yet.
                      </p>
                    ) : (
                      accounts.map((account) => (
                        <div
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                          key={
                            account.id ??
                            `${account.providerId}-${account.accountId}`
                          }
                        >
                          <div className="flex items-center gap-2">
                            <Badge className="text-xs" variant="outline">
                              {account.providerId ?? "email"}
                            </Badge>
                            <SensitiveText
                              className="max-w-[180px] text-muted-foreground text-xs"
                              privacyMode={privacyMode}
                              value={account.accountId ?? account.id}
                            />
                          </div>
                          <Button
                            onClick={() => {
                              const providerId = account.providerId;
                              if (!providerId) {
                                return;
                              }
                              void (async () => {
                                const result = await unlinkAccount({
                                  accountId: account.accountId ?? "",
                                  providerId,
                                });
                                setAccountsStatus(
                                  result.error
                                    ? "Unable to unlink account."
                                    : "Account unlinked."
                                );
                                await refreshAccounts();
                              })();
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {accountsStatus ? (
                    <p className="text-muted-foreground text-xs">
                      {accountsStatus}
                    </p>
                  ) : null}
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Billing Tab ── */}
          {currentTab === "billing" ? (
            <>
              <Section description="" title="Choose Your Plan">
                <div className="grid gap-4 sm:grid-cols-3">
                  <PlanCard
                    current={!billingUsage || billingUsage.plan === "access"}
                    features={[
                      "Small monthly limits for basic usage",
                      "Basic models only",
                    ]}
                    name="Free"
                    onUpgrade={null}
                    price="$0/month"
                  />
                  <PlanCard
                    current={billingUsage?.plan === "core"}
                    features={[
                      "Expanded monthly limits for more flexibility",
                      "Access to all models",
                      "File uploads and web search",
                    ]}
                    name="Core"
                    onUpgrade={() => router.push("/pricing" as Route)}
                    popular
                    price="$8/month"
                  />
                  <PlanCard
                    current={billingUsage?.plan === "scholar"}
                    features={[
                      "Over 10× Core limits for power users",
                      "Includes everything in Core",
                      "Priority support",
                    ]}
                    name="Scholar"
                    onUpgrade={() => router.push("/pricing" as Route)}
                    price="$50/month"
                  />
                </div>
                {billingStatus ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground text-xs">
                    {billingStatus.startsWith("Loading") ? (
                      <Spinner className="size-3.5" />
                    ) : null}
                    {billingStatus}
                  </p>
                ) : null}
              </Section>

              <Divider />

              <Section description="" title="Billing Preferences">
                <div className="space-y-1">
                  <ToggleRow
                    checked={emailReceipts}
                    description="Send receipts to your account email when a payment succeeds."
                    label="Email me receipts"
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
                  <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground text-xs">
                    {preferencesStatus.startsWith("Loading") ? (
                      <Spinner className="size-3.5" />
                    ) : null}
                    {preferencesStatus}
                  </p>
                ) : null}
                </div>
              </Section>

              <Divider />

              <Section description="" title="Manage Subscription">
                <Button
                  onClick={() => {
                    void handleManageBilling();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {hasPaidPlan ? "Manage Billing & Invoices" : "View Plans"}
                </Button>
                {billingStatus ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground text-xs">
                    {billingStatus.startsWith("Loading") ? (
                      <Spinner className="size-3.5" />
                    ) : null}
                    {billingStatus}
                  </p>
                ) : null}
              </Section>

              <Divider />

              <Section
                description="Better Auth now exposes your Polar customer directly from the session."
                title="Polar Account"
              >
                <div className="max-w-3xl space-y-3 rounded-2xl border border-border/60 bg-card p-4">
                  {polarCustomerState ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                          <p className="text-muted-foreground text-xs">
                            Subscriptions
                          </p>
                          <p className="mt-1 font-semibold text-lg">
                            {polarCustomerState.subscriptions?.length ?? 0}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                          <p className="text-muted-foreground text-xs">
                            Benefits
                          </p>
                          <p className="mt-1 font-semibold text-lg">
                            {polarCustomerState.benefits?.length ?? 0}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                          <p className="text-muted-foreground text-xs">
                            Meters
                          </p>
                          <p className="mt-1 font-semibold text-lg">
                            {polarCustomerState.meters?.length ?? 0}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p className="text-muted-foreground">
                          {polarCustomerState.customer?.email ??
                            session?.user?.email ??
                            "Your Polar customer"}
                        </p>
                        <div className="space-y-2">
                          {polarCustomerState.subscriptions?.length ? (
                            polarCustomerState.subscriptions.map(
                              (subscription) => (
                                <div
                                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                                  key={
                                    subscription.id ??
                                    `${subscription.status}-${subscription.product?.name}`
                                  }
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">
                                      {subscription.product?.name ??
                                        "Subscription"}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {subscription.status ?? "unknown status"}
                                    </p>
                                  </div>
                                </div>
                              )
                            )
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              No active Polar subscriptions yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : polarCustomerStatus ? (
                    <p className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                      {polarCustomerStatus.startsWith("Loading") ? (
                        <Spinner className="size-4" />
                      ) : null}
                      {polarCustomerStatus}
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                      <Spinner className="size-4" />
                      Loading billing details...
                    </p>
                  )}
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Security Tab ── */}
          {currentTab === "security" ? (
            <>
              <Section
                description="Protected actions will prompt for a 6-digit verification code and stay approved for 12 hours."
                title="Sensitive Actions"
              >
                <div className="max-w-md space-y-3 rounded-lg border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">Sudo verification</p>
                      <p className="text-muted-foreground text-xs">
                        {sudoActive
                          ? "Verified for this browser session."
                          : "You will only be prompted when you start a protected action."}
                      </p>
                    </div>
                    <Badge variant={sudoActive ? "default" : "secondary"}>
                      {sudoActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {sudoActive
                      ? "Your current sudo session is valid for up to 12 hours."
                      : "Deleting your account or a workspace will open a verification dialog automatically."}
                  </p>
                  <Button
                    disabled={sudoActive}
                    onClick={() => {
                      requestSudoForAction(
                        "verify this session",
                        async () => {}
                      );
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {sudoActive ? "Verification Active" : "Verify Now"}
                  </Button>
                  {sudoStatus ? (
                    <p className="text-muted-foreground text-xs">
                      {sudoStatus}
                    </p>
                  ) : null}
                </div>
              </Section>

              <Divider />

              <Section
                description="Add or remove passkeys for passwordless sign-in."
                title="Passkeys"
              >
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      void (async () => {
                        setPasskeysStatus("Adding passkey...");
                        const addPasskey = (authClient as any)?.passkey
                          ?.addPasskey as
                          | ((opts?: {
                              name?: string;
                            }) => Promise<{ error: unknown }>)
                          | undefined;
                        if (!addPasskey) {
                          setPasskeysStatus("Passkey client is unavailable.");
                          return;
                        }
                        const result = await addPasskey({
                          name: "Avenire Passkey",
                        });
                        setPasskeysStatus(
                          result?.error
                            ? "Unable to add passkey."
                            : "Passkey added."
                        );
                        await refreshPasskeys();
                      })();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Key className="mr-2 h-4 w-4" />
                    Add Passkey
                  </Button>
                  <div className="space-y-2">
                    {passkeys.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        No passkeys registered.
                      </p>
                    ) : (
                      passkeys.map((passkey) => (
                        <div
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                          key={passkey.id}
                        >
                          <div>
                            <p className="font-medium text-sm">
                              {passkey.name ?? "Passkey"}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {passkey.deviceType ?? "Unknown device"}
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              void (async () => {
                                const response = await fetch(
                                  "/api/auth/passkey/delete-passkey",
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ id: passkey.id }),
                                  }
                                );
                                setPasskeysStatus(
                                  response.ok
                                    ? "Passkey removed."
                                    : "Unable to remove passkey."
                                );
                                await refreshPasskeys();
                              })();
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Remove
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  {passkeysStatus ? (
                    <p className="text-muted-foreground text-xs">
                      {passkeysStatus}
                    </p>
                  ) : null}
                </div>
              </Section>

              <Divider />

              <Section
                description="Manage and sign out from other devices that are currently logged in to your account."
                title="Active Sessions"
              >
                <Button
                  onClick={() => {
                    void (async () => {
                      setSessionsStatus("Signing out other devices...");
                      const result = await revokeOtherSessions();
                      setSessionsStatus(
                        result.error
                          ? "Unable to sign out other devices."
                          : "Signed out from other devices."
                      );
                    })();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Sign Out Other Devices
                </Button>
                {sessionsStatus ? (
                  <p className="text-muted-foreground text-xs">
                    {sessionsStatus}
                  </p>
                ) : null}
              </Section>

              <Divider />

              <Section
                description="Permanently delete your account. This action cannot be undone."
                title="Danger Zone"
              >
                <div className="max-w-md space-y-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
                  <div className="flex items-start gap-2 text-red-600">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      Type{" "}
                      <span className="font-semibold">DELETE MY ACCOUNT</span>.
                      If needed, we will prompt for verification after you click
                      delete.
                    </p>
                  </div>
                  <Input
                    onChange={(e) => setAccountDeleteConfirm(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    value={accountDeleteConfirm}
                  />
                  <Button
                    className="bg-red-600 text-white hover:bg-red-700"
                    disabled={
                      accountDeleteConfirm.trim() !== "DELETE MY ACCOUNT"
                    }
                    onClick={() => {
                      if (!sudoActive) {
                        requestSudoForAction(
                          "delete your account",
                          runDeleteAccount
                        );
                        return;
                      }
                      void runDeleteAccount();
                    }}
                    size="sm"
                    type="button"
                  >
                    Delete Account
                  </Button>
                </div>
                {dangerStatus ? (
                  <p className="text-muted-foreground text-xs">
                    {dangerStatus}
                  </p>
                ) : null}
              </Section>
            </>
          ) : null}

          {/* ── Preferences Tab ── */}
          {currentTab === "preferences" ? (
            <>
              <Section
                description="Control your account defaults and behavior."
                title="Preferences"
              >
                <div className="space-y-1">
                  <ToggleRow
                    checked={emailReceipts}
                    description="Send receipts to your account email when a payment succeeds."
                    label="Email me receipts"
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
                    <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground text-xs">
                      {preferencesStatus.startsWith("Loading") ? (
                        <Spinner className="size-3.5" />
                      ) : null}
                      {preferencesStatus}
                    </p>
                  ) : null}
                </div>
              </Section>

              <Divider />

              <Section
                description="Select a light or dark theme for your workspace."
                title="Appearance"
              >
                <div className="grid max-w-md grid-cols-3 gap-3">
                  <button
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors hover:bg-muted/50",
                      theme === "light"
                        ? "border-primary bg-primary/5"
                        : "border-border/60"
                    )}
                    onClick={() => setTheme("light")}
                    type="button"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f4f6]">
                      <div className="h-5 w-5 rounded-full bg-white shadow-sm" />
                    </div>
                    <span className="font-medium">Light</span>
                  </button>
                  <button
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors hover:bg-muted/50",
                      theme === "dark"
                        ? "border-primary bg-primary/5"
                        : "border-border/60"
                    )}
                    onClick={() => setTheme("dark")}
                    type="button"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f2937]">
                      <div className="h-5 w-5 rounded-full bg-slate-900 shadow-sm" />
                    </div>
                    <span className="font-medium">Dark</span>
                  </button>
                  <button
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors hover:bg-muted/50",
                      theme === "system"
                        ? "border-primary bg-primary/5"
                        : "border-border/60"
                    )}
                    onClick={() => setTheme("system")}
                    type="button"
                  >
                    <div className="flex h-10 w-10 overflow-hidden rounded-full bg-[#f3f4f6]">
                      <div className="h-full w-1/2 bg-[#f3f4f6]" />
                      <div className="h-full w-1/2 bg-[#1f2937]" />
                    </div>
                    <span className="font-medium">System</span>
                  </button>
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Workspace Tab ── */}
          {currentTab === "workspace" ? (
            <>
              <Section
                description="Workspace identity, storage, and member access in one place."
                title="Current workspace"
              >
                <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <Avatar className="size-14 shrink-0 rounded-2xl">
                        <AvatarImage
                          alt={selectedWorkspace?.name ?? "Workspace icon"}
                          src={workspaceIconDraft || selectedWorkspace?.logo || ""}
                        />
                        <AvatarFallback className="rounded-2xl bg-muted font-semibold text-foreground text-lg">
                          {selectedWorkspaceInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.22em]">
                          Name &amp; Icon
                        </p>
                        <h3 className="truncate font-semibold text-2xl leading-none">
                          {selectedWorkspace?.name ?? "Workspace"}
                        </h3>
                        <p className="mt-2 truncate text-muted-foreground text-sm">
                          {selectedWorkspace
                            ? "Upload or replace the workspace icon."
                            : "Select a workspace to inspect its storage and members."}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-3">
                      <input
                        accept="image/*"
                        className="hidden"
                        onChange={handleWorkspaceIconFileChange}
                        ref={workspaceIconInputRef}
                        type="file"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          disabled={
                            !selectedWorkspace || workspaceIconUploading
                          }
                          onClick={() => workspaceIconInputRef.current?.click()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          {workspaceIconUploading
                            ? "Uploading..."
                            : "Upload Icon"}
                        </Button>
                        <Button
                          disabled={
                            !selectedWorkspace || workspaceIconUploading
                          }
                          onClick={() => {
                            setWorkspaceIconDraft("");
                            void saveWorkspaceIcon(null);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove Icon
                        </Button>
                      </div>
                      {workspaceIconStatus ? (
                        <p className="text-muted-foreground text-xs">
                          {workspaceIconStatus}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">Workspace stats</p>
                      <p className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                        {workspaceUsageStatus?.startsWith("Loading") ? (
                          <Spinner className="size-3.5" />
                        ) : null}
                        {workspaceUsageStatus ?? "Live workspace totals"}
                      </p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <UsageStatCard
                        description="Total bytes stored across workspace files."
                        icon={HardDrive}
                        label="Storage Used"
                        value={
                          workspaceUsage
                            ? formatBytes(workspaceUsage.totalSizeBytes)
                            : (
                              <span className="inline-flex items-center gap-1.5">
                                <Spinner className="size-4" />
                                Loading...
                              </span>
                            )
                        }
                      />
                      <UsageStatCard
                        description="Manage records available in this workspace."
                        icon={FileText}
                        label="Manage"
                        value={
                          workspaceUsage
                            ? workspaceUsage.fileCount.toLocaleString()
                            : (
                              <span className="inline-flex items-center gap-1.5">
                                <Spinner className="size-4" />
                                Loading...
                              </span>
                            )
                        }
                      />
                      <UsageStatCard
                        description="Nested folders in the workspace tree."
                        icon={Folder}
                        label="Folders"
                        value={
                          workspaceUsage
                            ? workspaceUsage.folderCount.toLocaleString()
                            : (
                              <span className="inline-flex items-center gap-1.5">
                                <Spinner className="size-4" />
                                Loading...
                              </span>
                            )
                        }
                      />
                      <UsageStatCard
                        description={
                          workspaceUsage
                            ? `${workspaceUsage.pendingIngestionCount.toLocaleString()} pending ingestion`
                            : "Waiting for ingestion status."
                        }
                        icon={Users}
                        label="Indexed"
                        value={
                          workspaceUsage
                            ? workspaceUsage.indexedFileCount.toLocaleString()
                            : (
                              <span className="inline-flex items-center gap-1.5">
                                <Spinner className="size-4" />
                                Loading...
                              </span>
                            )
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">Note templates</p>
                        <p className="text-muted-foreground text-xs">
                          Templates are stored per workspace and can use note
                          variables when you create a new note.
                        </p>
                      </div>
                      <Button
                        onClick={() => openNoteTemplateEditor(null)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        New template
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {noteTemplates.map((template) => (
                        <div
                          className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
                          key={template.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sm">
                                {template.name}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {template.bannerUrl
                                  ? "Template banner enabled"
                                  : "Markdown template"}
                              </p>
                            </div>
                            <Badge variant="secondary">Template</Badge>
                          </div>
                          {template.bannerUrl ? (
                            <div
                              className="mt-3 h-24 overflow-hidden rounded-xl border border-border/60 bg-muted/30"
                              style={{
                                backgroundImage: `url(${template.bannerUrl})`,
                                backgroundPosition: "center",
                                backgroundSize: "cover",
                              }}
                            />
                          ) : null}
                          <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-muted-foreground text-xs">
                            {template.content}
                          </p>
                          <div className="mt-4 flex items-center gap-2">
                            <Button
                              onClick={() => openNoteTemplateEditor(template)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Edit
                            </Button>
                            {template.id !== DEFAULT_NOTE_TEMPLATE.id ? (
                              <Button
                                onClick={() => {
                                  setNoteTemplates((current) => {
                                    const next = current.filter(
                                      (item) => item.id !== template.id
                                    );
                                    return next.length > 0
                                      ? next
                                      : getDefaultNoteTemplates();
                                  });
                                }}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-sm">Members</p>
                      <Badge
                        className="rounded-full px-3 py-1 text-xs"
                        variant="outline"
                      >
                        {selectedWorkspace
                          ? `${selectedWorkspaceMemberCount} total`
                          : "0 members"}
                      </Badge>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
                      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(110px,0.8fr)_minmax(0,1.6fr)_minmax(90px,0.8fr)_auto] bg-muted/50 px-4 py-3 font-medium text-muted-foreground text-xs">
                        <span>User</span>
                        <span>Role</span>
                        <span>Email</span>
                        <span>Date added</span>
                        <span className="text-right">Action</span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {workspaceMembers.length === 0 ? (
                          <div className="px-4 py-6 text-muted-foreground text-sm">
                            No members found.
                          </div>
                        ) : (
                          workspaceMembers.map((member, index) => {
                            const memberKey =
                              member.id ??
                              member.email ??
                              member.userId ??
                              `member-${index}`;
                            const isCurrentUser =
                              Boolean(currentUserEmail) &&
                              member.email?.toLowerCase() === currentUserEmail;
                            const isOwner =
                              member.role.toLowerCase() === "owner";

                            return (
                              <div
                                className="grid grid-cols-[minmax(0,1.5fr)_minmax(110px,0.8fr)_minmax(0,1.6fr)_minmax(90px,0.8fr)_auto] items-center gap-3 px-4 py-3 text-sm"
                                key={memberKey}
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    <SensitiveText
                                      className="max-w-[220px]"
                                      privacyMode={privacyMode}
                                      value={
                                        member.name ??
                                        member.email ??
                                        "Unknown user"
                                      }
                                    />
                                  </p>
                                </div>
                                <span className="text-muted-foreground capitalize">
                                  {member.role}
                                </span>
                                <p className="truncate text-muted-foreground">
                                  <SensitiveText
                                    className="max-w-[260px]"
                                    privacyMode={privacyMode}
                                    value={member.email ?? "—"}
                                  />
                                </p>
                                <span className="text-muted-foreground">—</span>
                                <div className="flex justify-end">
                                  {isOwner || isCurrentUser ? (
                                    <Badge
                                      className="rounded-full px-3 py-1 text-xs"
                                      variant="outline"
                                    >
                                      You
                                    </Badge>
                                  ) : (
                                    <Button
                                      onClick={() => {
                                        if (
                                          !(
                                            selectedWorkspace &&
                                            (member.id ?? member.email)
                                          )
                                        ) {
                                          return;
                                        }
                                        void (async () => {
                                          const response = await fetch(
                                            `/api/workspaces/${selectedWorkspace.workspaceId}/share/members`,
                                            {
                                              method: "DELETE",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              body: JSON.stringify({
                                                memberIdOrEmail:
                                                  member.id ?? member.email,
                                              }),
                                            }
                                          );
                                          setWorkspaceStatus(
                                            response.ok
                                              ? "Member removed."
                                              : "Unable to remove member."
                                          );
                                          if (response.ok) {
                                            await refreshMembers(
                                              selectedWorkspace.workspaceId
                                            );
                                            await refreshWorkspaceUsage(
                                              selectedWorkspace.workspaceId
                                            );
                                          }
                                        })();
                                      }}
                                      size="xs"
                                      type="button"
                                      variant="ghost"
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Input
                        onChange={(e) => setWorkspaceEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        value={workspaceEmail}
                      />
                      <Button
                        disabled={
                          isInvitingMember ||
                          !selectedWorkspace ||
                          !workspaceEmail.trim()
                        }
                        onClick={() => {
                          if (!selectedWorkspace) {
                            return;
                          }
                          void (async () => {
                            setIsInvitingMember(true);
                            try {
                              const response = await fetch(
                                `/api/workspaces/${selectedWorkspace.workspaceId}/share/members`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    email: workspaceEmail.trim(),
                                  }),
                                }
                              );
                              setWorkspaceStatus(
                                response.ok
                                  ? "Member added."
                                  : "Unable to add member."
                              );
                              if (response.ok) {
                                setWorkspaceEmail("");
                                await refreshMembers(
                                  selectedWorkspace.workspaceId
                                );
                                await refreshWorkspaceUsage(
                                  selectedWorkspace.workspaceId
                                );
                              }
                            } finally {
                              setIsInvitingMember(false);
                            }
                          })();
                        }}
                        size="sm"
                        type="button"
                      >
                        Add member
                      </Button>
                    </div>

                    {workspaceStatus ? (
                      <p className="mt-2 text-muted-foreground text-xs">
                        {workspaceStatus}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Section>

              <Divider />

              <Section
                description="Create and switch between workspaces."
                title="Workspaces"
              >
                <div className="max-w-2xl space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="New workspace name"
                      value={workspaceName}
                    />
                    <Button
                      disabled={isCreatingWorkspace || !workspaceName.trim()}
                      onClick={() => {
                        void (async () => {
                          setIsCreatingWorkspace(true);
                          try {
                            const response = await fetch("/api/workspaces", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: workspaceName.trim(),
                              }),
                            });
                            if (!response.ok) {
                              setWorkspaceStatus("Unable to create workspace.");
                              return;
                            }
                            setWorkspaceStatus("Workspace created.");
                            setWorkspaceName("");
                            await refreshWorkspaces();
                          } finally {
                            setIsCreatingWorkspace(false);
                          }
                        })();
                      }}
                      size="sm"
                      type="button"
                    >
                      Create
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {workspaces.map((workspace) => (
                      <Button
                        className={[
                          "h-auto w-full justify-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:bg-muted",
                          workspace.workspaceId === activeWorkspaceId
                            ? "border-primary bg-accent/40"
                            : "border-border/60 bg-card",
                        ].join(" ")}
                        key={workspace.workspaceId}
                        onClick={() => {
                          setActiveWorkspaceId(workspace.workspaceId);
                          setWorkspaceStatus(null);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          {workspace.name}
                        </span>
                        {workspace.workspaceId === activeWorkspaceId ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : null}
                      </Button>
                    ))}
                  </div>
                </div>
              </Section>

              <Divider />

              <Section
                description="Delete the selected workspace and all associated files, shares, and access."
                title="Workspace Danger Zone"
              >
                <div className="max-w-md space-y-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
                  <div className="flex items-start gap-2 text-red-600">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-xs">
                      Type the workspace name exactly. If verification is
                      needed, we will prompt you after you continue.
                    </p>
                  </div>
                  <Input
                    disabled={!selectedWorkspace}
                    onChange={(e) => setWorkspaceDeleteConfirm(e.target.value)}
                    placeholder={selectedWorkspace?.name ?? "Workspace name"}
                    value={workspaceDeleteConfirm}
                  />
                  <Button
                    className="bg-red-600 text-white hover:bg-red-700"
                    disabled={
                      !selectedWorkspace ||
                      workspaceDeleteConfirm.trim() !==
                        (selectedWorkspace?.name ?? "")
                    }
                    onClick={() => {
                      if (!selectedWorkspace) {
                        return;
                      }
                      if (!sudoActive) {
                        requestSudoForAction(
                          `delete ${selectedWorkspace.name}`,
                          runDeleteWorkspace
                        );
                        return;
                      }
                      void runDeleteWorkspace();
                    }}
                    size="sm"
                    type="button"
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
              <Section
                description="How workspace data is retained and cleaned up."
                title="Data Retention"
              >
                <div className="max-w-md space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Deleted files and folders are moved to Trash and retained
                    for 30 days before permanent cleanup.
                  </p>
                </div>
              </Section>
            </>
          ) : null}

          {/* ── Keyboard Shortcuts Tab ── */}
          {currentTab === "shortcuts" ? (
            <>
              <Section
                description="Implemented shortcuts available in Avenire."
                title="Keyboard Shortcuts"
              >
                <div className="max-w-xl space-y-2">
                  {KEYBOARD_SHORTCUTS.map((shortcut) => (
                    <div
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2"
                      key={shortcut.label}
                    >
                      <span className="text-sm">{shortcut.label}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            className="inline-flex items-center justify-center rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground leading-none"
                            key={`${shortcut.label}-${key}`}
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
          setNoteTemplateDialogOpen(open);
          if (!open) {
            setNoteTemplateDraft(DEFAULT_NOTE_TEMPLATE);
            setNoteTemplateBannerUrl("");
            setNoteTemplateBannerStatus(null);
          }
        }}
        open={noteTemplateDialogOpen}
      >
        <DialogContent className="max-h-[92vh] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {noteTemplateDraft.id ? "Edit template" : "New template"}
            </DialogTitle>
            <DialogDescription>
              Templates are stored per workspace and can use note variables at
              creation time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(92vh-12rem)] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="template-name">
                  Name
                </label>
                <Input
                  id="template-name"
                  onChange={(event) =>
                    setNoteTemplateDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Study note"
                  value={noteTemplateDraft.name}
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="template-banner">
                  Banner
                </label>
                <input
                  className="hidden"
                  onChange={handleNoteTemplateBannerFileChange}
                  ref={noteTemplateBannerInputRef}
                  type="file"
                  accept="image/*"
                />
                <Input
                  id="template-banner"
                  onChange={(event) => setNoteTemplateBannerUrl(event.target.value)}
                  placeholder="https://example.com/banner.png"
                  value={noteTemplateBannerUrl}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={noteTemplateBannerUploading}
                    onClick={() => noteTemplateBannerInputRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    {noteTemplateBannerUploading ? "Uploading..." : "Upload banner"}
                  </Button>
                  <Button
                    disabled={!noteTemplateBannerUrl.trim()}
                    onClick={() => setNoteTemplateBannerUrl("")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
                {noteTemplateBannerStatus ? (
                  <p className="text-muted-foreground text-xs">
                    {noteTemplateBannerStatus}
                  </p>
                ) : null}
              </div>
            </div>
            {noteTemplateBannerUrl.trim() ? (
              <div
                className="h-32 overflow-hidden rounded-2xl border border-border/60 bg-muted/30"
                style={{
                  backgroundImage: `url(${noteTemplateBannerUrl.trim()})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }}
              />
            ) : null}
            <div className="space-y-2">
              <p className="font-medium text-sm">Template body</p>
              <div
                className="overflow-hidden rounded-2xl border border-border/60"
                ref={noteTemplateEditorScrollRef}
              >
                <DeferredAvenireEditor
                  createdBy={
                    session?.user?.name?.trim() ||
                    session?.user?.email?.trim() ||
                    ""
                  }
                  defaultValue={noteTemplateDraft.content}
                  key={noteTemplateEditorKey}
                  noteTitle={noteTemplateDraft.name || "Untitled"}
                  onChange={(markdown) =>
                    setNoteTemplateDraft((current) => ({
                      ...current,
                      content: markdown,
                    }))
                  }
                  onTemplateApplied={(template) => {
                    setNoteTemplateBannerUrl(template.bannerUrl ?? "");
                  }}
                  scrollContainerRef={noteTemplateEditorScrollRef}
                  wikiPages={[]}
                  workspaceUuid={selectedWorkspace?.workspaceId ?? activeWorkspaceId}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="justify-between gap-2 sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setNoteTemplateDialogOpen(false);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              {noteTemplateDraft.id ? (
                <Button
                  onClick={() => {
                    deleteNoteTemplateDraft();
                  }}
                  type="button"
                  variant="outline"
                >
                  Delete
                </Button>
              ) : null}
            </div>
            <Button
              disabled={
                !noteTemplateDraft.name.trim() ||
                !noteTemplateDraft.content.trim()
              }
              onClick={() => {
                saveNoteTemplateDraft();
              }}
              type="button"
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          setSudoDialogOpen(open);
          if (!open) {
            codeRequestedForSessionRef.current = false;
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
              onChange={(event) =>
                setSudoCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              value={sudoCode}
            />
            {sudoStatus ? (
              <p className="text-muted-foreground text-xs">{sudoStatus}</p>
            ) : null}
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
        <h2 className="font-semibold text-lg">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-border/40 border-t" />;
}

function UsageStatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/70 text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground text-sm">{label}</p>
          <p className="mt-3 font-semibold text-xl tracking-tight">{value}</p>
          <p className="mt-2 text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
    </div>
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
        <p className="font-medium text-sm">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
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
        "relative flex flex-col gap-4 rounded-xl border p-5 transition-all",
        popular
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border/60 bg-card",
      ].join(" ")}
    >
      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 font-semibold text-[11px] text-primary-foreground">
          Most Popular
        </span>
      ) : null}
      <div>
        <p className="font-bold text-base">{name}</p>
        <p className="mt-0.5 text-muted-foreground text-xs">{price}</p>
      </div>
      <ul className="flex-1 space-y-1.5">
        {features.map((f) => (
          <li
            className="flex items-start gap-2 text-muted-foreground text-xs"
            key={f}
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {current ? (
        <Button className="w-full" disabled size="sm" variant="outline">
          Current Plan
        </Button>
      ) : (
        <Button className="w-full" onClick={onUpgrade ?? undefined} size="sm">
          Upgrade
        </Button>
      )}
    </div>
  );
}
