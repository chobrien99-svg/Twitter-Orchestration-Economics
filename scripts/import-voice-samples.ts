/**
 * Import Raphaelle's top-performing X posts from
 * data/x_content_analytics.csv into the voice_samples table.
 *
 *   npm run import-voice-samples
 *   npm run import-voice-samples -- --top 25 --dry-run
 *
 * Heuristics:
 *  - Skip @-replies (posts whose text starts with "@").
 *  - Skip posts under a minimum impressions threshold (default 100).
 *  - Rank remaining by engagements desc; take the top N (default 15).
 *  - Insert each with x_post_id (upsert on that column) so re-running
 *    the importer refreshes metrics without dupes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServiceSupabase } from "../src/lib/supabase";

const CSV_PATH = resolve(process.cwd(), "data/x_content_analytics.csv");
const MIN_IMPRESSIONS = 100;

type Args = { top: number; dryRun: boolean };
function parseArgs(argv: string[]): Args {
  let top = 15;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--top") top = parseInt(argv[++i], 10);
    else if (a === "--dry-run") dryRun = true;
  }
  return { top, dryRun };
}

// RFC-4180-ish CSV parser: handles quoted fields with embedded commas
// and doubled quotes. X's export is well-formed, this is enough.
function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type ContentRow = {
  postId: string;
  date: string;
  text: string;
  url: string;
  impressions: number;
  likes: number;
  engagements: number;
  bookmarks: number;
  shares: number;
  replies: number;
  reposts: number;
  urlClicks: number;
  detailExpands: number;
};

function toInt(v: string | undefined): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error("CSV appears empty.");
    process.exit(1);
  }

  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iId = idx("Post id");
  const iDate = idx("Date");
  const iText = idx("Post text");
  const iUrl = idx("Post Link");
  const iImpr = idx("Impressions");
  const iLikes = idx("Likes");
  const iEng = idx("Engagements");
  const iBook = idx("Bookmarks");
  const iShares = idx("Shares");
  const iReplies = idx("Replies");
  const iReposts = idx("Reposts");
  const iUrlClicks = idx("URL Clicks");
  const iDetail = idx("Detail Expands");

  const parsed: ContentRow[] = rows.slice(1).map((r) => ({
    postId: r[iId],
    date: r[iDate],
    text: r[iText] ?? "",
    url: r[iUrl] ?? "",
    impressions: toInt(r[iImpr]),
    likes: toInt(r[iLikes]),
    engagements: toInt(r[iEng]),
    bookmarks: toInt(r[iBook]),
    shares: toInt(r[iShares]),
    replies: toInt(r[iReplies]),
    reposts: toInt(r[iReposts]),
    urlClicks: toInt(r[iUrlClicks]),
    detailExpands: toInt(r[iDetail]),
  }));

  const filtered = parsed.filter((r) => {
    if (!r.text || r.text.trim().length === 0) return false;
    if (r.text.trimStart().startsWith("@")) return false; // reply
    if (r.impressions < MIN_IMPRESSIONS) return false;
    return true;
  });

  filtered.sort((a, b) => b.engagements - a.engagements);
  const top = filtered.slice(0, args.top);

  console.log(
    `${parsed.length} rows in CSV → ${filtered.length} eligible → picking top ${top.length}`,
  );

  if (args.dryRun) {
    for (const r of top) {
      console.log(
        `[${r.engagements} eng · ${r.impressions} impr] ${r.text.slice(0, 100)}...`,
      );
    }
    return;
  }

  const supabase = getServiceSupabase();
  const payload = top.map((r) => ({
    x_post_id: r.postId,
    post_url: r.url,
    text: r.text,
    posted_at: new Date(r.date).toISOString(),
    impressions: r.impressions,
    likes: r.likes,
    engagements: r.engagements,
    reposts: r.reposts,
    replies: r.replies,
    bookmarks: r.bookmarks,
    url_clicks: r.urlClicks,
    detail_expands: r.detailExpands,
    is_active: true,
  }));

  const { error, count } = await supabase
    .from("voice_samples")
    .upsert(payload, { onConflict: "x_post_id", count: "exact" });
  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }
  console.log(`Upserted ${count ?? payload.length} voice samples.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
