export type ConnectorId = "calendar" | "github" | "email" | "tasks";

export type ConnectorCapability = "read" | "write";

export interface ConnectorContext {
  telegramId: string;
  userId: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  timezone: string;
  location?: string;
  attendees?: string[];
  source: string;
  readonly?: boolean;
}

export interface CalendarListInput {
  from: string;
  to: string;
  calendarId?: string;
}

export interface CalendarCreateInput {
  title: string;
  start: string;
  end: string;
  timezone: string;
  description?: string;
  location?: string;
  attendees?: string[];
  calendarId?: string;
}

export interface CalendarConnector {
  readonly id: "calendar";
  readonly provider: string;
  readonly capabilities: ReadonlySet<ConnectorCapability>;
  listEvents(context: ConnectorContext, input: CalendarListInput): Promise<CalendarEvent[]>;
  createEvent(context: ConnectorContext, input: CalendarCreateInput): Promise<CalendarEvent>;
  updateEvent(context: ConnectorContext, eventId: string, input: Partial<CalendarCreateInput>): Promise<CalendarEvent>;
  cancelEvent(context: ConnectorContext, eventId: string): Promise<{ cancelled: boolean; event_id: string }>;
}

export interface ConnectorRegistry {
  getCalendar(context: ConnectorContext): Promise<CalendarConnector | null>;
}
