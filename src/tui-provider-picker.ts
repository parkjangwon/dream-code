import { stdout as output } from "node:process";

import {
  formatLoginMenu,
  formatLoginSource,
  authLabel,
  loginChoiceValue,
  resolveLoginSelection,
  type LoginChoice,
} from "./tui-login-menu.js";
import type { PickerOptions } from "./tui-picker.js";

export type ProviderQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly secret?: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

export async function promptProvider(
  questioner: ProviderQuestioner,
  choices: readonly LoginChoice[],
): Promise<LoginChoice | undefined> {
  if (questioner.select !== undefined) {
    const selection = await questioner.select({
      title: "Login",
      choices: choices.map((choice) => ({
        value: loginChoiceValue(choice),
        label: choice.definition.displayName,
        description: `${choice.definition.id} ${authLabel(choice)} ${formatLoginSource(choice.source)}`,
        descriptionStyle: "raw",
        keywords: [
          choice.definition.id,
          choice.definition.displayName,
          choice.authMode,
          authLabel(choice),
          authKeyword(choice),
          ...choice.definition.envKeys,
        ],
      })),
    });
    return selection === undefined ? undefined : resolveLoginSelection(selection, choices);
  }

  output.write(formatLoginMenu(choices));
  const selection = await questioner.question("Provider: ");
  if (selection.trim().length === 0) {
    return undefined;
  }
  return resolveLoginSelection(selection, choices);
}

function authKeyword(choice: LoginChoice): string {
  return choice.authMode === "oauth" ? "subscription" : "api";
}
