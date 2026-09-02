import { describe, expect, it } from "vitest";
import { AIError } from "./errors";
import {
  pickRequestedWorkspaceId,
  requireActiveAiWorkspace,
  requireEntityAiWorkspace,
  resolveCallerWorkspaceId,
  type AuthRpcClient,
} from "./workspace-auth";
import { assertProviderTenant, decideProviderTenant, modelBelongsToProvider } from "./provider-tenant";
import { selectAiLogPreviews, stripCredentialShapes } from "./log-privacy";

const WS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WS_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function mockSupabase(memberships: Record<string, { member: boolean; admin: boolean }>): AuthRpcClient {
  return {
    async rpc(fn, args) {
      const ws = String(args._workspace_id ?? "");
      const row = memberships[ws];
      if (fn === "is_workspace_member") return { data: !!row?.member, error: null };
      if (fn === "is_workspace_admin") return { data: !!row?.admin, error: null };
      return { data: false, error: null };
    },
  };
}

describe("pickRequestedWorkspaceId", () => {
  it("prefers explicit input over the active-workspace header", () => {
    expect(pickRequestedWorkspaceId({
      inputWorkspaceId: WS_B,
      headerWorkspaceId: WS_A,
    })).toBe(WS_B);
  });

  it("uses the canonical header when input is omitted", () => {
    expect(pickRequestedWorkspaceId({
      headerWorkspaceId: WS_B,
    })).toBe(WS_B);
  });
});

describe("resolveCallerWorkspaceId", () => {
  it("runs AI in the requested workspace when the user is a member of A and B", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
      [WS_B]: { member: true, admin: false },
    });
    const id = await resolveCallerWorkspaceId({
      supabase,
      userId: "user-1",
      requestedWorkspaceId: WS_B,
      headerWorkspaceId: WS_A,
    });
    expect(id).toBe(WS_B);
  });

  it("rejects a workspace the caller is not a member of", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
    });
    await expect(resolveCallerWorkspaceId({
      supabase,
      userId: "user-1",
      requestedWorkspaceId: WS_C,
      headerWorkspaceId: WS_A,
    })).rejects.toMatchObject({ type: "auth" });
  });

  it("does not fall back to a first membership row when no workspace is selected", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
    });
    await expect(resolveCallerWorkspaceId({
      supabase,
      userId: "user-1",
    })).rejects.toBeInstanceOf(AIError);
  });

  it("requires owner/admin for configuration mutations", async () => {
    const supabase = mockSupabase({
      [WS_B]: { member: true, admin: false },
    });
    await expect(resolveCallerWorkspaceId({
      supabase,
      userId: "user-1",
      requestedWorkspaceId: WS_B,
      requireAdmin: true,
    })).rejects.toMatchObject({ message: expect.stringContaining("owners and admins") });
  });
});

describe("multi-workspace AI resolution", () => {
  it("runs a workspace-wide AI operation in active workspace B", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
      [WS_B]: { member: true, admin: false },
    });
    const id = await resolveCallerWorkspaceId({
      supabase,
      userId: "user-1",
      headerWorkspaceId: WS_B,
    });
    expect(id).toBe(WS_B);
  });

  it("runs entity-scoped AI in the record workspace B even when the user also belongs to A", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
      [WS_B]: { member: true, admin: false },
    });
    const id = await requireEntityAiWorkspace(
      { supabase, userId: "user-1" },
      WS_B,
    );
    expect(id).toBe(WS_B);
  });

  it("rejects a foreign workspace C before provider transport", async () => {
    const supabase = mockSupabase({
      [WS_A]: { member: true, admin: true },
      [WS_B]: { member: true, admin: false },
    });
    await expect(requireActiveAiWorkspace(
      { supabase, userId: "user-1" },
      WS_C,
    )).rejects.toMatchObject({ type: "auth" });
    await expect(requireEntityAiWorkspace(
      { supabase, userId: "user-1" },
      WS_C,
    )).rejects.toMatchObject({ type: "auth" });
  });
});

describe("provider tenant boundary", () => {
  it("executes a provider that belongs to the current workspace", () => {
    expect(decideProviderTenant({
      providerWorkspaceId: WS_B,
      executionWorkspaceId: WS_B,
      explicit: true,
    })).toBe("use");
  });

  it("rejects an explicit primary provider from another workspace", () => {
    expect(() => assertProviderTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
      explicit: true,
    })).toThrow(AIError);
  });

  it("does not execute a cross-workspace fallback; skips non-explicit foreign ids", () => {
    expect(decideProviderTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
      explicit: true,
    })).toBe("reject");
    expect(decideProviderTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
      explicit: false,
    })).toBe("skip");
  });

  it("keeps models bound to the resolved provider", () => {
    expect(modelBelongsToProvider(WS_A, WS_A)).toBe(true);
    expect(modelBelongsToProvider(WS_A, WS_B)).toBe(false);
  });
});

describe("prompt logging privacy", () => {
  it("omits previews when log_prompts is false", () => {
    const out = selectAiLogPreviews({
      logPrompts: false,
      logResponses: true,
      requestPreview: { messages: ["secret"] },
      responsePreview: { content: "ok" },
    });
    expect(out.requestPreview).toBeNull();
    expect(out.responsePreview).toBeNull();
  });

  it("preserves previews when logging is enabled", () => {
    const out = selectAiLogPreviews({
      logPrompts: true,
      logResponses: true,
      requestPreview: { messages: ["hi"] },
      responsePreview: { content: "ok" },
    });
    expect(out.requestPreview).toEqual({ messages: ["hi"] });
    expect(out.responsePreview).toEqual({ content: "ok" });
  });

  it("never leaves credential-shaped values in previews", () => {
    const stripped = stripCredentialShapes("Bearer sk-abc1234567890 AIzaSyDummyKeyValue000000");
    expect(stripped).not.toMatch(/sk-/);
    expect(stripped).not.toMatch(/AIza/);
    expect(stripped).not.toMatch(/Bearer\s+sk/i);
  });
});
