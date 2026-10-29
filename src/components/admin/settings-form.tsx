"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { LoaderCircleIcon, SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { saveSettingsAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsSchema, type SystemSettings } from "@/lib/settings-schema";

type Path = FieldPath<SystemSettings>;

function getError(errors: Record<string, unknown>, path: string): string | undefined {
  let node: unknown = errors;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node && typeof node === "object" && "message" in node
    ? String((node as { message: unknown }).message)
    : undefined;
}

type Form = UseFormReturn<SystemSettings>;

function NumberField({
  form,
  path,
  label,
  hint,
  unit,
}: {
  form: Form;
  path: Path;
  label: string;
  hint?: string;
  unit?: string;
}) {
  const error = getError(form.formState.errors as Record<string, unknown>, path);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={path}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={path}
          type="number"
          inputMode="numeric"
          aria-invalid={Boolean(error)}
          {...form.register(path, { valueAsNumber: true })}
        />
        {unit ? <span className="w-16 shrink-0 text-xs text-muted-foreground">{unit}</span> : null}
      </div>
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SwitchField({
  form,
  path,
  label,
  hint,
}: {
  form: Form;
  path: Path;
  label: string;
  hint?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={path}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted p-4">
          <div>
            <Label htmlFor={path}>{label}</Label>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <Switch id={path} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

function PlanFields({ form, plan }: { form: Form; plan: "free" | "premium" }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <NumberField
        form={form}
        path={`plans.${plan}.inboxTtlMinutes`}
        label="Default lifetime"
        unit="minutes"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.maxLifetimeMinutes`}
        label="Maximum lifetime"
        unit="minutes"
        hint="Cap including extensions"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.extendMinutes`}
        label="Extension step"
        unit="minutes"
        hint="0 disables extensions"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.maxConcurrentInboxes`}
        label="Concurrent addresses (accounts)"
        unit="addresses"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.inboxCreatesPerHour`}
        label="New addresses per hour"
        unit="per hour"
        hint="Per IP (anonymous) or per account"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.maxMessagesPerInbox`}
        label="Messages kept per address"
        unit="messages"
      />
      <NumberField
        form={form}
        path={`plans.${plan}.maxMessageSizeKb`}
        label="Maximum message size"
        unit="KB"
      />
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        <SwitchField
          form={form}
          path={`plans.${plan}.customRetention`}
          label="Custom lifetime"
          hint="Let users choose a lifetime up to the maximum"
        />
        <SwitchField
          form={form}
          path={`plans.${plan}.apiKeys`}
          label="API keys"
          hint="Allow accounts on this plan to create API keys"
        />
      </div>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: SystemSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [extensions, setExtensions] = useState(initial.attachments.blockedExtensions.join(", "));
  const form = useForm<SystemSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initial,
  });
  const { isDirty } = form.formState;

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={form.handleSubmit(
        (values) =>
          startTransition(async () => {
            const next: SystemSettings = {
              ...values,
              attachments: {
                ...values.attachments,
                blockedExtensions: [
                  ...new Set(
                    extensions
                      .split(/[\s,]+/)
                      .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
                      .filter(Boolean),
                  ),
                ],
              },
            };
            const result = await saveSettingsAction(next);
            if (result.ok) {
              toast.success("Settings saved", {
                description: "Changes apply within a few seconds on every server.",
              });
              form.reset(next);
              router.refresh();
            } else toast.error(result.error);
          }),
        () => toast.error("Some values are invalid. Check the highlighted fields."),
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle>Plans and inbox expiration</CardTitle>
          <CardDescription>
            Anonymous visitors always get Free limits. Premium applies to accounts on the Premium
            plan while Premium is enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="free" className="space-y-5">
            <TabsList>
              <TabsTrigger value="free">Free</TabsTrigger>
              <TabsTrigger value="premium">Premium</TabsTrigger>
            </TabsList>
            <TabsContent value="free">
              <PlanFields form={form} plan="free" />
            </TabsContent>
            <TabsContent value="premium">
              <PlanFields form={form} plan="premium" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts and API access</CardTitle>
          <CardDescription>
            Optional features. Nothing here affects anonymous inboxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SwitchField
            form={form}
            path="premiumEnabled"
            label="Premium plan"
            hint="Apply Premium limits to Premium accounts and show the plan on the pricing page"
          />
          <SwitchField
            form={form}
            path="registrationEnabled"
            label="Self-registration"
            hint="Allow visitors to create accounts on the sign-in page"
          />
          <SwitchField
            form={form}
            path="api.enabled"
            label="Programmatic API access"
            hint="Accept bearer tokens (tei_/tek_). Browser sessions keep working when off."
          />
          <SwitchField
            form={form}
            path="api.keysEnabled"
            label="API keys"
            hint="Allow eligible accounts to create API keys"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate limits</CardTitle>
          <CardDescription>
            Protects the service from abuse and excessive address generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            form={form}
            path="rateLimits.apiRequestsPerMinute"
            label="API requests per IP"
            unit="per min"
          />
          <NumberField
            form={form}
            path="rateLimits.inboundPerInboxPerMinute"
            label="Inbound messages per inbox"
            unit="per min"
          />
          <NumberField
            form={form}
            path="rateLimits.smtpConnectionsPerMinute"
            label="SMTP connections per IP"
            unit="per min"
          />
          <NumberField
            form={form}
            path="rateLimits.loginAttemptsPer15Minutes"
            label="Sign-in attempts per account"
            unit="per 15 min"
          />
          <NumberField
            form={form}
            path="rateLimits.contactRequestsPerHour"
            label="Contact requests per IP"
            unit="per hour"
          />
          <NumberField
            form={form}
            path="rateLimits.sseConnectionsPerInbox"
            label="Live connections per inbox"
            unit="streams"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message size and attachments</CardTitle>
          <CardDescription>
            Blocked files keep their name and size but their content is never stored or served.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-[240px_1fr]">
          <NumberField
            form={form}
            path="attachments.maxAttachmentSizeKb"
            label="Maximum attachment size"
            unit="KB"
          />
          <div className="space-y-1.5">
            <Label htmlFor="blocked-extensions">Blocked file extensions</Label>
            <Textarea
              id="blocked-extensions"
              rows={3}
              value={extensions}
              onChange={(event) => {
                setExtensions(event.target.value);
                form.setValue(
                  "attachments.blockedExtensions",
                  form.getValues("attachments.blockedExtensions"),
                  { shouldDirty: true },
                );
              }}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Comma separated, without dots. Executable content types are always blocked.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention and cleanup</CardTitle>
          <CardDescription>
            Inboxes and their messages are deleted at expiry by the cleanup job (every minute).
            These settings control operational records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            form={form}
            path="retention.completedJobsHours"
            label="Processed delivery records"
            unit="hours"
            hint="Used to detect duplicate deliveries"
          />
          <NumberField
            form={form}
            path="retention.failedJobsDays"
            label="Failed deliveries"
            unit="days"
            hint="Kept with payload for retries"
          />
          <NumberField form={form} path="retention.auditLogDays" label="Audit log" unit="days" />
          <NumberField
            form={form}
            path="retention.webhookFailureDays"
            label="Webhook failure log"
            unit="days"
          />
          <NumberField
            form={form}
            path="retention.contactRequestsDays"
            label="Contact requests"
            unit="days"
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-card backdrop-blur">
        <p className="mr-auto pl-2 text-sm text-muted-foreground">
          {isDirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !isDirty}
          onClick={() => {
            form.reset(initial);
            setExtensions(initial.attachments.blockedExtensions.join(", "));
          }}
        >
          Discard
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
