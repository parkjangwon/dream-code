import { cwd as currentWorkingDirectory } from "node:process";

import { listAgentBoardRows } from "./agent-board.js";
import { loadAgentDefinitions } from "./agent-definition-loader.js";
import type { AgentViewOptions } from "./tui-agent-view.js";

export async function loadAgentViewOptions(
  configRoot: string,
  cwd = currentWorkingDirectory(),
): Promise<AgentViewOptions> {
  const [rows, agents] = await Promise.all([
    listAgentBoardRows(configRoot),
    loadAgentDefinitions(configRoot, cwd),
  ]);
  return { rows, agents };
}
