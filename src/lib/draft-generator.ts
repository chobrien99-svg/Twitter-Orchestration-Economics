import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabase";
import type { FetchedArticle } from "./article-fetcher";

export type DraftVariant = {
  kind: "hook" | "insight" | "thread_start";
  text: string;
  reasoning: string;
};

export type GenerationResult = {
  variants: DraftVariant[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
};

let cachedClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

type ActiveSample = {
  text: string;
  impressions: number | null;
  engagements: number | null;
  likes: number | null;
  reposts: number | null;
};

async function loadActiveVoiceSamples(limit = 15): Promise<ActiveSample[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("voice_samples")
    .select("text, impressions, engagements, likes, reposts")
    .eq("is_active", true)
    .order("engagements", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`Load voice samples failed: ${error.message}`);
  return (data ?? []) as ActiveSample[];
}

function buildSystemPrompt(samples: ActiveSample[]): string {
  const rendered = samples
    .map((s, i) => {
      const bits: string[] = [];
      if (s.engagements != null) bits.push(`${s.engagements} eng`);
      if (s.impressions != null) bits.push(`${s.impressions} impr`);
      if (s.likes != null) bits.push(`${s.likes} likes`);
      if (s.reposts != null) bits.push(`${s.reposts} reposts`);
      const meta = bits.length ? ` [${bits.join(", ")}]` : "";
      return `${i + 1}.${meta} ${s.text.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n\n");

  return `You draft X (Twitter) posts on behalf of Raphaelle d'Ornano (@Raph_dOrnano).

Raphaelle writes on AI concentration risk, orchestration economics, model provider economics, and the emerging moat structure of AI. She publishes long-form analysis at decodingdiscontinuity.com and a book-length manifesto at orchestration-economics.com.

Match her voice using these calibration samples (ranked by engagement). Study them for tone, rhythm, vocabulary, and structure — do not repeat their phrasings.

<voice_samples>
${rendered}
</voice_samples>

Voice characteristics to preserve:
- First-person, reflective, specific — often opens with a scene ("After leaving Dreamforce…", "This week I wrote about…")
- @-mentions relevant people and companies naturally when they belong
- Substantive vocabulary: moats, systemic risk, concentration, orchestration, System of Execution, defensible layer
- Weaves observation with a link to her longer analysis
- Not clickbait, not empty hype, not thread-bait — she assumes an informed reader
- Comfortable with a slightly long form on X (multiple sentences, one clear idea per post)

Output rules:
- Return **valid JSON** — nothing else, no markdown fence, no prose before or after.
- Every text field must be at most 280 characters (X's per-post limit).
- Include the article URL in "hook" and "insight" variants.
- "thread_start" is the first tweet of what could become a thread — hook the reader and clearly imply more depth follows.
- Never fabricate quotes, statistics, or people not present in the article.
- No hashtags unless the article itself uses them.

Response schema:
{
  "variants": [
    { "kind": "hook", "text": "…", "reasoning": "one line on the hook you chose" },
    { "kind": "insight", "text": "…", "reasoning": "one line on the takeaway you distilled" },
    { "kind": "thread_start", "text": "…", "reasoning": "one line on why this opens a thread" }
  ]
}`;
}

function buildUserPrompt(article: FetchedArticle): string {
  const parts: string[] = [];
  parts.push(`Title: ${article.title}`);
  if (article.byline) parts.push(`Byline: ${article.byline}`);
  if (article.siteName) parts.push(`Source: ${article.siteName}`);
  parts.push(`URL: ${article.url}`);
  if (article.excerpt) parts.push(`Excerpt: ${article.excerpt}`);
  parts.push("");
  parts.push("Article body:");
  parts.push(article.textContent);
  parts.push("");
  parts.push(
    "Generate exactly three variants (hook, insight, thread_start) as specified. JSON only.",
  );
  return parts.join("\n");
}

function extractJsonPayload(text: string): unknown {
  // Trim, strip common markdown fences if the model wraps output despite the instruction.
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error(`Could not locate JSON in model output. Raw: ${text.slice(0, 400)}`);
  }
  return JSON.parse(t.slice(first, last + 1));
}

function normalizeVariants(payload: unknown): DraftVariant[] {
  if (!payload || typeof payload !== "object" || !("variants" in payload)) {
    throw new Error("Model response missing 'variants'.");
  }
  const raw = (payload as { variants: unknown }).variants;
  if (!Array.isArray(raw)) throw new Error("'variants' is not an array.");

  const ALLOWED = new Set(["hook", "insight", "thread_start"]);
  const out: DraftVariant[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    const kind = String(rec.kind ?? "");
    const text = String(rec.text ?? "").trim();
    const reasoning = String(rec.reasoning ?? "").trim();
    if (!ALLOWED.has(kind) || !text) continue;
    out.push({ kind: kind as DraftVariant["kind"], text, reasoning });
  }
  if (out.length === 0) throw new Error("No usable variants in model response.");
  return out;
}

export async function generateDrafts(article: FetchedArticle): Promise<GenerationResult> {
  const samples = await loadActiveVoiceSamples();
  if (samples.length === 0) {
    throw new Error(
      "No active voice samples in database. Run `npm run import-voice-samples` or add samples via /voice-samples first.",
    );
  }

  const anthropic = getAnthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: buildSystemPrompt(samples),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(article) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `No text block in model response (stop_reason=${response.stop_reason}). Content types: ${response.content.map((b) => b.type).join(",")}`,
    );
  }

  const variants = normalizeVariants(extractJsonPayload(textBlock.text));

  return {
    variants,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    model: response.model,
  };
}
