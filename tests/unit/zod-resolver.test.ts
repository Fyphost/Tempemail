import type { ResolverOptions } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodResolver } from "@/lib/zod-resolver";

const options = {
  fields: {},
  shouldUseNativeValidation: false,
} as unknown as ResolverOptions<never>;

describe("zodResolver", () => {
  const schema = z
    .object({
      email: z.email("Enter a valid email."),
      plans: z.object({ free: z.object({ ttl: z.number().int().min(5, "Too short") }) }),
      password: z.string().min(10, "Use at least 10 characters."),
      confirm: z.string(),
    })
    .refine((value) => value.password === value.confirm, {
      message: "Passwords do not match.",
      path: ["confirm"],
    });
  type Values = z.infer<typeof schema>;
  const resolve = zodResolver<Values>(schema);

  it("returns parsed values when valid", async () => {
    const values = {
      email: "a@example.com",
      plans: { free: { ttl: 60 } },
      password: "long-password",
      confirm: "long-password",
    };
    expect(await resolve(values, undefined, options as never)).toEqual({ values, errors: {} });
  });

  it("returns nested field errors, keeping the first issue per field", async () => {
    const result = await resolve(
      { email: "nope", plans: { free: { ttl: 1 } }, password: "short", confirm: "other" },
      undefined,
      options as never,
    );
    expect(result.values).toEqual({});
    expect(result.errors).toMatchObject({
      email: { message: "Enter a valid email." },
      plans: { free: { ttl: { message: "Too short" } } },
      password: { message: "Use at least 10 characters." },
    });
  });

  it("reports refinement errors on their path", async () => {
    const result = await resolve(
      {
        email: "a@example.com",
        plans: { free: { ttl: 60 } },
        password: "long-password",
        confirm: "different",
      },
      undefined,
      options as never,
    );
    expect(result.errors).toMatchObject({ confirm: { message: "Passwords do not match." } });
  });
});
