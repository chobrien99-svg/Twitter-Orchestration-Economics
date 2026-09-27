/**
 * Post length policy.
 *
 * - <= SOFT (280): classic tweet length. Best algorithmic reach; renders in
 *   full without a "Show more" collapse.
 * - SOFT < len <= HARD (25000): X Premium long-form. Legal to post if the
 *   authenticated account is Premium, but X collapses the body under
 *   "Show more" and may deprioritize reach. We warn rather than block.
 * - > HARD (25000): X rejects. Hard block in the UI and in server actions.
 */
export const POST_SOFT_LIMIT = 280;
export const POST_HARD_LIMIT = 25_000;

export type LengthState = "ok" | "long" | "over";

export function classifyLength(len: number): LengthState {
  if (len > POST_HARD_LIMIT) return "over";
  if (len > POST_SOFT_LIMIT) return "long";
  return "ok";
}
