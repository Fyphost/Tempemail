"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { CircleCheckIcon, LoaderCircleIcon, SendIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { submitContactAction } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { contactTopicLabels, contactTopics, type ContactTopic } from "@/lib/contact";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(100),
  email: z.email("Enter a valid email address so we can reply."),
  topic: z.enum(contactTopics),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(5_000),
  website: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function ContactForm({ defaultTopic }: { defaultTopic?: ContactTopic }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      topic: defaultTopic ?? "general",
      message: "",
      website: "",
    },
  });
  const { errors } = form.formState;

  if (sent) {
    return (
      <div
        className="flex flex-col items-center rounded-2xl border border-green-200 bg-success-soft p-10 text-center"
        role="status"
      >
        <CircleCheckIcon className="size-10 text-success" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold">Message sent</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Thanks for getting in touch. We will reply to the address you gave us.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => {
        setError(null);
        startTransition(async () => {
          const result = await submitContactAction(values);
          if (result.ok) setSent(true);
          else setError(result.error);
        });
      })}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            {...form.register("name")}
          />
          {errors.name ? (
            <p className="text-xs font-medium text-destructive">{errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...form.register("email")}
          />
          {errors.email ? (
            <p className="text-xs font-medium text-destructive">{errors.email.message}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-topic">Topic</Label>
        <Controller
          control={form.control}
          name="topic"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="contact-topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contactTopics.map((topic) => (
                  <SelectItem key={topic} value={topic}>
                    {contactTopicLabels[topic]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          rows={6}
          aria-invalid={Boolean(errors.message)}
          {...form.register("message")}
        />
        {errors.message ? (
          <p className="text-xs font-medium text-destructive">{errors.message.message}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Reporting abuse? Include the address that sent or received the mail and the approximate
          time.
        </p>
      </div>
      <div className="hidden" aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          {...form.register("website")}
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
        Send message
      </Button>
    </form>
  );
}
