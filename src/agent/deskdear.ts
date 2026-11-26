/**
 * DeskDear — Nally control-plane surface.
 *
 * Public tool names MUST match DeskDear `tool_registry.cpp` (NallyDeskDear branch).
 * Internal capability/action strings stay on the device; Hermes only uses public names.
 *
 * Model proposes → Hermes approvals → DeskDear executes with session policy.
 * Until a device is paired, remote ops fail closed.
 */

export type DeskDearOpKind =
  | "health"
  | "workspace"
  | "application"
  | "screen"
  | "input"
  | "task";

export type DeskDearToolState = "enabled" | "planned";

export type DeskDearOperation = {
  /** Public name — identical to DeskDear ToolSpec.name */
  name: string;
  /** DeskDear internal action id (documentation / future tickets) */
  action: string;
  description: string;
  /** Mirrors ToolSpec.approval_required */
  approvalRequired: boolean;
  readOnly: boolean;
  kind: DeskDearOpKind;
  state: DeskDearToolState;
  capability:
    | "Health"
    | "WorkspaceRead"
    | "WorkspaceWrite"
    | "OpenApplication"
    | "RunCommand"
    | "ScreenCapture"
    | "InputControl";
};

/**
 * Single source of truth aligned with deskdear::tools in tool_registry.cpp.
 * Keep order and names in sync with the C++ table when either side changes.
 */
export const DESKDEAR_OPERATIONS: readonly DeskDearOperation[] = [
  {
    name: "status",
    action: "health.status",
    description: "Device/session health and pairing status.",
    approvalRequired: false,
    readOnly: true,
    kind: "health",
    state: "enabled",
    capability: "Health"
  },
  {
    name: "read",
    action: "workspace.read",
    description: "Read a file under the DeskDear sandboxed workspace (relative path only).",
    approvalRequired: false,
    readOnly: true,
    kind: "workspace",
    state: "enabled",
    capability: "WorkspaceRead"
  },
  {
    name: "write",
    action: "workspace.write",
    description: "Write a file under the sandboxed workspace. Requires user approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "workspace",
    state: "enabled",
    capability: "WorkspaceWrite"
  },
  {
    name: "list",
    action: "workspace.list",
    description: "List entries in the sandboxed workspace.",
    approvalRequired: false,
    readOnly: true,
    kind: "workspace",
    state: "planned",
    capability: "WorkspaceRead"
  },
  {
    name: "info",
    action: "workspace.info",
    description: "Metadata for a workspace path.",
    approvalRequired: false,
    readOnly: true,
    kind: "workspace",
    state: "planned",
    capability: "WorkspaceRead"
  },
  {
    name: "mkdir",
    action: "workspace.mkdir",
    description: "Create a directory in the sandbox. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "workspace",
    state: "planned",
    capability: "WorkspaceWrite"
  },
  {
    name: "mv",
    action: "workspace.move",
    description: "Move/rename within the sandbox. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "workspace",
    state: "planned",
    capability: "WorkspaceWrite"
  },
  {
    name: "delete",
    action: "workspace.delete",
    description: "Delete a sandbox path. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "workspace",
    state: "planned",
    capability: "WorkspaceWrite"
  },
  {
    name: "open",
    action: "application.open",
    description: "Open an application (allowlisted when implemented). Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "application",
    state: "planned",
    capability: "OpenApplication"
  },
  {
    name: "shot",
    action: "screen.capture",
    description: "Capture the screen. High privacy risk; requires approval.",
    approvalRequired: true,
    readOnly: true,
    kind: "screen",
    state: "planned",
    capability: "ScreenCapture"
  },
  {
    name: "zoom",
    action: "screen.region",
    description: "Capture a screen region. Requires approval.",
    approvalRequired: true,
    readOnly: true,
    kind: "screen",
    state: "planned",
    capability: "ScreenCapture"
  },
  {
    name: "cursor",
    action: "screen.cursor",
    description: "Report cursor position.",
    approvalRequired: true,
    readOnly: true,
    kind: "screen",
    state: "planned",
    capability: "ScreenCapture"
  },
  {
    name: "move",
    action: "input.move",
    description: "Move the pointer. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "click",
    action: "input.click",
    description: "Click at coordinates or current cursor. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "drag",
    action: "input.drag",
    description: "Drag between coordinates. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "scroll",
    action: "input.scroll",
    description: "Scroll the focused surface. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "type",
    action: "input.type",
    description: "Type text. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "key",
    action: "input.key",
    description: "Press a key or chord (e.g. ctrl+s). Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "hold",
    action: "input.hold",
    description: "Hold a key. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "input",
    state: "planned",
    capability: "InputControl"
  },
  {
    name: "wait",
    action: "task.wait",
    description: "Pause the device-side task loop briefly.",
    approvalRequired: false,
    readOnly: true,
    kind: "task",
    state: "planned",
    capability: "Health"
  },
  {
    name: "pause",
    action: "task.pause",
    description: "Pause an in-flight DeskDear task.",
    approvalRequired: false,
    readOnly: true,
    kind: "task",
    state: "planned",
    capability: "Health"
  },
  {
    name: "resume",
    action: "task.resume",
    description: "Resume a paused task. Requires approval.",
    approvalRequired: true,
    readOnly: false,
    kind: "task",
    state: "planned",
    capability: "Health"
  },
  {
    name: "cancel",
    action: "task.cancel",
    description: "Cancel an in-flight task.",
    approvalRequired: false,
    readOnly: true,
    kind: "task",
    state: "planned",
    capability: "Health"
  }
] as const;

