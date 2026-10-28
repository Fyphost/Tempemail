"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MailIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  changePasswordAction,
  createApiKeyAction,
  deleteOwnedInboxAction,
  openOwnedInboxAction,
  revokeApiKeyAction,
} from "@/app/actions/account";
import { useCopy } from "@/components/inbox/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

export interface OwnedInboxRow {
  id: string;
  address: string;
  expiresAt: string;
  messageCount: number;
}

export function OwnedInboxes({ inboxes }: { inboxes: OwnedInboxRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (inboxes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no active addresses. Create one from the inbox.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {inboxes.map((inbox) => (
        <li key={inbox.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <MailIcon className="size-4 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium">{inbox.address}</p>
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {inbox.messageCount} message{inbox.messageCount === 1 ? "" : "s"} · expires{" "}
              {formatDateTime(inbox.expiresAt)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await openOwnedInboxAction(inbox.id);
                if (result.ok) router.push("/app");
                else toast.error(result.error);
              })
            }
          >
            Open
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon-sm"
                variant="destructive-outline"
                aria-label={`Delete ${inbox.address}`}
                disabled={pending}
              >
                <TrashIcon />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete {inbox.address}?</AlertDialogTitle>
              <AlertDialogDescription>
                The address and its messages are removed permanently.
              </AlertDialogDescription>
              <div className="flex justify-end gap-2">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteOwnedInboxAction(inbox.id);
                      if (result.ok) {
                        toast.success("Address deleted");
                        router.refresh();
                      } else toast.error(result.error);
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ul>
  );
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeys({
  keys,
  allowed,
  reason,
}: {
  keys: ApiKeyRow[];
  allowed: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { copied, copy } = useCopy();

  return (
    <div className="space-y-4">
      {allowed ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await createApiKeyAction(name);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              setName("");
              setCreated(result.data.key);
              router.refresh();
            });
          }}
        >
          <Label htmlFor="key-name" className="sr-only">
            Key name
          </Label>
          <Input
            id="key-name"
            placeholder="Key name, for example “CI pipeline”"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
            Create key
          </Button>
        </form>
      ) : (
        <p className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
          {reason}
        </p>
      )}

      {keys.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {key.name}
                  {key.revokedAt ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  <span className="font-mono">{key.prefix}…</span> · created{" "}
                  {formatDateTime(key.createdAt)}
                  {key.lastUsedAt
                    ? ` · last used ${formatDateTime(key.lastUsedAt)}`
                    : " · never used"}
                </p>
              </div>
              {!key.revokedAt ? (
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeApiKeyAction(key.id);
                      if (result.ok) {
                        toast.success("API key revoked");
                        router.refresh();
                      } else toast.error(result.error);
                    })
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new API key</DialogTitle>
            <DialogDescription>
              This is the only time the full key is shown. Store it in a secret manager or
              environment variable.
            </DialogDescription>
          </DialogHeader>
          <code className="block rounded-lg border border-border bg-muted p-3 font-mono text-xs break-all">
            {created}
          </code>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreated(null)}>
              Done
            </Button>
            <Button onClick={() => created && void copy(created)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(10, "Use at least 10 characters.").max(200),
    confirm: z.string(),
  })
  .refine((values) => values.next === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="grid gap-4 sm:max-w-md"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const result = await changePasswordAction({ current: values.current, next: values.next });
          if (result.ok) {
            toast.success("Password updated");
            form.reset();
          } else toast.error(result.error);
        }),
      )}
    >
      {(["current", "next", "confirm"] as const).map((field) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={`pw-${field}`}>
            {field === "current"
              ? "Current password"
              : field === "next"
                ? "New password"
                : "Confirm new password"}
          </Label>
          <Input
            id={`pw-${field}`}
            type="password"
            autoComplete={field === "current" ? "current-password" : "new-password"}
            aria-invalid={Boolean(errors[field])}
            {...form.register(field)}
          />
          {errors[field] ? (
            <p className="text-xs font-medium text-destructive">{errors[field]?.message}</p>
          ) : null}
        </div>
      ))}
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
        Update password
      </Button>
    </form>
  );
}
