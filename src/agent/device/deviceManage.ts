import {
  approveDeviceJob,
  createPairingCode,
  denyDeviceJob,
  enqueueDeviceJob,
  listDevices,
  listRecentJobs,
  revokeDevice
} from "./store.js";
import type { DeviceCapability, DeviceKind } from "./types.js";

const KINDS: DeviceKind[] = ["phone", "laptop", "tablet", "server", "other"];

export async function handleDeviceManage(
  telegramId: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const operation = String(args.operation ?? "list");

  if (operation === "list") {
    const devices = await listDevices(telegramId);
    return {
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        label: d.label,
        kind: d.kind,
        status: d.status,
        capabilities: d.capabilities,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null
      }))
    };
  }

  if (operation === "pair") {
    const deviceName = String(args.device_name ?? args.name ?? "My device").slice(0, 80);
    const kindRaw = String(args.kind ?? "other");
    const kind = (KINDS.includes(kindRaw as DeviceKind) ? kindRaw : "other") as DeviceKind;
    const result = await createPairingCode({ telegramId, deviceName, kind });
    if ("error" in result) return { error: result.error };
    return {
      pairing_code: result.code,
      expires_at: result.expiresAt.toISOString(),
      instructions:
        "On the device agent, submit this pairing code with desired capabilities. Code expires in ~10 minutes."
    };
  }

  if (operation === "revoke") {
    const deviceId = String(args.device_id ?? "");
    if (!deviceId) return { error: "device_id required" };
    const result = await revokeDevice(telegramId, deviceId);
    if ("error" in result) return { error: result.error };
    return { revoked: true, device: { id: result.id, name: result.name, status: result.status } };
  }

  if (operation === "enqueue") {
    const deviceId = String(args.device_id ?? "");
    const capability = String(args.capability ?? "") as DeviceCapability;
    const summary = String(args.summary ?? capability);
    if (!deviceId || !capability) return { error: "device_id and capability required" };
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const result = await enqueueDeviceJob({
      telegramId,
      deviceId,
      capability,
      summary,
      payload,
      projectId: typeof args.project_id === "string" ? args.project_id : undefined,
      preApproved: Boolean(args.pre_approved)
    });
    if ("error" in result) return { error: result.error };
    return {
      job: {
        id: result.id,
        status: result.status,
        capability: result.capability,
        summary: result.summary,
        deviceId: result.deviceId
      },
      needs_approval: result.status === "queued"
    };
  }

  if (operation === "approve_job") {
    const jobId = String(args.job_id ?? "");
    if (!jobId) return { error: "job_id required" };
    const result = await approveDeviceJob(telegramId, jobId);
    if ("error" in result) return { error: result.error };
    return { job: { id: result.id, status: result.status } };
  }

  if (operation === "deny_job") {
    const jobId = String(args.job_id ?? "");
    if (!jobId) return { error: "job_id required" };
    const result = await denyDeviceJob(telegramId, jobId);
    if ("error" in result) return { error: result.error };
    return { job: { id: result.id, status: result.status } };
  }

  if (operation === "jobs") {
    const jobs = await listRecentJobs(telegramId);
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        deviceId: j.deviceId,
        capability: j.capability,
        summary: j.summary,
        status: j.status,
        error: j.error,
        createdAt: j.createdAt.toISOString()
      }))
    };
  }

  return {
    error: `Unknown operation: ${operation}`,
    allowed: ["list", "pair", "revoke", "enqueue", "approve_job", "deny_job", "jobs"]
  };
}
