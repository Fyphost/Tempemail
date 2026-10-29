import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * React Hook Form resolver for Zod schemas. Returns the parsed values on
 * success and nested field errors (first issue per field) on failure.
 */
export function zodResolver<TValues extends FieldValues>(
  schema: z.ZodType<TValues>,
): Resolver<TValues> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String);
      if (path.length === 0) continue;
      let node = errors;
      for (const key of path.slice(0, -1)) {
        node[key] ??= {};
        node = node[key] as Record<string, unknown>;
      }
      const leaf = path.at(-1)!;
      if (!node[leaf]) {
        const error: FieldError = { type: issue.code, message: issue.message };
        node[leaf] = error;
      }
    }
    return { values: {}, errors: errors as FieldErrors<TValues> };
  };
}
