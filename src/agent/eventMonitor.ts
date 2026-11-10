export type MonitorStatus = "pending" | "active" | "completed" | "cancelled" | "failed";
export type MonitorEventState = "unknown" | "scheduled" | "live" | "finished" | "changed";

export interface EventMonitorDefinition {
  id: string;
  subject: string;
  condition: "starts" | "changes" | "ends" | "custom";
  intervalSeconds: number;
  stopWhen: "finished" | "condition_met" | "cancelled";
  status: MonitorStatus;
  lastObservedState: MonitorEventState;
  lastObservedAt?: Date;
  lastNotifiedState?: MonitorEventState;
  nextCheckAt: Date;
}

export interface EventObservation {
  state: MonitorEventState;
  observedAt: Date;
  summary?: string;
  source?: string;
}

export function shouldNotify(definition: EventMonitorDefinition, observation: EventObservation): boolean {
  if (definition.status !== "active") return false;
  if (definition.lastNotifiedState === observation.state && definition.lastObservedState === observation.state) return false;
  if (definition.condition === "starts") return observation.state === "live";
  if (definition.condition === "ends") return observation.state === "finished";
  if (definition.condition === "changes") return definition.lastObservedState !== observation.state;
  return definition.lastObservedState !== observation.state;
}

export function applyObservation(definition: EventMonitorDefinition, observation: EventObservation, notified: boolean): EventMonitorDefinition {
  const completed = definition.stopWhen === "finished" && observation.state === "finished";
  const conditionMet = definition.stopWhen === "condition_met" && notified;
  return {
    ...definition,
    status: completed || conditionMet ? "completed" : definition.status,
    lastObservedState: observation.state,
    lastObservedAt: observation.observedAt,
    lastNotifiedState: notified ? observation.state : definition.lastNotifiedState,
    nextCheckAt: new Date(observation.observedAt.getTime() + definition.intervalSeconds * 1000)
  };
}
