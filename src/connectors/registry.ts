import type { ConnectorContext, ConnectorRegistry } from "./types.js";
import { createGoogleCalendarConnector } from "./googleCalendar.js";

class ConfiguredConnectorRegistry implements ConnectorRegistry {
  private readonly calendar = createGoogleCalendarConnector();

  async getCalendar(context: ConnectorContext) {
    if (!this.calendar) return null;
    return this.calendar;
  }
}

export const connectorRegistry: ConnectorRegistry = new ConfiguredConnectorRegistry();

export function connectorUnavailableMessage(provider = "Calendar"): string {
  return `${provider} is not configured for this NallyHermes account. The workflow was not completed and no external action was taken.`;
}
