import {
  requestJson,
  type CommandRecord,
  type RemoteModelDto,
  type RemoteState,
  type RunReviewDto,
} from "./remote-web-api.js";

export async function approveRemoteCommand(commandId: string): Promise<CommandRecord> {
  const result = await requestJson<{ readonly command: CommandRecord }>("POST", `/api/commands/${encodeURIComponent(commandId)}/approve`);
  return result.command;
}

export async function rejectRemoteCommand(commandId: string): Promise<CommandRecord> {
  const result = await requestJson<{ readonly command: CommandRecord }>("POST", `/api/commands/${encodeURIComponent(commandId)}/reject`);
  return result.command;
}

export async function loadRunReview(runId: string): Promise<RunReviewDto> {
  return requestJson<RunReviewDto>("GET", `/api/runs/${encodeURIComponent(runId)}/review`);
}

export async function restoreRunChanges(runId: string): Promise<readonly string[]> {
  const result = await requestJson<{ readonly revertedPaths: readonly string[] }>("POST", `/api/runs/${encodeURIComponent(runId)}/restore`);
  return result.revertedPaths;
}

export async function continueRun(runId: string, prompt: string): Promise<CommandRecord> {
  const result = await requestJson<{ readonly command: CommandRecord }>("POST", `/api/runs/${encodeURIComponent(runId)}/continue`, { prompt });
  return result.command;
}

export async function saveRemoteModel(provider: string, model: string, tier: string): Promise<RemoteModelDto> {
  return requestJson<RemoteModelDto>("POST", "/api/model", { provider, model, tier });
}

export function stateWithModel(state: RemoteState, model: RemoteModelDto): RemoteState {
  return { ...state, model };
}
