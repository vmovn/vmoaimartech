/**
 * Server-only helper that uses the configured workspace provider through the
 * shared AI registry. The existing pgvector schema requires 1536 dimensions.
 */

import { runEmbed } from "@/lib/ai/complete.functions";

export const EMBED_DIMS = 1536;

// OpenAI text-embedding-3-* supports up to 2048 inputs and 300k tokens per request.
const BATCH_SIZE = 96;

export async function embedTexts(
  workspaceId: string,
  inputs: string[],
): Promise<{ vectors: number[][]; model: string }> {
  if (!inputs.length) return { vectors: [], model: "" };

  const out: number[][] = new Array(inputs.length);
  let model = "";
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const response = await runEmbed({
      workspaceId,
      feature: "knowledge_base_embedding",
      input: batch,
    });
    model = response.model;
    for (let index = 0; index < response.embeddings.length; index += 1) {
      const vector = response.embeddings[index];
      if (vector.length !== EMBED_DIMS) {
        throw new Error(
          `Configured embedding model "${model}" returned ${vector.length} dimensions; ${EMBED_DIMS} are required`,
        );
      }
      out[i + index] = vector;
    }
  }
  return { vectors: out, model };
}

export async function embedOne(workspaceId: string, input: string): Promise<number[]> {
  const { vectors: [v] } = await embedTexts(workspaceId, [input]);
  return v;
}

// Format a JS number[] as a pgvector literal: "[0.1,0.2,...]"
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}
