import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Run `npm run dev:env` before local verification.");
}

const fixturePassword = `Fixture-${randomBytes(24).toString("base64url")}!9aA`;
const fixtureAddresses = [
  `fixture-${randomUUID()}@example.invalid`,
  `fixture-${randomUUID()}@example.invalid`,
];
const fixtureUserIds = [];
const fixtureClients = [];
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function client() {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function authenticate(address) {
  const supabase = client();
  const signup = await supabase.auth.signUp({ email: address, password: fixturePassword });
  if (signup.error || !signup.data.user) {
    throw signup.error ?? new Error("Ephemeral fixture signup failed");
  }
  fixtureUserIds.push(signup.data.user.id);
  fixtureClients.push(supabase);

  const signedIn = await supabase.auth.signInWithPassword({
    email: address,
    password: fixturePassword,
  });
  if (signedIn.error || !signedIn.data.user)
    throw signedIn.error ?? new Error("Fixture sign-in failed");
  return { supabase, user: signedIn.data.user };
}

async function removeFixtureUser(userId) {
  const prepared = await admin.rpc("prepare_platform_user_deletion", { _user_id: userId });
  if (prepared.error)
    throw new Error(`Fixture cleanup preparation failed: ${prepared.error.message}`);
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw new Error(`Fixture cleanup failed: ${deleted.error.message}`);
}

async function cleanupFixtures() {
  await Promise.allSettled(
    fixtureClients.map((supabase) => supabase.auth.signOut({ scope: "local" })),
  );
  const cleanupErrors = [];
  for (const userId of [...fixtureUserIds].reverse()) {
    try {
      await removeFixtureUser(userId);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (cleanupErrors.length > 0) throw new Error(cleanupErrors.join("; "));
}

let verificationError;
try {
  const primary = await authenticate(fixtureAddresses[0]);
  const secondary = await authenticate(fixtureAddresses[1]);

  const profile = await primary.supabase
    .from("profiles")
    .select("id")
    .eq("id", primary.user.id)
    .maybeSingle();
  if (profile.error || !profile.data)
    throw profile.error ?? new Error("Signup profile trigger failed");

  const primaryMemberships = await primary.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", primary.user.id);
  if (primaryMemberships.error || primaryMemberships.data.length !== 1) {
    throw primaryMemberships.error ?? new Error("Primary workspace provisioning failed");
  }

  const secondaryMemberships = await secondary.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", secondary.user.id);
  if (secondaryMemberships.error || secondaryMemberships.data.length !== 1) {
    throw secondaryMemberships.error ?? new Error("Secondary workspace provisioning failed");
  }

  const primaryWorkspace = primaryMemberships.data[0].workspace_id;
  const secondaryWorkspace = secondaryMemberships.data[0].workspace_id;
  if (primaryWorkspace === secondaryWorkspace)
    throw new Error("Fixtures unexpectedly share a personal workspace");

  const crossTenant = await primary.supabase
    .from("workspaces")
    .select("id")
    .eq("id", secondaryWorkspace);
  if (crossTenant.error) throw crossTenant.error;
  if (crossTenant.data.length !== 0) throw new Error("RLS exposed another fixture workspace");

  const objectPath = `${primary.user.id}/baseline-${Date.now()}.txt`;
  const upload = await primary.supabase.storage
    .from("avatars")
    .upload(objectPath, new Blob(["local baseline"]), { contentType: "text/plain" });
  if (upload.error) throw upload.error;

  const signed = await primary.supabase.storage.from("avatars").createSignedUrl(objectPath, 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Signed URL failed");
  const download = await primary.supabase.storage.from("avatars").download(objectPath);
  if (download.error || (await download.data.text()) !== "local baseline") {
    throw download.error ?? new Error("Storage download verification failed");
  }
  const remove = await primary.supabase.storage.from("avatars").remove([objectPath]);
  if (remove.error) throw remove.error;

  const channel = primary.supabase
    .channel(`baseline-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
  await primary.supabase.removeChannel(channel);
} catch (error) {
  verificationError = error;
} finally {
  try {
    await cleanupFixtures();
  } catch (cleanupError) {
    if (verificationError) {
      throw new AggregateError(
        [verificationError, cleanupError],
        "Verification and fixture cleanup failed",
      );
    }
    throw cleanupError;
  }
}

if (verificationError) throw verificationError;

console.log(
  JSON.stringify(
    {
      auth: true,
      profile_trigger: true,
      workspace_trigger: true,
      cross_tenant_rls: true,
      storage: true,
      realtime: true,
      fixtures_removed: true,
    },
    null,
    2,
  ),
);
