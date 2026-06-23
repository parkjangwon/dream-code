import { deleteProviderCredential } from "./credentials.js";
import type { Questioner } from "./tui-workspace-commands.js";

export async function logoutProvider(root: string, rest: string, questioner: Questioner): Promise<string> {
  const provider = rest.trim().length > 0 ? rest.trim() : await questioner.question("Provider: ");
  const providerId = provider.trim();
  if (providerId.length === 0) {
    return "logout skipped: no provider";
  }
  return await deleteProviderCredential(root, providerId) ? `logged out: ${providerId}` : `logout skipped: ${providerId} was not saved`;
}
