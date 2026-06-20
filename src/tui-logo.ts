import { ansi, paint } from "./ansi.js";

export function renderDreamLogo(): readonly string[] {
  return [
    paint("  ▄███▄  ", ansi.mascotTop),
    paint("   ███   ", ansi.mascotTop),
    paint(" ▐▛███▜▌ ", ansi.mascotBody),
    paint("▝▜█████▛▘", ansi.mascotBody),
    paint("  ▘▘ ▝▝  ", ansi.mascotBody),
  ];
}
