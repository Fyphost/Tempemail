"use client";

import { BanIcon, LoaderCircleIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  blockNetworkAction,
  deleteInboxAction,
  resetUserPasswordAction,
  retryJobAction,
  setContactStatusAction,
  unblockNetworkAction,
  updateUserAction,
} from "@/app/actions/admin";
import type { ActionResult } from "@/app/actions/result";
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

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else toast.error(result.error);
    });
  return { pending, run };
}

export function DeleteInboxButton({ id, address }: { id: string; address: string }) {
  const { pending, run } = useAction();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="destructive-outline"
          aria-label={`Delete ${address}`}
          disabled={pending}
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <TrashIcon />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete {address}?</AlertDialogTitle>
        <AlertDialogDescription>
          The inbox, its messages and attachments are removed immediately.
        </AlertDialogDescription>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => run(() => deleteInboxAction(id), "Inbox deleted")}
          >
            Delete inbox
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const durations = [
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
  { value: "forever", label: "Until removed" },
];

/** Block either a raw IP (hashed server-side) or the hashed creator network of an inbox. */
export function BlockNetworkDialog({
  ipHash,
  label,
  trigger,
}: {
  ipHash?: string;
  label?: string;
  trigger?: React.ReactNode;
}) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("168");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon-sm" variant="outline" aria-label="Block creator network">
            <BanIcon />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ipHash ? "Block the creator's network" : "Block a network"}</DialogTitle>
          <DialogDescription>
            Blocked networks cannot create addresses, sign in, send contact requests or connect over
            SMTP.
            {ipHash ? ` ${label ?? ""}` : " IPv6 addresses are blocked per /64."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                blockNetworkAction({
                  ip: ipHash ? undefined : ip,
                  ipHash,
                  reason,
                  hours: duration === "forever" ? null : Number(duration),
                }),
              "Network blocked",
              () => {
                setOpen(false);
                setIp("");
                setReason("");
              },
            );
          }}
        >
          {!ipHash ? (
            <div className="space-y-2">
              <Label htmlFor="block-ip">IP address</Label>
              <Input
                id="block-ip"
                placeholder="203.0.113.7 or 2001:db8::1"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The address is hashed immediately and never stored.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason</Label>
            <Input
              id="block-reason"
              placeholder="Automated address generation"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-duration">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="block-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <BanIcon />}
              Block
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnblockButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => run(() => unblockNetworkAction(id), "Block removed")}
    >
      Unblock
    </Button>
  );
}

export function RetryJobButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => run(() => retryJobAction(id), "Job queued for retry")}
    >
      {pending ? <LoaderCircleIcon className="animate-spin" /> : <RotateCcwIcon />}
      Retry
    </Button>
  );
}

export function UserControls({
  id,
  role,
  plan,
  status,
  isSelf,
}: {
  id: string;
  role: "user" | "admin";
  plan: "free" | "premium";
  status: "active" | "disabled";
  isSelf: boolean;
}) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        value={plan}
        disabled={pending}
        onValueChange={(value) =>
          run(() => updateUserAction({ id, plan: value as "free" | "premium" }), "Plan updated")
        }
      >
        <SelectTrigger className="h-8 w-28" aria-label="Plan">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="premium">Premium</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={role}
        disabled={pending || isSelf}
        onValueChange={(value) =>
          run(() => updateUserAction({ id, role: value as "user" | "admin" }), "Role updated")
        }
      >
        <SelectTrigger className="h-8 w-24" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <ResetPasswordDialog id={id} />
      <Button
        size="sm"
        variant={status === "active" ? "destructive-outline" : "outline"}
        disabled={pending || isSelf}
        onClick={() =>
          run(
            () => updateUserAction({ id, status: status === "active" ? "disabled" : "active" }),
            status === "active" ? "User disabled" : "User enabled",
          )
        }
      >
        {status === "active" ? "Disable" : "Enable"}
      </Button>
    </div>
  );
}

function ResetPasswordDialog({ id }: { id: string }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>
            The user is signed out everywhere. Share the new password securely and ask them to
            change it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => resetUserPasswordAction({ id, password }),
              "Password updated",
              () => {
                setOpen(false);
                setPassword("");
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`reset-${id}`}>New password</Label>
            <Input
              id={`reset-${id}`}
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || password.length < 10}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactStatusButton({ id, status }: { id: string; status: "open" | "closed" }) {
  const { pending, run } = useAction();
  const next = status === "open" ? "closed" : "open";
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(
          () => setContactStatusAction(id, next),
          next === "closed" ? "Marked as handled" : "Reopened",
        )
      }
    >
      {status === "open" ? "Mark handled" : "Reopen"}
    </Button>
  );
}
