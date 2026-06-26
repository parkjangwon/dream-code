import { appendActorInboxMessages } from "./agent-inbox-context.js";
import { createAgentMessages } from "./agent-messages.js";
import type { AgentPromptOptions } from "./agent-runner.js";
import { connectedProviderIds, firstSelectedModel, tierForAgent } from "./agent-runner-routing.js";
import { appendSteeringMessages } from "./agent-steering.js";
import { loadContextDocs } from "./context-docs.js";
import { loadCredentials } from "./credentials.js";
import { formatMentionedReferencesForPrompt, loadMentionedReferences } from "./file-mention-context.js";
import type { ChatMessage } from "./llm-provider.js";
import { formatLiveMcpContext } from "./mcp-context.js";
import { formatModelRoutingContext } from "./model-routing-context.js";
import { selectModelCandidatesForPrompt, type SelectedModel } from "./model-routing.js";
import { readStickyModel } from "./model-routing-state.js";
import { loadUnhealthyModelKeys } from "./model-telemetry.js";
import { modelAvailableForCredential } from "./model-availability.js";
import { formatMemoryContext } from "./memory-store.js";
import { formatCompactContext } from "./session-actions.js";
import { recentSessionMessages } from "./session-context.js";
import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { defaultSkillRoots, loadSkills } from "./skills.js";
import { loadWorkspaceDirs } from "./workspace-state.js";

export type PreparedAgentContext = {
  readonly selectedModels: readonly SelectedModel[];
  readonly primaryModel: SelectedModel;
  readonly messages: readonly ChatMessage[];
};

export async function prepareAgentContext(
  options: AgentPromptOptions,
  configRoot: string,
  actorId: string,
  activeCwd: string,
): Promise<PreparedAgentContext> {
  const credentials = await loadCredentials(configRoot);
  const stickyModel = await readStickyModel(configRoot, options.sessionId);
  const selectedModels = selectModelCandidatesForPrompt(options.config.model, options.prompt, tierForAgent(options.agent), {
    connectedProviders: connectedProviderIds(options.config, credentials, process.env),
    unhealthyModels: await loadUnhealthyModelKeys(configRoot),
    modelAvailable: (provider, model) => modelAvailableForCredential(provider, model, credentials.providers[provider]),
    ...(options.agent === undefined ? {} : { agentId: options.agent.id }),
    ...(stickyModel === undefined ? {} : { stickyModel }),
  });
  const settings = await loadSkillSettings(configRoot);
  const skills = (await loadSkills(defaultSkillRoots(undefined, activeCwd))).filter((skill) => skillEnabled(settings, skill.name));
  const contextDocs = await loadContextDocs({ configRoot, cwd: activeCwd, prompt: options.prompt });
  const workspaceDirs = await loadWorkspaceDirs(configRoot);
  const mentionedContext = formatMentionedReferencesForPrompt(await loadMentionedReferences(options.prompt, { cwd: activeCwd, workspaceDirs }));
  const mcpContext = await formatLiveMcpContext(configRoot, options.signal);
  const compactContext = await formatCompactContext(configRoot, options.sessionId);
  const memoryContext = await formatMemoryContext(configRoot, activeCwd, options.sessionId, options.prompt);
  const recentMessages = await recentSessionMessages(configRoot, options.sessionId, options.prompt);
  const messages = appendSteeringMessages(
    await appendActorInboxMessages(
      configRoot,
      actorId,
      createAgentMessages(
        options.prompt,
        skills,
        options.agent,
        contextDocs,
        workspaceDirs,
        mcpContext,
        compactContext,
        memoryContext,
        activeCwd,
        recentMessages,
        mentionedContext,
        formatModelRoutingContext(selectedModels),
      ),
    ),
    options.steering,
  );

  return {
    selectedModels,
    primaryModel: firstSelectedModel(selectedModels),
    messages,
  };
}
