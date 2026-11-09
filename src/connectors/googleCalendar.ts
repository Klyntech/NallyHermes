import { google, calendar_v3 } from "googleapis";
import { config } from "../config.js";
import type { CalendarConnector, CalendarCreateInput, CalendarEvent, CalendarListInput, ConnectorContext } from "./types.js";

function allowedTelegramIds(): Set<string> {
  return new Set(config.GOOGLE_CALENDAR_TELEGRAM_IDS.split(",").map((id) => id.trim()).filter(Boolean));
}

function toEvent(event: calendar_v3.Schema$Event, source: string): CalendarEvent {
  const start = event.start?.dateTime ?? event.start?.date ?? "";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  return {
    id: event.id ?? "",
    title: event.summary ?? "Untitled event",
    description: event.description ?? undefined,
    start,
    end,
    timezone: event.start?.timeZone ?? "UTC",
    location: event.location ?? undefined,
    attendees: event.attendees?.flatMap((attendee) => attendee.email ? [attendee.email] : []),
    source,
    readonly: false
  };
}

function eventResource(input: Partial<CalendarCreateInput>): calendar_v3.Schema$Event {
  const resource: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) resource.summary = input.title;
  if (input.description !== undefined) resource.description = input.description;
  if (input.location !== undefined) resource.location = input.location;
  if (input.attendees !== undefined) resource.attendees = input.attendees.map((email) => ({ email }));
  if (input.start !== undefined) resource.start = { dateTime: input.start, timeZone: input.timezone };
  if (input.end !== undefined) resource.end = { dateTime: input.end, timeZone: input.timezone };
  return resource;
}

export function createGoogleCalendarConnector(): CalendarConnector | null {
  if (!config.GOOGLE_CALENDAR_ENABLED || !config.GOOGLE_CALENDAR_CLIENT_ID || !config.GOOGLE_CALENDAR_CLIENT_SECRET || !config.GOOGLE_CALENDAR_REFRESH_TOKEN) return null;

  const allowed = allowedTelegramIds();
  const oauth = new google.auth.OAuth2(config.GOOGLE_CALENDAR_CLIENT_ID, config.GOOGLE_CALENDAR_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: config.GOOGLE_CALENDAR_REFRESH_TOKEN });
  const api = google.calendar({ version: "v3", auth: oauth });
  const calendarId = config.GOOGLE_CALENDAR_ID;
  const source = "google_calendar";

  function assertAllowed(context: ConnectorContext): void {
    if (!allowed.has(context.telegramId)) throw new Error("Google Calendar is not enabled for this Telegram user.");
  }

  return {
    id: "calendar",
    provider: "google_calendar",
    capabilities: new Set(["read", "write"]),
    async listEvents(context, input: CalendarListInput) {
      assertAllowed(context);
      const response = await api.events.list({
        calendarId: input.calendarId ?? calendarId,
        timeMin: new Date(input.from).toISOString(),
        timeMax: new Date(input.to).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100
      });
      return (response.data.items ?? []).filter((event) => event.status !== "cancelled").map((event) => toEvent(event, source));
    },
    async createEvent(context, input: CalendarCreateInput) {
      assertAllowed(context);
      const response = await api.events.insert({ calendarId: input.calendarId ?? calendarId, requestBody: eventResource(input), sendUpdates: "all" });
      if (!response.data.id) throw new Error("Google Calendar did not return an event ID.");
      return toEvent(response.data, source);
    },
    async updateEvent(context, eventId, input) {
      assertAllowed(context);
      const response = await api.events.patch({ calendarId: input.calendarId ?? calendarId, eventId, requestBody: eventResource(input), sendUpdates: "all" });
      return toEvent(response.data, source);
    },
    async cancelEvent(context, eventId) {
      assertAllowed(context);
      await api.events.patch({ calendarId, eventId, requestBody: { status: "cancelled" }, sendUpdates: "all" });
      return { cancelled: true, event_id: eventId };
    }
  };
}
