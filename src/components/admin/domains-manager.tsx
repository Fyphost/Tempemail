"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CopyIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  checkDomainAction,
  createDomainAction,
  deleteDomainAction,
  rotateProbeAction,
  updateDomainAction,
} from "@/app/actions/admin";
import { useCopy } from "@/components/inbox/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { cn, formatDateTime } from "@/lib/utils";

export interface DomainRow {
  id: string;
  name: string;
  isEnabled: boolean;
  visibility: "public" | "premium";
  expectedMx: string[];
  effectiveExpectedMx: string[];
  mxStatus: "unknown" | "verified" | "mismatch" | "missing" | "error";
  mxRecords: string[];
  mxError: string | null;
  mxCheckedAt: string | null;
  receiveStatus: "pending" | "verified";
  receiveVerifiedAt: string | null;
  probeAddress: string;
  defaultTtlMinutes: number | null;
  receiving: boolean;
  activeInboxes: number;
}

function CopyValue({ value }: { value: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs hover:bg-secondary"
      aria-label={`Copy ${value}`}
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <CheckIcon className="size-3 text-success" />
      ) : (
        <CopyIcon className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}

function Step({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      {done ? (
        <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
      ) : (
        <CircleDotIcon
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          aria-label="Pending"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

const mxLabel: Record<
  DomainRow["mxStatus"],
  { text: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  verified: { text: "MX verified", variant: "success" },
  mismatch: { text: "MX points elsewhere", variant: "warning" },
  missing: { text: "No MX records", variant: "destructive" },
  error: { text: "DNS lookup failed", variant: "destructive" },
  unknown: { text: "MX not checked", variant: "secondary" },
};

function DomainCard({ domain, skipMx }: { domain: DomainRow; skipMx: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ttl, setTtl] = useState(domain.defaultTtlMinutes?.toString() ?? "");
  const [mxInput, setMxInput] = useState(domain.expectedMx.join(", "));

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else toast.error(result.error ?? "Action failed");
    });

  const status = mxLabel[domain.mxStatus];
  return (
    <article className="rounded-2xl border border-border bg-card shadow-soft">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <h2 className="font-mono text-base font-semibold">{domain.name}</h2>
        {domain.receiving ? (
          <Badge variant="success">Receiving</Badge>
        ) : (
          <Badge variant="warning">Not live</Badge>
        )}
        <Badge variant={status.variant}>{status.text}</Badge>
        <Badge variant={domain.receiveStatus === "verified" ? "success" : "secondary"}>
          {domain.receiveStatus === "verified"
            ? "Test delivery received"
            : "Awaiting test delivery"}
        </Badge>
        {domain.visibility === "premium" ? <Badge variant="info">Premium only</Badge> : null}
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor={`enabled-${domain.id}`} className="text-sm text-muted-foreground">
            Enabled
          </Label>
          <Switch
            id={`enabled-${domain.id}`}
            checked={domain.isEnabled}
            disabled={pending}
            onCheckedChange={(checked) =>
              run(
                () => updateDomainAction({ id: domain.id, isEnabled: checked }),
                checked ? "Domain enabled" : "Domain disabled",
              )
            }
          />
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
        <ol className="space-y-5">
          <Step
            done={domain.mxStatus === "verified" || skipMx}
            title="1. Point MX records at your inbound infrastructure"
          >
            <p>Publish MX records for {domain.name} that point to:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {domain.effectiveExpectedMx.length > 0 ? (
                domain.effectiveExpectedMx.map((host) => <CopyValue key={host} value={host} />)
              ) : (
                <span className="text-amber-700">
                  No expected MX host configured (set MX_TARGETS or the field below).
                </span>
              )}
            </div>
            <p className="mt-2 text-xs">
              Found: {domain.mxRecords.length > 0 ? domain.mxRecords.join(", ") : "none"}
              {domain.mxCheckedAt ? ` · checked ${formatDateTime(domain.mxCheckedAt)}` : ""}
            </p>
            {domain.mxError ? (
              <p className="mt-1 text-xs text-destructive">{domain.mxError}</p>
            ) : null}
            {skipMx && domain.mxStatus !== "verified" ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <TriangleAlertIcon className="size-3.5" /> SKIP_MX_CHECK is on: MX verification is
                bypassed (development only).
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await checkDomainAction(domain.id);
                  if (result.ok)
                    toast.success(
                      `DNS check: ${mxLabel[result.data.mxStatus as DomainRow["mxStatus"]]?.text ?? result.data.mxStatus}`,
                    );
                  else toast.error(result.error);
                  router.refresh();
                })
              }
            >
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
              Check DNS now
            </Button>
          </Step>
          <Step done={domain.receiveStatus === "verified"} title="2. Send a real test email">
            <p>Send any email from an outside mailbox to this verification address:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyValue value={domain.probeAddress} />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => rotateProbeAction(domain.id), "New verification address generated")
                }
              >
                <RotateCcwIcon />
                New address
              </Button>
            </div>
            <p className="mt-2 text-xs">
              {domain.receiveVerifiedAt
                ? `Received ${formatDateTime(domain.receiveVerifiedAt)}. The message itself was discarded.`
                : "Refresh this page after sending. The message proves that mail reaches the pipeline end to end."}
            </p>
          </Step>
          <Step done={domain.isEnabled} title="3. Enable the domain">
            <p>
              Once both checks pass and the domain is enabled, visitors can create addresses on it.
            </p>
          </Step>
        </ol>

        <div className="space-y-4 rounded-xl border border-border bg-muted p-4">
          <div className="space-y-2">
            <Label htmlFor={`vis-${domain.id}`}>Availability</Label>
            <Select
              value={domain.visibility}
              disabled={pending}
              onValueChange={(value) =>
                run(
                  () =>
                    updateDomainAction({
                      id: domain.id,
                      visibility: value as "public" | "premium",
                    }),
                  "Availability updated",
                )
              }
            >
              <SelectTrigger id={`vis-${domain.id}`} className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Everyone</SelectItem>
                <SelectItem value="premium">Premium accounts only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const minutes = ttl.trim() ? Number(ttl) : null;
              run(
                () => updateDomainAction({ id: domain.id, defaultTtlMinutes: minutes }),
                "Default lifetime saved",
              );
            }}
          >
            <Label htmlFor={`ttl-${domain.id}`}>Default lifetime override (minutes)</Label>
            <div className="flex gap-2">
              <Input
                id={`ttl-${domain.id}`}
                type="number"
                min={5}
                placeholder="Use plan default"
                value={ttl}
                onChange={(event) => setTtl(event.target.value)}
                className="bg-background"
              />
              <Button type="submit" variant="outline" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => updateDomainAction({ id: domain.id, expectedMx: mxInput }),
                "Expected MX hosts saved",
              );
            }}
          >
            <Label htmlFor={`mx-${domain.id}`}>Expected MX hosts (optional override)</Label>
            <div className="flex gap-2">
              <Input
                id={`mx-${domain.id}`}
                placeholder="mx.example.com, *.mx.cloudflare.net"
                value={mxInput}
                onChange={(event) => setMxInput(event.target.value)}
                className="bg-background"
              />
              <Button type="submit" variant="outline" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
          <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {domain.activeInboxes} active inbox{domain.activeInboxes === 1 ? "" : "es"}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive-outline" disabled={pending}>
                  <TrashIcon />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Remove {domain.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The domain must be disabled and have no active inboxes. Any expired inboxes that
                  remain on it are deleted.
                </AlertDialogDescription>
                <div className="flex justify-end gap-2">
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => run(() => deleteDomainAction(domain.id), "Domain removed")}
                  >
                    Remove domain
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </article>
  );
}

