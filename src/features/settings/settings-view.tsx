"use client";

import Image from "next/image";
import { Bell, Bot, Lock, Monitor, Moon, Palette, ShieldCheck, Sun, User, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { PRODUCT } from "@/config/product";
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
    <section aria-labelledby={id}>
      <Card className="p-5">
        <h2 id={id} className="mb-4 flex items-center gap-3 font-medium">
          <Icon aria-hidden className="size-5 text-ink-3" />
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Soon({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>;
}

function DisabledSwitch({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <p className="text-xs text-ink-3">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked="false"
        disabled
        aria-label={`${label} (unavailable in this phase)`}
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 opacity-60"
      >
        <span className="absolute top-1 left-1 size-5 rounded-full bg-ink-3" />
      </button>
    </div>
  );
}

export function SettingsView() {
  const [theme, setTheme] = useThemePreference();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Make the app feel right." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="s-profile" icon={User} title="Profile">
          <div className="flex items-center gap-4">
            <Image
              src="/brand/logo-full.png"
              alt={`${PRODUCT.displayName} logo`}
              width={64}
              height={64}
              className="rounded-ui border border-line dark:invert"
            />
            <div>
              <p className="font-medium">Guest</p>
              <Soon>Profiles arrive with sign-in in a later phase.</Soon>
            </div>
          </div>
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

        <Section id="s-notifications" icon={Bell} title="Notifications">
          <DisabledSwitch label="Task reminders" hint="Not available yet" />
          <p className="mt-3 text-xs text-ink-3">
            Reminders need a background service and, on iPhone, the app added to your Home Screen. They will not be exact-second alarms.
          </p>
        </Section>

        <Section id="s-privacy" icon={ShieldCheck} title="Privacy">
          <Soon>
            In this phase the app shows sample data only and stores nothing except your theme choice on this device. Later, your records
            will live in a folder named “{PRODUCT.driveRootFolderName}” in your own Google Drive.
          </Soon>
        </Section>

        <Section id="s-account" icon={UserCog} title="Account">
          <Soon>Sign-in and Google Drive connection are not available yet.</Soon>
        </Section>

        <Section id="s-ai" icon={Bot} title="AI preferences">
          <Soon>AI consent, provider and key settings will appear when Lakshmi AI is introduced.</Soon>
        </Section>
      </div>

      <p className="flex items-center gap-2 text-xs text-ink-3">
        <Lock aria-hidden className="size-3.5" />
        Placeholder sections are not functional yet. <DemoBadge label="Preview" />
      </p>
    </div>
  );
}
