import type { OrchestraEvent, ProgressEvent } from "./progress.js";

export interface EventPublisherOptions {
  requestId: string;
  onProgress?: (event: ProgressEvent) => Promise<void> | void;
  onEvent?: (event: OrchestraEvent) => Promise<void> | void;
  now?: () => string;
}

/** Serializes legacy progress and structured event delivery for one request. */
export function createEventPublisher(options: EventPublisherOptions): (event: ProgressEvent) => Promise<void> {
  let sequence = 0;
  let queue: Promise<void> = Promise.resolve();
  const now = options.now ?? (() => new Date().toISOString());

  return (event) => {
    queue = queue.then(async () => {
      try {
        await options.onProgress?.(event);
      } catch (error) {
        console.warn("Legacy progress delivery failed:", error);
      }

      const envelope: OrchestraEvent = {
        requestId: options.requestId,
        sequence: ++sequence,
        emittedAt: now(),
        event,
        correlation: {
          ...("index" in event ? { stepIndex: event.index } : {}),
          ...("tool" in event ? { toolName: event.tool } : {}),
          ...("toolCallId" in event && event.toolCallId ? { toolCallId: event.toolCallId } : {})
        }
      };
      try {
        await options.onEvent?.(envelope);
      } catch (error) {
        console.warn("Structured event delivery failed:", error);
      }
    });
    return queue;
  };
}
