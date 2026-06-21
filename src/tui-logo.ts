import { ansi, paint } from "./ansi.js";

export function renderDreamLogo(): readonly string[] {
  return [
    `  ${paint("▄", ansi.blue)}${paint("▄", ansi.mascotBody)}${paint("▄", ansi.blue)}${paint("▄", ansi.mascotBody)}${paint("▄", ansi.blue)}  `,
    ` ${paint("▟", ansi.blue)}${paint("▀", ansi.mascotBody)}${paint("▀", ansi.blue)}${paint("▀", ansi.mascotBody)}${paint("▀", ansi.blue)}${paint("▀", ansi.mascotBody)}${paint("▙", ansi.blue)} `,
    ` ${paint("█", ansi.mascotBody)} ˘ ˘ ${paint("█", ansi.mascotBody)} `,
    ` ${paint("█", ansi.mascotBody)}  ▄  ${paint("█", ansi.mascotBody)} `,
    `  ${paint("▀▀▀▀▀", ansi.mascotBody)}  `,
  ];
}
