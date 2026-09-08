/**
 * Shared front-end configuration.
 */

/**
 * Version of the consent policy text currently displayed to users.
 *
 * Bump this whenever the wording in CONSENT_TYPES changes. It is stored on
 * every consent row so you can later prove which text a user agreed to.
 *
 * TODO(backend): the API accepts any string here with no validation, and no
 * policy text is stored anywhere, so this version is currently an
 * unresolvable pointer. A `policy_versions` table is the fix.
 */
export const POLICY_VERSION = "v1.0";

/** TODO: legal review - placeholder copy, not reviewed by a lawyer. */
export const PRIVACY_POLICY_URL = "/privacy";

export type ConsentType = "record_audio" | "send_email" | "send_sms";

export interface ConsentOption {
  type: ConsentType;
  label: string;
  description: string;
  /** Consent needed before a user may submit a problem, typed or recorded. */
  requiredForRecording?: boolean;
}

/**
 * One entry per consent type. Rendered as separate, unchecked checkboxes -
 * never pre-checked and never bundled, per CASL/PIPEDA.
 *
 * TODO: legal review - all copy below is placeholder wording written by a
 * developer. It must be reviewed, and translated to French before any Quebec
 * user sees it (Law 25).
 */
export const CONSENT_TYPES: ConsentOption[] = [
  {
    type: "record_audio",
    label: "Record and process my voice note",
    description:
      "You agree that we may record a short audio clip of you describing your " +
      "problem, store it securely, and create a written transcript so we can " +
      "understand what you need. Your camera is never used. This also covers " +
      "problems you type in yourself. You can withdraw this at any time.",
    requiredForRecording: true,
  },
  {
    type: "send_email",
    label: "Email me my results",
    description:
      "You agree that we may email you the solution or provider we find for you. " +
      "Every email includes an unsubscribe link.",
  },
  {
    type: "send_sms",
    label: "Text me my results",
    description:
      "You agree that we may send you a text message with your results. " +
      "Standard message rates may apply. Reply STOP to opt out at any time.",
  },
];
