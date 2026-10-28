"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/server/db/client";
import { contactRequests } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { clientIpFromHeaders, hashIp } from "@/server/security/ip";
import { assertIpNotBlocked, enforceRateLimit } from "@/server/security/rate-limit";
import { getSettings } from "@/server/settings";

import { contactTopics } from "@/lib/contact";

import { runAction, type ActionResult } from "./result";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(100),
  email: z.email("Enter a valid email address so we can reply.").max(320),
  topic: z.enum(contactTopics),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(5_000),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function submitContactAction(input: z.input<typeof schema>): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    const ipHash = hashIp(clientIpFromHeaders(await headers()));
    await assertIpNotBlocked(ipHash);
    const settings = await getSettings();
    await enforceRateLimit(
      "contact.ip",
      ipHash,
      settings.rateLimits.contactRequestsPerHour,
      3600,
      "You have sent several messages recently. Please try again later.",
    );
    await getDb().insert(contactRequests).values({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      topic: parsed.data.topic,
      message: parsed.data.message,
      ipHash,
    });
    return undefined;
  });
}
