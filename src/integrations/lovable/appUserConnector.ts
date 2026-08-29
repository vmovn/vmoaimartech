/**
 * App User Connector helpers — server-only.
 * See tanstack-app-user-connector knowledge for the full contract.
 */

function requireApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  return key;
}

export interface AppUserOAuthAuthorizeParams {
  gatewayBaseUrl: string;
  connectorId: string;
  appUserId: string;
  clientAPIKey: string;
  returnUrl: string;
  credentialsConfiguration?: Record<string, unknown>;
  responseMode?: "redirect" | "web_message";
  webMessageTargetOrigin?: string;
}

export async function authorizeAppUserOAuth(params: AppUserOAuthAuthorizeParams) {
  const res = await fetch(`${params.gatewayBaseUrl}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
      "X-Client-Api-Key": params.clientAPIKey,
    },
    body: JSON.stringify({
      connector_id: params.connectorId,
      app_user_id: params.appUserId,
      return_url: params.returnUrl,
      credentials_configuration: params.credentialsConfiguration,
      response_mode: params.responseMode,
      web_message_target_origin: params.webMessageTargetOrigin,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth start failed (${res.status}): ${text.slice(0, 200)}`);
  const body = JSON.parse(text) as { authorization_url?: string; session_id?: string };
  if (!body.authorization_url) throw new Error("Missing authorization_url");
  return { authorizationUrl: body.authorization_url, sessionId: body.session_id ?? "" };
}

export interface CallAsAppUserParams {
  gatewayBaseUrl: string;
  connectionAPIKey: string;
  connectorId: string;
  path: string;
  init?: RequestInit;
}

export async function callAsAppUser({ gatewayBaseUrl, connectionAPIKey, connectorId, path, init }: CallAsAppUserParams) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${requireApiKey()}`);
  headers.set("X-Connection-Api-Key", connectionAPIKey);
  return fetch(`${gatewayBaseUrl}/${connectorId}${normalized}`, { ...init, headers });
}

export async function disconnectAppUser(gatewayBaseUrl: string, connectionAPIKey: string, connectorId: string) {
  await fetch(`${gatewayBaseUrl}/api/v1/app-users/connection`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "X-Connection-Api-Key": connectionAPIKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ connector_id: connectorId }),
  });
}
