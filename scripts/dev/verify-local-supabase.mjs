import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.LOCAL_DEV_EMAIL ?? "dev@local.test";
const password = process.env.LOCAL_DEV_PASSWORD ?? "LocalDevOnly!2026";

if (!url || !key) throw new Error("Run `npm run dev:env` before local verification.");

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function authenticate(address) {
  const supabase = client();
  const signup = await supabase.auth.signUp({ email: address, password });
  if (signup.error && !/already registered|already exists/i.test(signup.error.message)) {
    throw signup.error;
  }
  const signedIn = await supabase.auth.signInWithPassword({ email: address, password });
  if (signedIn.error || !signedIn.data.user) throw signedIn.error ?? new Error("Sign-in failed");
  return { supabase, user: signedIn.data.user };
}

const primary = await authenticate(email);
const isolationEmail = `isolation-${email}`;
const secondary = await authenticate(isolationEmail);

const profile = await primary.supabase
  .from("profiles")
  .select("id")
  .eq("id", primary.user.id)
  .maybeSingle();
if (profile.error || !profile.data) throw profile.error ?? new Error("Signup profile trigger failed");

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
if (primaryWorkspace === secondaryWorkspace) throw new Error("Users unexpectedly share a personal workspace");

const crossTenant = await primary.supabase
  .from("workspaces")
  .select("id")
  .eq("id", secondaryWorkspace);
if (crossTenant.error) throw crossTenant.error;
if (crossTenant.data.length !== 0) throw new Error("RLS exposed another user's workspace");

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

await Promise.all([
  primary.supabase.auth.signOut({ scope: "local" }),
  secondary.supabase.auth.signOut({ scope: "local" }),
]);

console.log(JSON.stringify({
  auth: true,
  profile_trigger: true,
  workspace_trigger: true,
  cross_tenant_rls: true,
  storage: true,
  realtime: true,
}, null, 2));
process.exit(0);
