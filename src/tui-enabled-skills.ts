import { loadSkillSettings, skillEnabled } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";

export async function loadEnabledSkills(configRoot: string): Promise<readonly DreamSkill[]> {
  const settings = await loadSkillSettings(configRoot);
  return (await loadSkills()).filter((skill) => skillEnabled(settings, skill.name));
}
