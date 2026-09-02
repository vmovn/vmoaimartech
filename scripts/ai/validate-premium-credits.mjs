/**
 * Local PostgreSQL acceptance checks for the Phase 7 Premium Credits engine.
 * Run only against a disposable local Supabase database after `supabase db reset`.
 */
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/127\.0\.0\.1|localhost/.test(connectionString)) {
  throw new Error("Premium Credits validation refuses to run against a non-local database");
}

const pool = new Pool({ connectionString, max: 6 });
const ids = {
  userA: "70000000-0000-0000-0000-000000000001",
  userB: "70000000-0000-0000-0000-000000000002",
  userX: "70000000-0000-0000-0000-000000000003",
  org: "71000000-0000-0000-0000-000000000001",
  otherOrg: "71000000-0000-0000-0000-000000000002",
  workspace: "72000000-0000-0000-0000-000000000001",
  otherWorkspace: "72000000-0000-0000-0000-000000000002",
  provider: "73000000-0000-0000-0000-000000000001",
  otherProvider: "73000000-0000-0000-0000-000000000002",
  plan: "74000000-0000-0000-0000-000000000001",
  otherPlan: "74000000-0000-0000-0000-000000000002",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  await pool.query("delete from public.organizations where id = any($1::uuid[])", [[ids.org, ids.otherOrg]]);
  await pool.query("delete from public.plans where id = any($1::uuid[])", [[ids.plan, ids.otherPlan]]);
  await pool.query("set session_replication_role = replica");
  try {
    await pool.query("delete from auth.users where id = any($1::uuid[])", [[ids.userA, ids.userB, ids.userX]]);
  } finally {
    await pool.query("set session_replication_role = origin");
  }
}

