import type { ConnectorContext, ConnectorRegistry } from "./types.js";

class EmptyConnectorRegistry implements ConnectorRegistry {
  async getCalendar(_context: ConnectorContext) {
    return null;
  }
}

export const connectorRegistry: ConnectorRegistry = new EmptyConnectorRegistry();

export function connectorUnavailableMessage(provider = "Calendar"): string {
  return `${provider} is not configured for this NallyHermes account. The workflow was not completed and no external action was taken.`;
}
