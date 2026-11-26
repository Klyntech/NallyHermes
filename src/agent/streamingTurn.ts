import type { ChatCompletionMessage } from "openai/resources/index.js";

/** Loose structural view of an OpenAI-compatible streaming chunk (ChatCompletionChunk is assignable to it). */
export type ChunkLike = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

type StreamedToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** Rebuilds the single assistant message a non-streaming completion would have returned. */
export class TurnAccumulator {
  private content = "";
  private readonly calls = new Map<number, StreamedToolCall>();

  /** Adds a chunk and returns the text delta it carried ("" when none). */
  add(chunk: ChunkLike): string {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return "";
    for (const call of delta.tool_calls ?? []) {
      const existing = this.calls.get(call.index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
      if (call.id) existing.id = call.id;
      if (call.function?.name) existing.function.name += call.function.name;
      if (call.function?.arguments) existing.function.arguments += call.function.arguments;
      this.calls.set(call.index, existing);
    }
    const text = delta.content ?? "";
    if (text) this.content += text;
    return text;
  }

  toMessage(): ChatCompletionMessage {
    const toolCalls = [...this.calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call], position) => ({
      ...call,
      id: call.id || `call_${position}`
    }));
    const message: ChatCompletionMessage = {
      role: "assistant",
      content: this.content.length ? this.content : null,
      refusal: null
    };
    if (toolCalls.length) message.tool_calls = toolCalls;
    return message;
  }
}

export type StreamTurnOptions = {
  /** Called for every content delta as it arrives (used to start speaking before the reply is complete). */
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
  /** Abort if the provider goes silent for this long mid-stream. */
  stallMs?: number;
};

/**
 * Runs one model turn as a stream. The returned message has the same shape as a non-streaming completion,
 * so the existing tool loop (evaluateTurn, tool execution, history) keeps working unchanged.
 */
export async function streamModelTurn(
  createStream: () => Promise<AsyncIterable<ChunkLike>>,
  options: StreamTurnOptions = {}
): Promise<ChatCompletionMessage> {
  const { onTextDelta, signal, stallMs = 30_000 } = options;
  const accumulator = new TurnAccumulator();
  const stream = await createStream();
  const iterator = stream[Symbol.asyncIterator]();
  try {
    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The model stream stalled.")), stallMs);
      });
      let step: IteratorResult<ChunkLike>;
      try {
        step = await Promise.race([iterator.next(), stalled]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (step.done) break;
      const text = accumulator.add(step.value);
      if (text) onTextDelta?.(text);
    }
  } finally {
    // Never await cleanup: on a stuck stream return() would block behind the pending next() forever.
    try { void Promise.resolve(iterator.return?.()).catch(() => undefined); } catch { /* stream already closed */ }
  }
  return accumulator.toMessage();
}
