/**
 * Shared form-field styling.
 *
 * Every input had its own copy of this string, and every copy used
 * `focus:outline-none` with only a border-colour change to replace it. A
 * 1px border shift is not a focus indicator: it is invisible to most people
 * and fails contrast outright. These add a real ring instead.
 */

const BASE =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm " +
  "text-slate-900 placeholder:text-slate-400 " +
  // Keyboard focus is unmistakable; a mouse click does not paint a ring.
  "focus-visible:outline-none focus-visible:border-slate-900 " +
  "focus-visible:ring-2 focus-visible:ring-slate-900/30 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

/** Text, email, tel, number, textarea. */
export const FIELD = BASE;

/** Selects need the same treatment plus room for the native chevron. */
export const SELECT = `${BASE} pr-8`;

/** Label text above a field. */
export const LABEL = "mb-1 block text-sm font-medium text-slate-700";
