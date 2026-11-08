import { connectorRegistry, connectorUnavailableMessage } from "../connectors/registry.js";
import type { CalendarCreateInput, CalendarListInput } from "../connectors/types.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type CalendarOperation = "list" | "create" | "update" | "cancel";

export interface CalendarInput {
  operation: CalendarOperation;
  from?: string;
  to?: string;
  title?: string;
  start?: string;
  end?: string;
  timezone?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  calendar_id?: string;
  event_id?: string;
}

async function userContext(telegramId: string): Promise<{ telegramId: string; userId: string }> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("User profile is not ready yet.");
  return { telegramId, userId: user.id };
}

function required(input: CalendarInput, fields: string[]): void {
  for (const field of fields) {
    if (!input[field as keyof CalendarInput]) throw new Error(`Calendar ${field} is required.`);
  }
}

export async function calendarTool(telegramId: string, input: CalendarInput): Promise<unknown> {
  const context = await userContext(telegramId);
  const connector = await connectorRegistry.getCalendar(context);
  if (!connector) return { configured: false, error: connectorUnavailableMessage(), operation: input.operation };

  switch (input.operation) {
    case "list": {
      required(input, ["from", "to"]);
      return connector.listEvents(context, { from: input.from!, to: input.to!, calendarId: input.calendar_id });
    }
    case "create": {
      required(input, ["title", "start", "end", "timezone"]);
      const createInput: CalendarCreateInput = {
        title: input.title!, start: input.start!, end: input.end!, timezone: input.timezone!,
        description: input.description, location: input.location, attendees: input.attendees, calendarId: input.calendar_id
      };
      return connector.createEvent(context, createInput);
    }
    case "update": {
      required(input, ["event_id"]);
      return connector.updateEvent(context, input.event_id!, {
        title: input.title, start: input.start, end: input.end, timezone: input.timezone,
        description: input.description, location: input.location, attendees: input.attendees, calendarId: input.calendar_id
      });
    }
    case "cancel":
      required(input, ["event_id"]);
      return connector.cancelEvent(context, input.event_id!);
  }
}
