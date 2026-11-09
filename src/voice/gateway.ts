import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { parseVoiceClientEvent, type VoiceServerEvent } from "./protocol.js";
import { VoiceSession, VoiceSessionRegistry } from "./session.js";

export interface VoicePrincipal {
  readonly userId: string;
}

export interface VoiceGatewayOptions {
  /** Must validate the application's own short-lived, authenticated web session. */
  authenticate(request: IncomingMessage): Promise<VoicePrincipal | null>;
  /** Exact allowed browser origins. An empty set rejects every browser origin. */
  allowedOrigins: ReadonlySet<string>;
  onAudioFrame?(principal: VoicePrincipal, session: VoiceSession, frame: Buffer): void | Promise<void>;
  onControlEvent?(principal: VoicePrincipal, session: VoiceSession, event: ReturnType<typeof parseVoiceClientEvent>): void | Promise<void>;
  onSessionClose?(principal: VoicePrincipal, session: VoiceSession): void;
  maxSessions?: number;
  maxSessionsPerUser?: number;
  maxAudioFrameBytes?: number;
}

interface ConnectionState {
  readonly principal: VoicePrincipal;
  session?: VoiceSession;
  closed: boolean;
}

/**
 * Authenticated WebSocket transport for the provider-neutral voice runtime.
 * The host HTTP server owns the upgrade route and calls handleUpgrade().
 */
export class VoiceWebSocketGateway {
  private readonly server: WebSocketServer;
  private readonly registry: VoiceSessionRegistry;
  private readonly userSessionCounts = new Map<string, number>();
  private readonly socketsBySession = new Map<string, WebSocket>();
  private readonly maxSessionsPerUser: number;
  private readonly maxAudioFrameBytes: number;

