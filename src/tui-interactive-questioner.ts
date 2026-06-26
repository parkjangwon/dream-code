import type { DreamConfig } from "./config.js";
import { readInteractiveAgentView } from "./tui-agent-view.js";
import { readInteractiveInput } from "./tui-input.js";
import { readInteractivePicker } from "./tui-picker.js";
import { readInteractiveProviderManager } from "./tui-provider-manager.js";
import type { Questioner } from "./tui-questioner.js";
import { renderHeader } from "./tui-render.js";
import { readInteractiveSkillManager } from "./tui-skill-manager.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";

type TuiQuestionerOptions = {
  readonly oneShotYolo: boolean;
};

export function nonInteractiveQuestioner(): Questioner {
  return {
    question: async () => "",
  };
}

export function interactiveQuestioner(
  config: DreamConfig,
  options: TuiQuestionerOptions,
  onResize?: ResizeSubscriber,
): Questioner {
  let wasCancelled = false;
  return {
    question: async (prompt) => {
      if (wasCancelled) {
        return "";
      }
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
        cancelOnEmptyBackspace: true,
        ...(onResize === undefined ? {} : { onResize }),
      });
      wasCancelled = answer.kind === "cancel";
      return answer.kind === "submit" ? answer.text : "";
    },
    secret: async (prompt) => {
      if (wasCancelled) {
        return "";
      }
      const answer = await readInteractiveInput({
        prompt,
        history: [],
        commands: [],
        secret: true,
        redrawHeader: () => {
          renderHeader(config, options.oneShotYolo);
        },
        cancelOnEmptyBackspace: true,
        ...(onResize === undefined ? {} : { onResize }),
      });
      wasCancelled = answer.kind === "cancel";
      return answer.kind === "submit" ? answer.text : "";
    },
    wasCancelled: () => wasCancelled,
    select: async (pickerOptions) => readInteractivePicker({
      ...pickerOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageProviders: async (providerOptions) => readInteractiveProviderManager({
      ...providerOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageSkills: async (skillOptions) => readInteractiveSkillManager({
      ...skillOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
    manageAgents: async (agentOptions) => readInteractiveAgentView({
      ...agentOptions,
      redrawHeader: () => {
        renderHeader(config, options.oneShotYolo);
      },
    }),
  };
}
