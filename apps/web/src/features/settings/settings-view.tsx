"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Bot,
  Cloud,
  Download,
  FolderPlus,
  FolderSearch,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { PRODUCT } from "@/config/product";
import { useAuth } from "@/features/auth/auth-provider";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { getGoogleClientId } from "@/lib/drive/oauth";
import { getGooglePickerApiKey } from "@/lib/drive/picker";
import { useThemePreference } from "@/theme/use-theme";
import type { ThemePreference } from "@/types";

function Section({
  icon: Icon,
  title,
  children,
  id,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <Card className="p-5">
        <h2 id={`${id}-h`} className="mb-4 flex items-center gap-3 font-medium">
          <Icon aria-hidden className="size-5 text-ink-3" />
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

export function SettingsView() {
  const [theme, setTheme] = useThemePreference();
  const auth = useAuth();
  const ws = useWorkspace();
  const [driveActionMsg, setDriveActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const googleClientConfigured = Boolean(getGoogleClientId());
  const pickerConfigured = Boolean(getGooglePickerApiKey());

  async function runDriveAction(fn: () => Promise<void>) {
    setBusy(true);
    setDriveActionMsg(null);
    try {
      await fn();
    } catch (err) {
      setDriveActionMsg(err instanceof Error ? err.message : "Google Drive action failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadExport() {
    const json = ws.exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `justlakshmi-export-${ws.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Account, Drive storage, appearance, and privacy." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="s-profile" icon={User} title="Account & Identity">
          <div className="flex items-center gap-4">
            <Image
              src="/brand/logo-full.png"
              alt={`${PRODUCT.displayName} logo`}
              width={56}
              height={56}
              className="rounded-ui border border-line dark:invert"
            />
            <div className="min-w-0 flex-1">
              {auth.status === "authenticated" && auth.user ? (
                <>
                  <p className="truncate font-medium">{auth.user.displayName ?? auth.user.email ?? "Signed-in user"}</p>
                  <p className="truncate text-xs text-ink-3">{auth.user.email}</p>
                </>
              ) : auth.status === "unconfigured" ? (
                <>
                  <p className="font-medium">Local offline mode</p>
                  <p className="text-xs text-ink-3">Supabase Auth env vars are not configured yet.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Not signed in</p>
                  <p className="text-xs text-ink-3">Sign in with Google via Supabase Auth to link metadata.</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {auth.status === "authenticated" ? (
              <Button variant="secondary" onClick={() => void auth.signOut()}>
                <LogOut aria-hidden className="size-4" />
                Sign out
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={auth.status === "unconfigured" || auth.status === "loading"}
                onClick={() => void auth.signInWithGoogle()}
              >
                <LogIn aria-hidden className="size-4" />
                Sign in with Google
              </Button>
            )}
          </div>
          {auth.error ? <p className="mt-2 text-xs text-ink">{auth.error}</p> : null}
        </Section>

        <Section id="s-appearance" icon={Palette} title="Appearance">
          <Segmented<ThemePreference>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: <Sun aria-hidden className="size-4" /> },
              { value: "system", label: "System", icon: <Monitor aria-hidden className="size-4" /> },
              { value: "dark", label: "Dark", icon: <Moon aria-hidden className="size-4" /> },
            ]}
          />
          <p className="mt-3 text-xs text-ink-3">Saved on this device only. System follows your device setting.</p>
        </Section>

        <Section id="s-drive" icon={Cloud} title={`Google Drive (${PRODUCT.driveRootFolderName})`}>
          <div className="space-y-3 text-sm">
            <p className="text-ink-2">
              Status:{" "}
              <span className="font-medium capitalize">
                {(ws.driveConnection?.status ?? "not_connected").replace("_", " ")}
              </span>
              {ws.outboxCount > 0 ? ` · ${ws.outboxCount} local change(s) queued` : ""}
            </p>
            <p className="text-xs text-ink-3">{ws.syncMessage}</p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy || !googleClientConfigured}
                onClick={() => void runDriveAction(ws.connectCreateDriveFolder)}
              >
                <FolderPlus aria-hidden className="size-4" />
                Create Habbits folder
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !googleClientConfigured || !pickerConfigured}
                onClick={() => void runDriveAction(ws.connectSelectDriveFolder)}
              >
                <FolderSearch aria-hidden className="size-4" />
                Select existing folder
              </Button>
              {ws.driveConnection?.status === "connected" || ws.driveConnection?.status === "reauth_required" ? (
                <>
                  <Button variant="primary" disabled={busy} onClick={() => void runDriveAction(ws.syncNow)}>
                    <RefreshCw aria-hidden className="size-4" />
                    Sync now
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void runDriveAction(ws.reauthorizeDrive)}>
                    Reconnect Drive
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void runDriveAction(ws.disconnectDrive)}>
                    Disconnect
                  </Button>
                </>
              ) : null}
            </div>

            {!googleClientConfigured ? (
              <p className="text-xs text-ink-3">
                Configure <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> and <code>NEXT_PUBLIC_GOOGLE_PICKER_API_KEY</code> to enable
                least-privilege <code>drive.file</code> authorization.
              </p>
            ) : null}
            {driveActionMsg ? <p className="text-xs text-ink">{driveActionMsg}</p> : null}

            {ws.unresolvedConflicts.length > 0 ? (
              <div className="rounded-ui border border-line bg-bg p-3 text-xs">
                <p className="mb-2 flex items-center gap-1.5 font-medium">
                  <AlertTriangle aria-hidden className="size-4" />
                  {ws.unresolvedConflicts.length} sync conflict(s) require your choice
                </p>
                {ws.unresolvedConflicts.map((c) => (
                  <div key={c.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                    <span>
                      {c.entityType} ({c.entityId}) — local v{c.localVersion} vs remote v{c.remoteVersion}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void ws.resolveConflict(c.id, "keep_local")}
                        className="rounded-ui border border-line px-2 py-1 hover:bg-surface-2"
                      >
                        Keep local
                      </button>
                      <button
                        type="button"
                        onClick={() => void ws.resolveConflict(c.id, "keep_remote")}
                        className="rounded-ui border border-line px-2 py-1 hover:bg-surface-2"
                      >
                        Keep remote
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Section>

        <Section id="s-notifications" icon={Bell} title="Notifications">
          <div className="space-y-3 text-sm">
            <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4">
              <span>Global reminders master switch</span>
              <input
                type="checkbox"
                checked={ws.notificationPrefs.masterEnabled}
                onChange={(e) => void ws.updateNotificationPrefs({ masterEnabled: e.target.checked })}
                className="size-4 accent-ink"
              />
            </label>
            <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4">
              <span>Supportive quote wording</span>
              <input
                type="checkbox"
                checked={ws.notificationPrefs.motivationalCopy}
                onChange={(e) => void ws.updateNotificationPrefs({ motivationalCopy: e.target.checked })}
                className="size-4 accent-ink"
              />
            </label>
            <p className="text-xs text-ink-3">
              Scheduled Web Push delivery requires the Render background worker and VAPID keys (deferred). On iPhone, Web Push
              requires iOS 16.4+ installed to the Home Screen and is not equivalent to an exact-second native alarm.
            </p>
          </div>
        </Section>

        <Section id="s-privacy" icon={ShieldCheck} title="Privacy & Data Export">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-ink-3">
              Active local store:{" "}
              <strong className="text-ink-2">
                {ws.scope.kind === "user" ? "Authenticated user-scoped IndexedDB" : "Guest device IndexedDB"}
              </strong>
              . Guest data is never automatically merged into a signed-in account.
            </p>
            <p className="text-xs text-ink-3">
              Your routines, occurrences, journals, and AI memories are stored in isolated IndexedDB and your Google Drive{" "}
              <strong>{PRODUCT.driveRootFolderName}</strong> folder — never in Supabase. Google Drive access tokens stay in
              memory only.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={downloadExport}>
                <Download aria-hidden className="size-4" />
                Export workspace JSON
              </Button>
              {ws.legacyUnscoped.exists && ws.legacyUnscoped.recordCount > 0 ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const legacy = await ws.exportLegacyJson();
                    if (!legacy) return;
                    const blob = new Blob([legacy], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `justlakshmi-legacy-export-${ws.today}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export legacy unscoped data ({ws.legacyUnscoped.recordCount})
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-ink-3">Exports exclude OAuth tokens and AI provider API keys.</p>
          </div>
        </Section>

        <Section id="s-ai" icon={Bot} title="AI Preferences">
          <div className="space-y-2 text-sm">
            <p className="text-ink-2">
              External AI consent:{" "}
              <span className="font-medium">{ws.aiConsent.granted ? "Granted" : "Not granted"}</span>
            </p>
            <p className="text-xs text-ink-3">
              Manage BYOK provider keys (1–2 keys in session memory), journal consent, and persistent AI memory on the{" "}
              <Link href="/ai" className="text-ink underline underline-offset-4">
                Lakshmi AI
              </Link>{" "}
              page.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
