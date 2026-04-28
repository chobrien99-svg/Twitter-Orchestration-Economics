/**
 * Run the publisher worker once, locally, without waiting for cron.
 * Useful for testing: `npm run draft -- "hello"` then `npm run publish-now`.
 */
import { runPublisher } from "../src/lib/publisher";

async function main() {
  const summary = await runPublisher();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
