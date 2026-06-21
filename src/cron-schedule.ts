export class CronScheduleError extends Error {
  constructor(schedule: string) {
    super(`Unsupported cron schedule: ${schedule}`);
    this.name = "CronScheduleError";
  }
}

type CronFields = {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly days: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly weekdays: ReadonlySet<number>;
};

const minuteMs = 60_000;

export function nextCronRunAt(schedule: string, after: Date): string {
  const fields = parseCronFields(schedule);
  const start = new Date(Math.floor(after.getTime() / minuteMs) * minuteMs + minuteMs);
  for (let offset = 0; offset < 527_040; offset += 1) {
    const candidate = new Date(start.getTime() + offset * minuteMs);
    if (matches(candidate, fields)) {
      return candidate.toISOString();
    }
  }
  throw new CronScheduleError(schedule);
}

export function nextCronRun(schedule: string, after: Date): Date | undefined {
  try {
    return new Date(nextCronRunAt(schedule, after));
  } catch (error) {
    if (error instanceof CronScheduleError) {
      return undefined;
    }
    throw error;
  }
}

export type CronDraft = {
  readonly projectName: string;
  readonly schedule: string;
  readonly prompt: string;
};

export function parseCronDraft(text: string, cwd: string): CronDraft {
  const normalized = text.trim().replace(/\s+/gu, " ");
  const dailyMatch = normalized.match(/^(?:cron\s+)?(?:every day|daily)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(.*)$/iu);
  if (dailyMatch !== null) {
    const hourRaw = dailyMatch[1];
    const minuteRaw = dailyMatch[2] ?? "0";
    const prompt = dailyMatch[3]?.trim() ?? "";
    const hour = hourRaw === undefined ? undefined : parseBoundedInt(hourRaw, 0, 23);
    const minute = parseBoundedInt(minuteRaw, 0, 59);
    if (hour !== undefined && minute !== undefined && prompt.length > 0) {
      return { projectName: projectNameFromCwd(cwd), schedule: `${minute} ${hour} * * *`, prompt };
    }
  }

  const hourlyMatch = normalized.match(/^(?:cron\s+)?(?:hourly|every hour)\s*(.*)$/iu);
  if (hourlyMatch !== null) {
    const prompt = hourlyMatch[1]?.trim() ?? "";
    if (prompt.length > 0) {
      return { projectName: projectNameFromCwd(cwd), schedule: "0 * * * *", prompt };
    }
  }

  const cronMatch = normalized.match(/^(?:cron\s+)?(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/u);
  if (cronMatch !== null) {
    const schedule = cronMatch[1]?.trim() ?? "";
    const prompt = cronMatch[2]?.trim() ?? "";
    if (schedule.length > 0 && prompt.length > 0) {
      nextCronRunAt(schedule, new Date());
      return { projectName: projectNameFromCwd(cwd), schedule, prompt };
    }
  }

  throw new CronScheduleError(normalized);
}

function parseCronFields(schedule: string): CronFields {
  const parts = schedule.trim().split(/\s+/u);
  if (parts.length !== 5) {
    throw new CronScheduleError(schedule);
  }
  const [minute, hour, day, month, weekday] = parts;
  if (minute === undefined || hour === undefined || day === undefined || month === undefined || weekday === undefined) {
    throw new CronScheduleError(schedule);
  }
  return {
    minutes: parseField(minute, 0, 59, schedule),
    hours: parseField(hour, 0, 23, schedule),
    days: parseField(day, 1, 31, schedule),
    months: parseField(month, 1, 12, schedule),
    weekdays: parseField(weekday, 0, 7, schedule),
  };
}

function parseField(raw: string, min: number, max: number, schedule: string): ReadonlySet<number> {
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    if (part === "*") {
      addRange(values, min, max, 1);
      continue;
    }
    if (part.startsWith("*/")) {
      addRange(values, min, max, parseStep(part.slice(2), schedule));
      continue;
    }
    const value = Number.parseInt(part, 10);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new CronScheduleError(schedule);
    }
    values.add(value);
  }
  if (values.size === 0) {
    throw new CronScheduleError(schedule);
  }
  return values;
}

function parseStep(raw: string, schedule: string): number {
  const step = Number.parseInt(raw, 10);
  if (!Number.isInteger(step) || step < 1) {
    throw new CronScheduleError(schedule);
  }
  return step;
}

function addRange(values: Set<number>, min: number, max: number, step: number): void {
  for (let value = min; value <= max; value += step) {
    values.add(value);
  }
}

function matches(date: Date, fields: CronFields): boolean {
  const weekday = date.getUTCDay();
  return fields.minutes.has(date.getUTCMinutes())
    && fields.hours.has(date.getUTCHours())
    && fields.days.has(date.getUTCDate())
    && fields.months.has(date.getUTCMonth() + 1)
    && (fields.weekdays.has(weekday) || (weekday === 0 && fields.weekdays.has(7)));
}

function projectNameFromCwd(cwd: string): string {
  const normalized = cwd.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "Dream Code";
}

function parseBoundedInt(raw: string, min: number, max: number): number | undefined {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}
