import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Second-pass style linter for X posts. Takes a generated draft, strips
 * AI-writing patterns, returns the cleaned text plus a 0–100 slop score
 * (100 = clean, 0 = full AI output) and a short list of changes.
 *
 * Based on the `skill-unslop` ruleset distilled for tweet-length writing.
 * Preserves ideas, named entities, numbers, URLs, @-mentions, and voice.
 *
 * Runs on Sonnet 5 by default (a mechanical filter doesn't need Opus).
 * Set UNSLOP_PASS=false to short-circuit (returns input unchanged).
 */

export type UnslopResult = {
  cleaned: string;
  slopScore: number;
  changes: string[];
  skipped: boolean;
};

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
  cached = new Anthropic({ apiKey });
  return cached;
}

const UNSLOP_SYSTEM = `You are a style linter for X (Twitter) posts drafted on behalf of Raphaelle d'Ornano (@Raph_dOrnano), who writes on AI concentration risk, model-provider economics, orchestration economics, and the moat structure of AI. She publishes long-form at decodingdiscontinuity.com and a book-length manifesto at orchestration-economics.com.

Your job: detect AI-generated writing patterns in the input tweet, rewrite them away, and return the cleaned text plus a 0–100 slop score and a short list of what you changed. You do NOT change her ideas, opinions, arguments, numbers, or named entities. You only change phrasing and structure that mark the text as machine-generated.

HARD REPLACEMENTS (always fix if present):
- "delve into" → "look at" / "dig into" / cut
- "unpack" (writing sense) → "break down" / "explain" / cut
- "leverage" (as verb) → "use"
- "holistic", "robust", "seamless", "cutting-edge", "revolutionize" → specific verb/noun or cut
- "actionable insights", "key takeaways", "deep dive" → cut, list the actual things
- "stands as", "serves as", "represents", "boasts" (vague copula) → use "is" / "has" / "does"
- "harness the power of", "unlock the potential", "empower", "foster a culture of" → specific action
- "ecosystem" (not biology) → specific noun
- "double down on" → "invest more in" / "focus on"
- "north star" → "goal" / "priority"
- "at scale" (filler usage) → cut or name the scale
- "it's worth noting that", "it bears mentioning" → just say the thing
- "in an effort to" → "to"
- "at the end of the day", "ultimately, the goal is", "moving forward", "in conclusion" → cut

STRUCTURAL PATTERNS (always rewrite):
- Em dash (—) as a clause separator → use a period or a comma.
- "Not X, Y" / "Not X — Y" / "Not just X, but Y" forced opposition → rewrite as a positive statement.
- Three-item parallel lists (noun, noun, and noun; "the hook, the thesis, and the stakes") → use two or four items, or restructure.
- Opener clichés: "In an era of…", "As AI…", "At its core…", "In today's fast-paced…" → cut or make specific.
- Transition openers: "Moreover,", "Furthermore,", "Importantly,", "Interestingly,", "Notably," → cut and let the content flow.
- Rhetorical opening questions ("So what does this mean?") → answer directly.
- Nominalizations: "the democratization of X", "the emergence of Y", "the acceleration of Z" → use the verb form.
- Hedge chains: "could potentially", "might suggest", "may well be" → direct claim or genuine uncertainty.
- Headline-case buzzword chains ("The Future of AI Moats") → sentence case.
- Excessive adverbs before weak verbs: "quietly underscores", "powerfully demonstrates" → strip the adverb or strengthen the verb.
- Significance inflation: "pivotal moment", "testament to", "indelible mark", "deeply rooted", "sets the stage for" → state the fact.
- Superficial -ing analyses: "highlighting X", "underscoring Y", "showcasing Z" → state cause and effect.
- Promotional vagueness: "profound commitment", "boasts a vibrant", "exemplifies the" → specific facts or cut.
- Vague attributions: "experts argue", "many believe", "industry reports" with no citation → name the source or cut.
- Generic uplift closures: "the future looks bright", "exciting times ahead" → cut.

PRESERVE:
- The core idea, opinion, argument, and specific thesis
- Numbers, named entities (people, companies, products), @-mentions, hashtags she chose, URLs
- First-person perspective and register
- Her substantive vocabulary (moat, concentration risk, orchestration, System of Execution, etc.)
- Length category: if she chose a tight 200-char hook, keep it tight; if a 600-char insight, don't compress it to 100
- Humor, edge, or personality where present

Return **valid JSON only** — no markdown fence, no prose before or after:

{
  "cleaned": "<rewritten text; preserve URL and @-mentions verbatim>",
  "slopScore": <integer 0–100; 100 = already clean, 0 = full AI output>,
  "changes": ["<original phrase> → <replacement>", "<original> → <replacement>", ...]
}

If the input is already clean (90+), return it unchanged with the high score and an empty changes array. "changes" should list at most 6 of the biggest fixes.`;

function extractJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) throw new Error("No JSON object found.");
  return JSON.parse(t.slice(first, last + 1));
}

export async function unslopText(text: string): Promise<UnslopResult> {
  if ((process.env.UNSLOP_PASS ?? "true").toLowerCase() === "false") {
    return { cleaned: text, slopScore: 100, changes: [], skipped: true };
  }
  if (!text?.trim()) {
    return { cleaned: text, slopScore: 100, changes: [], skipped: true };
  }

  const client = getClient();
  const model = process.env.UNSLOP_MODEL ?? "claude-sonnet-5";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system: UNSLOP_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { cleaned: text, slopScore: 50, changes: [], skipped: false };
    }
    const parsed = extractJson(block.text) as {
      cleaned?: unknown;
      slopScore?: unknown;
      changes?: unknown;
    };
    const cleaned = typeof parsed.cleaned === "string" && parsed.cleaned.trim().length > 0
      ? parsed.cleaned
      : text;
    const scoreNum = Number(parsed.slopScore);
    const slopScore = Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : 50;
    const changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((c): c is string => typeof c === "string").slice(0, 6)
      : [];
    return { cleaned, slopScore, changes, skipped: false };
  } catch (err) {
    console.warn("[unslop] pass failed, returning input unchanged:", err);
    return { cleaned: text, slopScore: 50, changes: [], skipped: false };
  }
}
