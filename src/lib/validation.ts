import { z } from 'zod';

/**
 * The only three values `contacts.priority` may ever hold. This list is the
 * single source of truth: the Zod schema, the priority `<Select>` in the UI,
 * and the `contacts_priority_valid` CHECK constraint in db/schema.sql all
 * agree on it.
 */
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Trim strings, and treat a field that trims to nothing as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const contactInputSchema = z.object({
  name: z
    .string({ error: 'Name is required.' })
    .trim()
    .min(1, 'Name is required.')
    .max(200, 'Name must be 200 characters or fewer.'),

  company: optionalText(200),
  role: optionalText(200),
  where_met: optionalText(200),
  notes: optionalText(2000),

  priority: z.enum(PRIORITIES, {
    error: 'Priority must be one of: high, medium, low.',
  }),
});

/**
 * Editing sends only the fields that changed, but an explicitly-sent field is
 * held to the same rules as on create -- `name: ""` is still rejected.
 */
export const contactUpdateSchema = contactInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: 'No fields to update.',
  });

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors; message: string };

/**
 * Runs a schema and flattens ZodError into `{ field: message }`, which is the
 * shape the API returns and the form renders under each input.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(payload);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.join('.') || '_';
    // Keep the first message per field so the form shows one clear line.
    if (!(field in errors)) errors[field] = issue.message;
  }

  return {
    ok: false,
    errors,
    message: Object.values(errors)[0] ?? 'That input is not valid.',
  };
}