export function listDeskDearOperations(): Array<{
  name: string;
  action: string;
  description: string;
  readOnly: boolean;
  approvalRequired: boolean;
  kind: DeskDearOpKind;
  state: DeskDearToolState;
  capability: string;
}> {
  return DESKDEAR_OPERATIONS.map((op) => ({
    name: op.name,
    action: op.action,
    description: op.description,
    readOnly: op.readOnly,
    approvalRequired: op.approvalRequired,
    kind: op.kind,
    state: op.state,
    capability: op.capability
  }));
}

export function getDeskDearOperation(name: string): DeskDearOperation {
  const op = DESKDEAR_OPERATIONS.find((item) => item.name === name);
  if (!op) {
    throw new Error(
      `Unknown DeskDear tool "${name}". Use list_operations. Public names match DeskDear tool_registry (status, read, write, …).`
    );
  }
  return op;
}

/** True when Hermes must run the universal write/approval gate before call_operation. */
export function isDeskDearWriteOperation(name: string): boolean {
  try {
    return getDeskDearOperation(name).approvalRequired;
  } catch {
    return true;
  }
}

export type DeskDearStatus = {
  available: boolean;
  transport: "not_connected" | "paired" | "online";
  /** Tools DeskDear marks Enabled today */
  enabledTools: string[];
  /** Full public catalog size */
  toolCount: number;
  note: string;
  operations: ReturnType<typeof listDeskDearOperations>;
};

export function getDeskDearStatus(): DeskDearStatus {
  const enabledTools = DESKDEAR_OPERATIONS.filter((o) => o.state === "enabled").map((o) => o.name);
  return {
    available: false,
    transport: "not_connected",
    enabledTools,
    toolCount: DESKDEAR_OPERATIONS.length,
    note:
      "DeskDear public tools are registered in Nally and aligned with the device tool_registry. " +
      "No paired device is online yet. Enabled device tools today: status, read, write. " +
      "Do not claim desktop actions succeeded without a device result.",
    operations: listDeskDearOperations()
  };
}

export type DeskDearCallResult =
  | { status: "ok"; operation: string; action: string; result: unknown }
  | {
      status: "unavailable" | "denied_local" | "not_implemented";
      operation: string;
      action?: string;
      message: string;
    };

export async function callDeskDearOperation(
  name: string,
  _args: Record<string, unknown>,
  approved: boolean
): Promise<DeskDearCallResult> {
  const op = getDeskDearOperation(name);

  if (op.approvalRequired && !approved) {
    return {
      status: "denied_local",
      operation: name,
      action: op.action,
      message:
        "This DeskDear tool requires explicit user approval (approved=true after Deny/Allow/Always allow)."
    };
  }

  // Control-plane metadata without a live device
  if (name === "status") {
    return { status: "ok", operation: name, action: op.action, result: getDeskDearStatus() };
  }

  if (op.state === "planned") {
    return {
      status: "not_implemented",
      operation: name,
      action: op.action,
      message: `DeskDear tool "${name}" (${op.action}) is planned on the device (ToolState::Planned), not enabled yet.`
    };
  }

  // Enabled tools that need a device (read, write, …)
  return {
    status: "unavailable",
    operation: name,
    action: op.action,
    message:
      "No DeskDear device is paired and online. The operation was not sent to any desktop."
  };
}
