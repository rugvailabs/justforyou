/**
 * Form-field styling as strings, matching components/ui/field.ts key for key.
 *
 * The two big owner forms - BusinessForm and VerificationForm - apply these to
 * bare <input>/<select>/<textarea> elements rather than to a component, and
 * they carry real logic: draft state, a geocoder, file validation, an upload
 * that has to survive a retry. Restyling them by swapping this import is a
 * change to how they look and to nothing else, which is the point. Rewriting
 * them into <Input>/<Select> components would put working KYC and listing code
 * through a rewrite to gain nothing a class string does not already give.
 *
 * The values are the same ones ds/primitives.tsx uses for Input and Select, so
 * a field styled through here and one styled through <Input> are identical.
 */

/** Text, email, tel, number. Height matches <Input>. */
export const FIELD =
  "h-10 w-full rounded-input border border-line-strong bg-surface px-3 " +
  "text-body text-ink placeholder:text-ink-subtle " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle";

/** Selects need room for the native chevron. */
export const SELECT = `${FIELD} pr-8`;

/**
 * Textareas size to their rows attribute, so the fixed height that makes a
 * one-line input line up with a button is exactly wrong here.
 */
export const TEXTAREA = `${FIELD} h-auto py-2`;

/** Label text above a field. */
export const LABEL = "mb-1 block text-meta font-medium text-ink-muted";

/** Helper or constraint text below a field. */
export const HINT = "mt-1 text-meta text-ink-subtle";
