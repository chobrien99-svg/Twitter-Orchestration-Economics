import { listContentSources } from "@/lib/queries";
import { ComposeForm } from "./ComposeForm";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const sources = await listContentSources();
  return (
    <>
      <h1 style={{ marginTop: 0 }}>Compose</h1>
      <p className="meta-line">
        Write a post, pick which publication it&apos;s tied to, and either save
        as a draft or approve it for the next publisher tick.
      </p>
      <ComposeForm sources={sources} />
    </>
  );
}
