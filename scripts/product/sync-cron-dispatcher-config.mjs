const VAULT_VALUES = [
  ["APP_ORIGIN", "Operator-controlled application origin for internal pg_cron callbacks."],
  ["INTERNAL_CRON_TOKEN", "Operator-controlled token for internal pg_cron callbacks."],
];

function normalizeAppOrigin(value) {
  const raw = value?.trim();
  if (!raw) throw new Error("APP_ORIGIN is required to configure the pg_cron dispatcher.");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute HTTP(S) origin.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("APP_ORIGIN must be an origin only, without credentials, path, query, or fragment.");
  }

  return parsed.origin;
}

function validateCronToken(value) {
  const token = value?.trim();
  if (!token || token.length < 32) {
    throw new Error("INTERNAL_CRON_TOKEN must contain at least 32 characters.");
  }
  return token;
}

async function upsertVaultValue(client, name, value, description) {
  const existing = await client.query(
    "SELECT id FROM vault.secrets WHERE name = $1",
    [name],
  );

  if (existing.rows[0]) {
    await client.query(
      "SELECT vault.update_secret($1::uuid, $2, $3, $4)",
      [existing.rows[0].id, value, name, description],
    );
    return;
  }

  await client.query(
    "SELECT vault.create_secret($1, $2, $3)",
    [value, name, description],
  );
}

export async function syncCronDispatcherConfig(
  client,
  { appOrigin, internalCronToken },
) {
  const values = {
    APP_ORIGIN: normalizeAppOrigin(appOrigin),
    INTERNAL_CRON_TOKEN: validateCronToken(internalCronToken),
  };

  await client.query("BEGIN");
  try {
    for (const [name, description] of VAULT_VALUES) {
      await upsertVaultValue(client, name, values[name], description);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
