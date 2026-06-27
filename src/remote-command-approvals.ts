import type { AgentToolRequest } from "./agent-tool-schema.js";
import { formatPermissionPreview } from "./agent-tool-permission-preview.js";
import type { RemoteCommandRecord } from "./remote-command-broker-types.js";

type PendingApproval = {
  readonly settle: (approved: boolean) => void;
};

type PatchCommand = (
  id: string,
  update: (record: RemoteCommandRecord) => RemoteCommandRecord,
) => RemoteCommandRecord | undefined;

export type RemoteCommandApprovalManager = {
  readonly request: (commandId: string, request: AgentToolRequest, signal: AbortSignal) => Promise<boolean>;
  readonly approve: (commandId: string) => RemoteCommandRecord | undefined;
  readonly reject: (commandId: string) => RemoteCommandRecord | undefined;
};

export function createRemoteCommandApprovalManager(patch: PatchCommand): RemoteCommandApprovalManager {
  const pending = new Map<string, PendingApproval>();

  function request(commandId: string, toolRequest: AgentToolRequest, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const requestedAt = new Date().toISOString();
      const settle = (approved: boolean): void => {
        if (!pending.has(commandId)) {
          return;
        }
        pending.delete(commandId);
        patch(commandId, (record) => clearApproval(record, approved));
        resolve(approved);
      };
      pending.set(commandId, { settle });
      patch(commandId, (record) => ({
        ...record,
        status: "waiting_approval",
        pendingApproval: {
          id: `${commandId}:${requestedAt}`,
          tool: toolRequest.tool,
          label: approvalLabel(toolRequest),
          preview: formatPermissionPreview(toolRequest),
          requestedAt,
        },
        updatedAt: requestedAt,
      }));
      if (signal.aborted) {
        settle(false);
        return;
      }
      signal.addEventListener("abort", () => settle(false), { once: true });
    });
  }

  return {
    request,
    approve: (commandId) => resolvePending(commandId, true),
    reject: (commandId) => resolvePending(commandId, false),
  };

  function resolvePending(commandId: string, approved: boolean): RemoteCommandRecord | undefined {
    const approval = pending.get(commandId);
    if (approval === undefined) {
      return undefined;
    }
    approval.settle(approved);
    return patch(commandId, (record) => record);
  }

  function clearApproval(record: RemoteCommandRecord, approved: boolean): RemoteCommandRecord {
    const { pendingApproval: _pendingApproval, ...rest } = record;
    const now = new Date().toISOString();
    return {
      ...rest,
      status: record.status === "cancelled" ? record.status : "running",
      activity: [
        ...record.activity,
        {
          at: now,
          label: approved ? "Tool approved" : "Tool rejected",
          detail: approved ? "Remote operator approved the pending tool" : "Remote operator rejected the pending tool",
        },
      ].slice(-20),
      updatedAt: now,
    };
  }
}

function approvalLabel(request: AgentToolRequest): string {
  switch (request.tool) {
    case "read":
      return `Read ${request.path}`;
    case "list":
      return `List ${request.path ?? "."}`;
    case "search":
      return `Search ${request.query}`;
    case "grep":
      return `Grep ${request.query}`;
    case "glob":
      return `Glob ${request.pattern}`;
    case "research":
      return `Research ${request.query}`;
    case "fetch":
      return `Fetch ${request.url}`;
    case "diff":
      return `Diff ${request.path ?? "."}`;
    case "stat":
      return `Stat ${request.path}`;
    case "diagnostics":
      return "Run diagnostics";
    case "shell":
      return `Run ${request.command}`;
    case "write":
      return `Write ${request.path}`;
    case "delete":
      return `Delete ${request.path}`;
    case "mkdir":
      return `Create ${request.path}`;
    case "edit":
      return `Edit ${request.path}`;
    case "patch":
      return "Apply patch";
    case "move":
      return `Move ${request.from}`;
    case "copy":
      return `Copy ${request.from}`;
    case "artifact":
      return `Artifact ${request.action}`;
    case "task":
      return `Task ${request.action}`;
    case "mcp":
      return `MCP ${request.server}/${request.name}`;
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected tool request: ${String(value)}`);
}
