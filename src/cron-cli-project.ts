import {
  deleteCronProject,
  findCronProject,
  listCronJobs,
  listCronProjects,
  renameCronProject,
} from "./cron-store.js";

export async function runCronProjectCommand(root: string, args: readonly string[]): Promise<void> {
  const command = args[0] ?? "list";
  switch (command) {
    case "list":
      await printProjectList(root);
      return;
    case "rename":
      await renameProjectByArgs(root, args.slice(1));
      return;
    case "delete":
    case "remove":
      await deleteProjectByQuery(root, args.slice(1).join(" "));
      return;
    default:
      console.log("Usage: dream cron project list | rename <project> <name> | delete <project>");
      return;
  }
}

async function renameProjectByArgs(root: string, args: readonly string[]): Promise<void> {
  if (args.length < 2) {
    console.log("Usage: dream cron project rename <project> <new name>");
    return;
  }
  const [query, ...nameParts] = args;
  if (query === undefined) {
    console.log("Usage: dream cron project rename <project> <new name>");
    return;
  }
  const project = await findCronProject(root, query);
  const renamed = await renameCronProject(root, project.id, nameParts.join(" "));
  console.log(`cron project renamed: ${renamed.name}`);
}

async function deleteProjectByQuery(root: string, query: string): Promise<void> {
  if (query.trim().length === 0) {
    console.log("Usage: dream cron project delete <project>");
    return;
  }
  const project = await findCronProject(root, query.trim());
  await deleteCronProject(root, project.id);
  console.log(`cron project deleted: ${project.name}`);
}

async function printProjectList(root: string): Promise<void> {
  const projects = await listCronProjects(root);
  for (const project of projects) {
    const jobs = await listCronJobs(root, project.id);
    console.log(`${project.name} ${jobs.length} job(s) ${project.cwd}`);
  }
  if (projects.length === 0) {
    console.log("Cron: no projects");
  }
}
