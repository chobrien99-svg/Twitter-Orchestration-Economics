import { listContentSources, listVoiceSamples } from "@/lib/queries";
import { VoiceSamplesUI } from "./VoiceSamplesUI";

export const dynamic = "force-dynamic";

export default async function VoiceSamplesPage() {
  const [samples, sources] = await Promise.all([listVoiceSamples(), listContentSources()]);
  return (
    <>
      <h1 style={{ marginTop: 0 }}>Voice samples</h1>
      <p className="meta-line">
        Raphaelle&apos;s best-performing posts. The LLM draft generator (next
        session) will read these to match tone. Toggle a sample off if you
        don&apos;t want it influencing style.
      </p>
      <VoiceSamplesUI samples={samples} sources={sources} />
    </>
  );
}
