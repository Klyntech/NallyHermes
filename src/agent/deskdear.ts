/**
 * DeskDear — Nally's permissioned desktop endpoint (Phase A scaffold).
 *
 * Model proposes operations; Hermes validates + approvals; DeskDear executes
 * only with a future JobTicket. Until a device is paired and transport is live,
 * all mutating/remote calls fail closed with a clear status.
 *
 * This module is the application-controlled surface. It does not grant the model
 * raw mouse/keyboard authority.
 */

export type DeskDearOpKind = "observe" | "workspace_mutate" | "app" | "input" | "danger";

export type DeskDearOperation = {
  name: string;
  description: string;
  readOnly: boolean;
  kind: DeskDearOpKind;
  /** Phase when this op is expected to be implemented on the device. */
  phase: "A" | "B" | "C";
};

/** Catalog of operations the control plane understands. Device may support a subset. */
export const DESKDEAR_OPERATIONS: readonly DeskDearOperation[] = [
  {
    name: "health",
    description: "Device health, OS, policy version, and pairing status.",
    readOnly: true,
    kind: "observe",
    phase: "A"
  },
  {
    name: "list_capabilities",
    description: "Capabilities currently granted on the paired device (deny-by-default).",
    readOnly: true,
    kind: "observe",
    phase: "A"
  },
  {
    name: "workspace_list",
    description: "List files in the DeskDear sandboxed workspace root.",
    readOnly: true,
    kind: "observe",
    phase: "A"
  },
  {
    name: "workspace_read",
    description: "Read a file under the sandboxed workspace (relative path only).",
    readOnly: true,
    kind: "observe",
    phase: "A"
  },
  {
    name: "workspace_write",
    description: "Write a file under the sandboxed workspace. Requires user approval.",
    readOnly: false,
    kind: "workspace_mutate",
    phase: "A"
  },
  {
    name: "screenshot",
    description: "Capture the desktop screen (Phase B+). High privacy risk; approval required.",
    readOnly: true,
    kind: "observe",
    phase: "B"
  },
  {
    name: "left_click",
    description: "Left-click at coordinates in an allowlisted context (Phase C). Approval required.",
    readOnly: false,
    kind: "input",
    phase: "C"
  },
  {
    name: "type",
    description: "Type text into the focused allowlisted surface (Phase C). Approval required.",
    readOnly: false,
    kind: "input",
    phase: "C"
  }
] as const;

export function listDeskDearOperations(): Array<{
  name: string;
  description: string;
  readOnly: boolean;
  kind: DeskDearOpKind;
  phase: string;
}> {
  return DESKDEAR_OPERATIONS.map((op) => ({
    name: op.name,
    description: op.description,
    readOnly: op.readOnly,
    kind: op.kind,
    phase: op.phase
  }));
}

export function getDeskDearOperation(name: string): DeskDearOperation {
  const op = DESKDEAR_OPERATIONS.find((item) => item.name === name);
  if (!op) {
    throw new Error(
      `Unknown DeskDear operation "${name}". Call list_operations or get_operation with a known name.`
    );
  }
  return op;
}

export function isDeskDearWriteOperation(name: string): boolean {
  try {
    return !getDeskDearOperation(name).readOnly;
  } catch {
    // Unknown ops fail closed as writes so they require approval before schema rejects them.
    return true;
  }
}

export type DeskDearStatus = {
  available: boolean;
  transport: "not_connected" | "paired" | "online";
  phase: "A";
  note: string;
  operations: ReturnType<typeof listDeskDearOperations>;
};

/**
 * Control-plane status. Phase A: no live transport yet — always not_connected
 * unless a future pairing store marks a device online.
 */
export function getDeskDearStatus(): DeskDearStatus {
  return {
    available: false,
    transport: "not_connected",
    phase: "A",
    note:
      "DeskDear is registered in Nally but no paired device is online yet. " +
      "Pairing, JobTickets, and outbound device transport are not active. " +
      "Do not claim desktop actions succeeded.",
    operations: listDeskDearOperations()
  };
}

export type DeskDearCallResult =
  | { status: "ok"; operation: string; result: unknown }
  | {
      status: "unavailable" | "denied_local" | "not_implemented";
      operation: string;
      message: string;
    };

/**
 * Execute (or refuse) a DeskDear operation from Hermes.
 * Fail-closed until device transport exists.
 */
export async function callDeskDearOperation(
  name: string,
  _args: Record<string, unknown>,
  approved: boolean
): Promise<DeskDearCallResult> {
  const op = getDeskDearOperation(name);

  if (!op.readOnly && !approved) {
    return {
      status: "denied_local",
      operation: name,
      message: "Mutating DeskDear operations require explicit approval (approved=true after the user allows)."
    };
  }

  // Observe helpers that are pure control-plane metadata can answer without a device.
  if (name === "health" || name === "list_capabilities") {
    return {
      status: "ok",
      operation: name,
      result: getDeskDearStatus()
    };
  }

  // Everything else needs a live paired device.
  return {
    status: "unavailable",
    operation: name,
    message:
      "No DeskDear device is paired and online for this account. " +
      "The operation was not sent to any desktop. Pair a device when DeskDear transport is enabled."
  };
}