async function setup() {
  await cleanup();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
      values
        ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p7-a@example.test', '', now(), now()),
        ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p7-b@example.test', '', now(), now()),
        ($3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p7-x@example.test', '', now(), now())
    `, [ids.userA, ids.userB, ids.userX]);
    await client.query(`
      insert into public.organizations (id, name, slug, owner_id) values
        ($1, 'P7 Test Org', 'p7-test-org', $2),
        ($3, 'P7 Other Org', 'p7-other-org', $4)
    `, [ids.org, ids.userA, ids.otherOrg, ids.userX]);
    await client.query(`
      insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'member'), ($4, $5, 'owner')
    `, [ids.org, ids.userA, ids.userB, ids.otherOrg, ids.userX]);
    await client.query(`
      insert into public.workspaces (id, name, slug, owner_id, organization_id) values
        ($1, 'P7 Workspace', 'p7-workspace', $2, $3),
        ($4, 'P7 Other Workspace', 'p7-other-workspace', $5, $6)
    `, [ids.workspace, ids.userA, ids.org, ids.otherWorkspace, ids.userX, ids.otherOrg]);
    await client.query(`
      insert into public.workspace_members (workspace_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'agent'), ($4, $5, 'owner')
    `, [ids.workspace, ids.userA, ids.userB, ids.otherWorkspace, ids.userX]);
    await client.query(`
      insert into public.ai_providers (id, workspace_id, kind, name, enabled, config) values
        ($1, $2, 'gemini', 'P7 Platform Gemini', true, '{"credential_source":"platform_env"}'),
        ($3, $4, 'gemini', 'P7 Other Gemini', true, '{"credential_source":"platform_env"}')
    `, [ids.provider, ids.workspace, ids.otherProvider, ids.otherWorkspace]);
    await client.query(`
      insert into public.ai_models
        (provider_id, model_id, display_name, enabled, input_cost_per_1k, output_cost_per_1k)
      values
        ($1, 'premium-model', 'Premium Model', true, 0.001, 0.003),
        ($2, 'premium-model', 'Other Premium Model', true, 0.001, 0.003)
    `, [ids.provider, ids.otherProvider]);
    await client.query(`
      insert into public.plans (id, code, name, tier, limits) values
        ($1, 'p7_test', 'P7 Test', 'custom', '{"ai_premium_credits":100}'),
        ($2, 'p7_unconfigured', 'P7 Unconfigured', 'custom', '{}')
    `, [ids.plan, ids.otherPlan]);
    await client.query(`
      insert into public.subscriptions
        (organization_id, plan_id, status, current_period_start, current_period_end)
      values
        ($1, $2, 'active', date_trunc('second', now() - interval '1 day'), date_trunc('second', now() + interval '30 days')),
        ($3, $4, 'active', date_trunc('second', now() - interval '1 day'), date_trunc('second', now() + interval '30 days'))
    `, [ids.org, ids.plan, ids.otherOrg, ids.otherPlan]);
    await client.query(`
      insert into public.tenant_quotas
        (organization_id, meter_code, period_start, period_end, used, included, hard_limit)
      select organization_id, 'ai_premium_credits', current_period_start, current_period_end, 0, 100, 100
      from public.subscriptions where organization_id = $1
    `, [ids.org]);
    await client.query(`
      insert into public.ai_user_credit_limits
        (workspace_id, user_id, monthly_credit_limit, updated_by)
      values ($1, $2, 20, $3), ($4, $5, 20, $5)
    `, [ids.workspace, ids.userA, ids.userA, ids.otherWorkspace, ids.userX]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function reserve(requestId, credits, userId = null, workspaceId = ids.workspace, providerId = ids.provider) {
  const result = await pool.query(
    "select public.reserve_ai_premium_credits($1,$2,$3,'p7-test',$4,'premium-model',$5,900) value",
    [requestId, workspaceId, userId, providerId, credits],
  );
  return result.rows[0].value;
}

async function used() {
  const result = await pool.query(
    "select used::int value from public.tenant_quotas where organization_id=$1 and meter_code='ai_premium_credits' order by period_start desc limit 1",
    [ids.org],
  );
  return result.rows[0]?.value ?? null;
}

async function resetUsage() {
  await pool.query("delete from public.ai_credit_reservations where organization_id=$1", [ids.org]);
  await pool.query("delete from public.usage_events where organization_id=$1 and meter_code='ai_premium_credits'", [ids.org]);
  await pool.query("update public.tenant_quotas set used=0 where organization_id=$1 and meter_code='ai_premium_credits'", [ids.org]);
}

async function run() {
  await setup();
  try {
    const poolReservation = await reserve("p7-pool", 10);
    assert(poolReservation.ok && poolReservation.remaining === 90, "organization pool did not reserve 10 from 100");
    assert(await used() === 10, "organization quota did not reach 10");
    const duplicateReservation = await reserve("p7-pool", 10);
    assert(duplicateReservation.idempotent === true && await used() === 10, "duplicate request reservation changed the pool");
    const settled = await pool.query("select public.settle_ai_premium_credits($1,6,false,$2::jsonb) value", ["p7-pool", JSON.stringify({ provider_kind: "gemini", estimated_cost_usd: 0.006 })]);
    assert(settled.rows[0].value.released_credits === 4 && await used() === 6, "settlement did not release 4 credits");

    await resetUsage();
    await pool.query("update public.tenant_quotas set included=10, hard_limit=10 where organization_id=$1 and meter_code='ai_premium_credits'", [ids.org]);
    const concurrent = await Promise.all([reserve("p7-concurrent-a", 8), reserve("p7-concurrent-b", 8)]);
    assert(concurrent.filter((value) => value.ok).length === 1, `concurrent reservation result was unsafe: ${JSON.stringify(concurrent)}`);
    assert(await used() === 8, "concurrent reservation quota is not 8");

    await resetUsage();
    await pool.query("update public.tenant_quotas set included=100, hard_limit=100 where organization_id=$1 and meter_code='ai_premium_credits'", [ids.org]);
    await reserve("p7-overrun", 10);
    await pool.query("select public.settle_ai_premium_credits($1,15,false,'{}'::jsonb)", ["p7-overrun"]);
    assert(await used() === 15, "actual-above-reserve usage was not recorded");

    await resetUsage();
    await reserve("p7-provider-failure", 10);
    await pool.query("select public.release_ai_premium_credits($1)", ["p7-provider-failure"]);
    assert(await used() === 0, "provider failure did not release its reservation");

    await reserve("p7-missing-usage", 10);
    await pool.query("select public.settle_ai_premium_credits($1,10,true,'{}'::jsonb)", ["p7-missing-usage"]);
    const estimated = await pool.query("select usage_estimated, settled_credits from public.ai_credit_reservations where request_id=$1", ["p7-missing-usage"]);
    assert(estimated.rows[0].usage_estimated && Number(estimated.rows[0].settled_credits) === 10, "missing usage did not charge the reservation");

    await pool.query("select public.settle_ai_premium_credits($1,10,true,'{}'::jsonb)", ["p7-missing-usage"]);
    const eventCount = await pool.query("select count(*)::int value from public.usage_events where idempotency_key=$1", ["ai-credit:p7-missing-usage:actual"]);
    assert(eventCount.rows[0].value === 1 && await used() === 10, "duplicate settlement charged more than once");
    const safeEvent = await pool.query("select metadata from public.usage_events where idempotency_key=$1", ["ai-credit:p7-missing-usage:actual"]);
    assert(safeEvent.rows[0].metadata.execution_mode === "premium_credits" && safeEvent.rows[0].metadata.credits === 10, "usage event metadata is incomplete");
    assert(!("api_key" in safeEvent.rows[0].metadata) && !("prompt" in safeEvent.rows[0].metadata) && !("response" in safeEvent.rows[0].metadata), "usage event contains sensitive AI data");

    await resetUsage();
    await reserve("p7-user-a-full", 20, ids.userA);
    await pool.query("select public.settle_ai_premium_credits($1,20,false,'{}'::jsonb)", ["p7-user-a-full"]);
    const blockedA = await reserve("p7-user-a-blocked", 1, ids.userA);
    const allowedB = await reserve("p7-user-b-allowed", 1, ids.userB);
    assert(blockedA.reason === "user_premium_credits_exhausted" && allowedB.ok, "user ceiling blocked the wrong effective pool");

    await resetUsage();
    await reserve("p7-expired", 8);
    await pool.query("update public.ai_credit_reservations set expires_at=now()-interval '1 second' where request_id=$1", ["p7-expired"]);
    const expired = await pool.query("select public.release_expired_ai_credit_reservations($1,now()) value", [ids.org]);
    assert(expired.rows[0].value === 1 && await used() === 0, "expired reservation was not reclaimed");

    const wrongUser = await reserve("p7-cross-user", 1, ids.userA, ids.otherWorkspace, ids.otherProvider);
    const wrongProvider = await reserve("p7-cross-provider", 1, null, ids.workspace, ids.otherProvider);
    assert(wrongUser.reason === "user_workspace_mismatch" && wrongProvider.reason === "provider_workspace_mismatch", "cross-tenant reserve was not denied");
    const unconfiguredPlan = await reserve("p7-unconfigured-plan", 1, null, ids.otherWorkspace, ids.otherProvider);
    assert(unconfiguredPlan.reason === "premium_credits_unconfigured", "plan without an explicit Premium Credit allowance did not fail closed");

    await pool.query("delete from public.tenant_quotas where organization_id=$1 and meter_code='ai_premium_credits'", [ids.org]);
    const missingQuota = await reserve("p7-missing-quota", 1);
    assert(missingQuota.reason === "premium_credits_unavailable", "missing Premium Credit quota did not fail closed");

    await pool.query(`
      update public.subscriptions
      set current_period_start=date_trunc('second',now()), current_period_end=date_trunc('second',now()+interval '30 days')
      where organization_id=$1
    `, [ids.org]);
    await pool.query(`
      insert into public.tenant_quotas
        (organization_id,meter_code,period_start,period_end,used,included,hard_limit)
      select organization_id,'ai_premium_credits',current_period_start,current_period_end,0,100,100
      from public.subscriptions where organization_id=$1
    `, [ids.org]);
    const renewed = await reserve("p7-renewed-period", 10);
    assert(renewed.ok && renewed.remaining === 90, "new subscription period did not restore its configured allowance");

    const privilege = await pool.query("select has_function_privilege('authenticated','public.reserve_ai_premium_credits(text,uuid,uuid,text,uuid,text,bigint,integer)','EXECUTE') value");
    assert(privilege.rows[0].value === false, "authenticated role can execute the financial reservation RPC");
    const rls = await pool.connect();
    try {
      await rls.query("begin");
      await rls.query("set local role authenticated");
      await rls.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.userA, role: "authenticated" })]);
      const crossLimits = await rls.query("select count(*)::int value from public.ai_user_credit_limits where workspace_id=$1", [ids.otherWorkspace]);
      assert(crossLimits.rows[0].value === 0, "cross-workspace user limits are visible through RLS");
      await rls.query("rollback");
    } finally {
      rls.release();
    }

    console.log("Premium Credits SQL validation: PASS");
  } finally {
    await cleanup();
  }
}

run().finally(() => pool.end());
