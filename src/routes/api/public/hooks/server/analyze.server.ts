export async function fetchPendingConversations(workspaceId?: string, limit = 25) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase not configured");
  }

  const params = new URLSearchParams();
  params.set("select", "conversation_id,workspace_id");
  params.set("needs_reanalysis", "eq.true");
  params.set("order", "last_message_at.desc.nullslast");
  params.set("limit", String(limit));
  if (workspaceId) params.set("workspace_id", `eq.${workspaceId}`);

  const res = await fetch(
    `${url}/rest/v1/conversation_intelligence?${params.toString()}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  return (await res.json()) as Array<{
    conversation_id: string;
    workspace_id: string;
  }>;
}
