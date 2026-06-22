import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { defaultSkillRoots, loadSkills } from "./skills.js";

export async function isSkillInvocation(configRoot: string, cwd: string, commandName: string): Promise<boolean> {
  if (!commandName.startsWith("/") || commandName.length <= 1) {
    return false;
  }
  const skillName = commandName.slice(1);
  const settings = await loadSkillSettings(configRoot);
  const skills = await loadSkills(defaultSkillRoots(undefined, cwd));
  return skills.some((skill) => skill.name === skillName && skillEnabled(settings, skill.name));
}