  constructor(private readonly options: VoiceGatewayOptions) {
    this.registry = new VoiceSessionRegistry(options.maxSessions ?? 100);
    this.maxSessionsPerUser = options.maxSessionsPerUser ?? 2;
    this.maxAudioFrameBytes = options.maxAudioFrameBytes ?? 64 * 1024;

    if (!Number.isSafeInteger(this.maxSessionsPerUser) || this.maxSessionsPerUser < 1) {
      throw new Error("maxSessionsPerUser must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.maxAudioFrameBytes) || this.maxAudioFrameBytes < 1) {
      throw new Error("maxAudioFrameBytes must be a positive safe integer");
    }

    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: this.maxAudioFrameBytes,
      perMessageDeflate: false
    });
  }

  /** Attach this to the existing HTTP server's upgrade event. */
  handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    void this.authorizeUpgrade(request).then((principal) => {
      if (!principal) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        this.attachConnection(webSocket, principal);
      });
    }).catch(() => {
      socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      socket.destroy();
    });
  };

  get activeSessions(): number {
    return this.registry.size;
  }

  /** Send a control event to the owner of a live session. */
  sendEvent(sessionId: string, event: VoiceServerEvent): boolean {
    const session = this.registry.get(sessionId);
    const socket = this.socketsBySession.get(sessionId);
    if (!session || event.sessionId !== sessionId || !socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
  }

  /** Send only audio belonging to the currently active response generation. */
  sendAudioFrame(sessionId: string, turnId: number, generationId: number, frame: Buffer): boolean {
    const session = this.registry.get(sessionId);
    const socket = this.socketsBySession.get(sessionId);
    if (!session || !session.acceptsOutput(turnId, generationId) || !socket ||
        socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1024 * 1024) return false;
    socket.send(frame, { binary: true });
    return true;
  }

  async close(): Promise<void> {
    this.registry.closeAll();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async authorizeUpgrade(request: IncomingMessage): Promise<VoicePrincipal | null> {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/voice") return null;
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !this.options.allowedOrigins.has(origin)) return null;
    const principal = await this.options.authenticate(request);
    if (!principal || typeof principal.userId !== "string" || principal.userId.length === 0) return null;
    return principal;
  }

  private attachConnection(webSocket: WebSocket, principal: VoicePrincipal): void {
    const state: ConnectionState = { principal, closed: false };

    webSocket.on("message", (data: RawData, isBinary: boolean) => {
      void this.handleMessage(webSocket, state, data, isBinary).catch(() => {
        this.send(webSocket, {
          v: 1, type: "session.error", sessionId: state.session?.id ?? "uninitialized",
          code: "VOICE_TRANSPORT_ERROR", message: "Voice transport could not process the message."
        });
        webSocket.close(1011, "Voice transport error");
      });
    });

    webSocket.once("close", () => this.closeConnection(state));
    webSocket.once("error", () => this.closeConnection(state));
  }

  private async handleMessage(
    webSocket: WebSocket,
    state: ConnectionState,
    data: RawData,
    isBinary: boolean
  ): Promise<void> {
    if (state.closed) return;

    if (isBinary) {
      if (!state.session) {
        webSocket.close(1008, "Start a session before sending audio");
        return;
      }
      const frame = this.toBuffer(data);
      if (frame.byteLength === 0 || frame.byteLength > this.maxAudioFrameBytes) {
        webSocket.close(1009, "Audio frame exceeds limit");
        return;
      }
      await this.options.onAudioFrame?.(state.principal, state.session, frame);
      return;
    }

    const event = parseVoiceClientEvent(this.toBuffer(data).toString("utf8"));

    if (event.type === "session.start") {
      if (state.session) {
        webSocket.close(1008, "Session already started");
        return;
      }
      const activeForUser = this.userSessionCounts.get(state.principal.userId) ?? 0;
      if (activeForUser >= this.maxSessionsPerUser) {
        this.send(webSocket, {
          v: 1, type: "session.error", sessionId: event.sessionId,
          code: "SESSION_LIMIT", message: "Concurrent voice session limit reached."
        });
        webSocket.close(1008, "Session limit reached");
        return;
      }

      try {
        state.session = this.registry.create(randomUUID());
        this.socketsBySession.set(state.session.id, webSocket);
      } catch {
        this.send(webSocket, {
          v: 1, type: "session.error", sessionId: event.sessionId,
          code: "SESSION_UNAVAILABLE", message: "Voice session could not be created."
        });
        webSocket.close(1008, "Session unavailable");
        return;
      }
      this.userSessionCounts.set(state.principal.userId, activeForUser + 1);
      this.send(webSocket, { v: 1, type: "session.ready", sessionId: state.session.id });
      return;
    }

    const session = state.session;
    if (!session || event.sessionId !== session.id) {
      webSocket.close(1008, "Unknown voice session");
      return;
    }

    if (event.type === "turn.cancel") {
      if (event.turnId === session.currentTurnId) {
        const interrupted = session.interrupt("client_cancel");
        if (interrupted) this.send(webSocket, {
          v: 1, type: "assistant.interrupted", sessionId: session.id,
          turnId: interrupted.turnId, generationId: interrupted.generationId, reason: "client_cancel"
        });
      }
    } else if (event.type === "session.stop") {
      this.send(webSocket, { v: 1, type: "session.closed", sessionId: session.id });
      this.closeConnection(state);
      webSocket.close(1000, "Session stopped");
      return;
    }

    await this.options.onControlEvent?.(state.principal, session, event);
  }

  private closeConnection(state: ConnectionState): void {
    if (state.closed) return;
    state.closed = true;
    if (!state.session) return;

    this.socketsBySession.delete(state.session.id);
    this.options.onSessionClose?.(state.principal, state.session);
    this.registry.close(state.session.id);
    const count = this.userSessionCounts.get(state.principal.userId) ?? 0;
    if (count <= 1) this.userSessionCounts.delete(state.principal.userId);
    else this.userSessionCounts.set(state.principal.userId, count - 1);
  }

  private send(webSocket: WebSocket, event: VoiceServerEvent): void {
    if (webSocket.readyState === WebSocket.OPEN) webSocket.send(JSON.stringify(event));
  }

  private toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.from(data);
  }
}
