/**
 * Google Calendar provider — uses the Google Calendar App User Connector.
 *
 * The App User Connector must be provisioned via `connector_app_user--connect_client`
 * with connectorId "google_calendar" and scope
 *   https://www.googleapis.com/auth/calendar
 * Once provisioned, the host authorizes their own account via the connect
 * popup and the resulting lovack_* key is encrypted into calendar_accounts.
 */
import type { CalendarProvider, ProviderContext, BusyBlock, ExternalEvent, CalendarListItem } from "./types";
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";

const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

async function gfetch(ctx: ProviderContext, path: string, init?: RequestInit) {
  if (!ctx.connectionKey) throw new Error("Google Calendar not connected");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY,
    connectionAPIKey: ctx.connectionKey,
    connectorId: CONNECTOR_ID,
    path,
    init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const googleCalendarProvider: CalendarProvider = {
  kind: "google",

  async listCalendars(ctx) {
    const data = await gfetch(ctx, "/calendar/v3/users/me/calendarList");
    return ((data.items ?? []) as Array<Record<string, unknown>>).map<CalendarListItem>((c) => ({
      id: String(c.id),
      name: String(c.summary ?? c.id),
      primary: Boolean(c.primary),
      color: (c.backgroundColor as string | undefined) ?? null,
      read_only: c.accessRole === "reader" || c.accessRole === "freeBusyReader",
    }));
  },

  async listBusy(ctx, fromISO, toISO) {
    const calId = encodeURIComponent(ctx.calendarId ?? "primary");
    const params = new URLSearchParams({
      timeMin: fromISO,
      timeMax: toISO,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: "500",
    });
    const data = await gfetch(ctx, `/calendar/v3/calendars/${calId}/events?${params.toString()}`);
    return ((data.items ?? []) as Array<Record<string, unknown>>)
      .filter((e) => e.status !== "cancelled" && (e.transparency ?? "opaque") === "opaque")
      .map<BusyBlock>((e) => {
        const start = (e.start as { dateTime?: string; date?: string } | undefined) ?? {};
        const end = (e.end as { dateTime?: string; date?: string } | undefined) ?? {};
        return {
          start_at: start.dateTime ?? `${start.date}T00:00:00Z`,
          end_at: end.dateTime ?? `${end.date}T23:59:59Z`,
          external_id: String(e.id),
          title: (e.summary as string | undefined) ?? "Busy",
        };
      });
  },

  async createEvent(ctx, event) {
    const calId = encodeURIComponent(ctx.calendarId ?? "primary");
    const body = buildGoogleEvent(event);
    const data = await gfetch(ctx, `/calendar/v3/calendars/${calId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { external_id: String(data.id) };
  },

  async updateEvent(ctx, externalId, event) {
    const calId = encodeURIComponent(ctx.calendarId ?? "primary");
    await gfetch(ctx, `/calendar/v3/calendars/${calId}/events/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGoogleEvent(event)),
    });
  },

  async deleteEvent(ctx, externalId) {
    const calId = encodeURIComponent(ctx.calendarId ?? "primary");
    if (!ctx.connectionKey) return;
    await callAsAppUser({
      gatewayBaseUrl: GATEWAY,
      connectionAPIKey: ctx.connectionKey,
      connectorId: CONNECTOR_ID,
      path: `/calendar/v3/calendars/${calId}/events/${encodeURIComponent(externalId)}`,
      init: { method: "DELETE" },
    });
  },
};

function buildGoogleEvent(event: ExternalEvent) {
  const tz = event.timezone ?? "UTC";
  return {
    summary: event.title,
    description: [event.description, event.join_url].filter(Boolean).join("\n\n"),
    location: event.location ?? undefined,
    start: { dateTime: event.start_at, timeZone: tz },
    end: { dateTime: event.end_at, timeZone: tz },
    attendees: (event.attendees ?? []).map((email) => ({ email })),
    conferenceData: event.join_url ? undefined : undefined,
    reminders: { useDefault: true },
  };
}
