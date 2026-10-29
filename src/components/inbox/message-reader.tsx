"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  ImageOffIcon,
  PaperclipIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/menus";
import { attachmentUrl, messageBodyUrl } from "@/lib/api-client";
import type { MessageDetailView } from "@/lib/types";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";

import { useCopy } from "./hooks";
import { SenderAvatar } from "./message-list";

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Plain-text body with links routed through the interstitial. */
function PlainTextBody({ text }: { text: string }) {
  const parts = useMemo(() => text.split(URL_PATTERN), [text]);
  return (
    <pre className="px-5 py-5 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground sm:px-6">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            key={index}
            href={`/link?u=${encodeURIComponent(part)}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2 hover:text-primary-strong"
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </pre>
  );
}

export function MessageReaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col" aria-busy>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon />
          Inbox
        </Button>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <Skeleton className="h-6 w-2/3" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function MessageReader({
  message,
  onBack,
  onDelete,
  onCopied,
}: {
  message: MessageDetailView;
  onBack: () => void;
  onDelete: () => void;
  onCopied: () => void;
}) {
  const [view, setView] = useState<"html" | "text">(message.hasHtml ? "html" : "text");
  const [allowImages, setAllowImages] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { copied, copy } = useCopy();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmDelete) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, confirmDelete]);

  const files = message.attachments.filter((file) => !file.inline || file.blocked);
  const sender = message.from.name || message.from.address || "Unknown sender";
  const textContent = message.text ?? "";
  const detailRows: [string, string | null][] = [
    [
      "From",
      message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address,
    ],
    ["To", message.to],
    ["Cc", message.cc],
    ["Reply-To", message.replyTo],
    ["Delivered to", message.envelopeTo],
    ["Received", formatDateTime(message.receivedAt)],
    ["Sent", message.date ? formatDateTime(message.date) : null],
    ...message.headers
      .filter(([name]) =>
        /^(message-id|authentication-results|received-spf|dkim-signature|list-unsubscribe|x-mailer)$/i.test(
          name,
        ),
      )
      .map(([name, value]) => [name, value] as [string, string]),
  ];

  return (
    <article className="flex min-h-0 flex-1 flex-col" aria-labelledby="message-subject">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeftIcon />
          Inbox
        </Button>
        <div className="flex items-center gap-1.5">
          {message.hasHtml && message.text ? (
            <Tabs value={view} onValueChange={(value) => setView(value as "html" | "text")}>
              <TabsList aria-label="Message format">
                <TabsTrigger value="html">
                  <CodeXmlIcon />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="text">
                  <FileTextIcon />
                  Text
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <Tooltip content={copied ? "Copied" : "Copy message text"}>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Copy message text"
              disabled={!textContent}
              onClick={async () => {
                if (await copy(textContent)) onCopied();
              }}
            >
              {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
            </Button>
          </Tooltip>
          <Tooltip content="Delete message">
            <Button
              variant="destructive-outline"
              size="icon-sm"
              aria-label="Delete message"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="px-5 pt-5 sm:px-6">
          <h2
            id="message-subject"
            className="text-xl leading-snug font-semibold tracking-tight text-balance break-words"
          >
            {message.subject || "(no subject)"}
          </h2>
          <div className="mt-4 flex items-start gap-3">
            <SenderAvatar name={message.from.name} address={message.from.address} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="truncate text-sm font-semibold">{sender}</p>
                <time
                  dateTime={message.receivedAt}
                  className="text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatDateTime(message.receivedAt)}
                </time>
              </div>
              {message.from.name ? (
                <p className="truncate text-xs text-muted-foreground">{message.from.address}</p>
              ) : null}
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                To: <span className="text-foreground/80">{message.envelopeTo}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showDetails}
          >
            {showDetails ? "Hide details" : "Show details"}
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform", showDetails && "rotate-180")}
            />
          </button>
          {showDetails ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-muted p-3.5 text-xs">
              {detailRows
                .filter((row): row is [string, string] => Boolean(row[1]))
                .map(([label, value]) => (
                  <div key={`${label}-${value.slice(0, 20)}`} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 font-mono text-[11.5px] break-all text-foreground/90">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : null}
        </header>

        {files.length > 0 ? (
          <section aria-label="Attachments" className="px-5 pt-4 sm:px-6">
            <ul className="flex flex-wrap gap-2">
              {files.map((file) => (
                <li key={file.id}>
                  {file.blocked ? (
                    <Tooltip content={file.blockedReason ?? "Blocked for safety"}>
                      <span className="inline-flex max-w-72 items-center gap-2 rounded-lg border border-red-200 bg-destructive-soft px-3 py-2 text-xs">
                        <ShieldAlertIcon className="size-4 shrink-0 text-destructive" />
                        <span className="truncate font-medium text-foreground">
                          {file.filename}
                        </span>
                        <span className="shrink-0 text-destructive">Blocked</span>
                      </span>
                    </Tooltip>
                  ) : (
                    <a
                      href={attachmentUrl(message.id, file.id)}
                      download={file.filename}
                      className="group inline-flex max-w-72 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-soft transition-colors hover:border-blue-200 hover:bg-accent"
                    >
                      <PaperclipIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                      <span className="truncate font-medium text-foreground">{file.filename}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                      </span>
                      <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view === "html" && message.hasHtml ? (
          <>
            {message.hasRemoteContent ? (
              <div
                className={cn(
                  "mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs sm:mx-6",
                  allowImages ? "border-green-200 bg-success-soft" : "border-blue-100 bg-accent",
                )}
              >
                <span className="flex items-center gap-2 text-foreground/80">
                  {allowImages ? (
                    <ShieldCheckIcon className="size-4 text-success" />
                  ) : (
                    <ImageOffIcon className="size-4 text-primary" />
                  )}
                  {allowImages
                    ? "Remote images are shown. The sender can see that this message was opened."
                    : "Remote images are hidden to stop tracking pixels and protect your IP address."}
                </span>
                {!allowImages ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 bg-white"
                    onClick={() => setAllowImages(true)}
                  >
                    Show images
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex min-h-[60vh] flex-1 border-t border-border lg:min-h-[420px]">
              <iframe
                key={`${message.id}-${allowImages ? "images" : "safe"}`}
                src={messageBodyUrl(message.id, allowImages)}
                title={`Email content: ${message.subject || "no subject"}`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full flex-1 bg-white"
              />
            </div>
          </>
        ) : (
          <div className="mt-4 flex-1 border-t border-border">
            {textContent ? (
              <PlainTextBody text={textContent} />
            ) : (
              <p className="px-6 py-8 text-sm text-muted-foreground">
                This message has no text content.
              </p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2">
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from this inbox permanently.
            </AlertDialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete message
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
