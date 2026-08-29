/**
 * Server-only helper that calls the Lovable AI Gateway embeddings endpoint.
 * We use openai/text-embedding-3-small (1536 dims) so we can index directly
 * with pgvector's HNSW cosine ops.
 */

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMS = 1536;

// OpenAI text-embedding-3-* supports up to 2048 inputs and 300k tokens per request.
const BATCH_SIZE = 96;

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const out: number[][] = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding request failed (${res.status}): ${body || res.statusText}`);
    }
    const json: {
      data: Array<{ index: number; embedding: number[] }>;
    } = await res.json();
    for (const row of json.data) {
      out[i + row.index] = row.embedding;
    }
  }
  return out;
}

export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embedTexts([input]);
  return v;
}

// Format a JS number[] as a pgvector literal: "[0.1,0.2,...]"
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}
