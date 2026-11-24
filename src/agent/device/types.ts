/** Personal Device Kernel — connect phones/laptops so Nally can monitor and operate only on approved lines. */

export type DeviceKind = "phone" | "laptop" | "tablet" | "server" | "other";

export type DeviceStatus = "pending" | "online" | "offline" | "revoked";

export type DeviceJobStatus =
  | "queued"
  | "approved"
  | "running"
  | "succeeded"
  | "failed"
  | "denied"
  | "cancelled";

/** What a device is allowed to expose. Agent may only request these. */
export type DeviceCapability =
  | "notify"
  | "read_clipboard"
  | "capture_photo"
  | "capture_voice"
  | "ingest_file"
  | "list_workspace"
  | "read_workspace"
  | "write_workspace"
  | "run_tests"
  | "run_command"
  | "health";

/** Jobs that mutate device state always need approval unless always-allow is granted. */
export const MUTATING_CAPABILITIES: ReadonlySet<DeviceCapability> = new Set([
  "write_workspace",
  "run_tests",
  "run_command",
  "capture_photo",
  "capture_voice",
  "ingest_file",
  "read_clipboard"
]);

export type DeviceRecord = {
  id: string;
  userId: string;
  name: string;
  kind: DeviceKind;
  status: DeviceStatus;
  capabilities: DeviceCapability[];
  /** Short public label e.g. "Pixel-7" or "ThinkPad" */
  label: string;
  lastSeenAt: Date | null;
  pairedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type DeviceJobRecord = {
  id: string;
  userId: string;
  deviceId: string;
  capability: DeviceCapability;
  /** Human summary shown in Telegram approval */
  summary: string;
  /** Opaque payload for the device agent (paths, args) — never secrets in plain chat */
  payload: Record<string, unknown>;
  status: DeviceJobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type PairingChallenge = {
  code: string;
  telegramId: string;
  deviceName: string;
  kind: DeviceKind;
  expiresAt: number;
};
