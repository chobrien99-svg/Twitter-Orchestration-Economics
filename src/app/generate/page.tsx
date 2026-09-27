import { GenerateUI } from "./GenerateUI";

export const dynamic = "force-dynamic";

export default function GeneratePage() {
  return (
    <>
      <h1 style={{ marginTop: 0 }}>Generate from article</h1>
      <p className="meta-line">
        Paste a Decoding Discontinuity or Orchestration Economics article URL.
        Claude reads it, matches it against Raphaelle&apos;s voice samples, and
        drafts three variants — a hook post, an insight post, and a thread
        starter. All three land as unapproved drafts you can edit before
        publishing.
      </p>
      <GenerateUI />
    </>
  );
}