const addSchema = z.object({
  name: z.string().trim().min(3, "Enter a domain name.").max(253),
  visibility: z.enum(["public", "premium"]),
  expectedMx: z.string().max(1_000),
});

function AddDomainDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { name: "", visibility: "public", expectedMx: "" },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a receiving domain</DialogTitle>
          <DialogDescription>
            The domain starts disabled. It goes live after its MX records are verified and a test
            email arrives.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const result = await createDomainAction({ ...values, defaultTtlMinutes: null });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success("Domain added");
              form.reset();
              setOpen(false);
              router.refresh();
            }),
          )}
        >
          <div className="space-y-2">
            <Label htmlFor="domain-name">Domain</Label>
            <Input
              id="domain-name"
              placeholder="mail.example.com"
              autoComplete="off"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-visibility">Availability</Label>
            <Controller
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="domain-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Everyone</SelectItem>
                    <SelectItem value="premium">Premium accounts only</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-mx">Expected MX hosts (optional)</Label>
            <Input
              id="domain-mx"
              placeholder="Defaults to MX_TARGETS"
              {...form.register("expectedMx")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
              Add domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DomainsManager({ domains, skipMx }: { domains: DomainRow[]; skipMx: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <AddDomainDialog />
      </div>
      {domains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium">No domains yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the domain you want temporary addresses to use.
          </p>
        </div>
      ) : (
        domains.map((domain) => <DomainCard key={domain.id} domain={domain} skipMx={skipMx} />)
      )}
      <p className={cn("text-xs text-muted-foreground")}>
        Domains are re-checked automatically every 30 minutes. A domain whose MX records stop
        matching is taken out of rotation until it verifies again.
      </p>
    </div>
  );
}
