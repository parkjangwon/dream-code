export type PickerChoice = {
  readonly value: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
};

export type PickerState = {
  readonly choices: readonly PickerChoice[];
  readonly query: string;
  readonly selectedIndex: number;
};

export type PickerAction =
  | { readonly kind: "insert"; readonly value: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "up" }
  | { readonly kind: "down" };

export function createPickerState(
  choices: readonly PickerChoice[],
  initialValue = "",
): PickerState {
  const initialIndex = Math.max(0, choices.findIndex((choice) => choice.value === initialValue));
  return { choices, query: "", selectedIndex: initialIndex };
}

export function reducePickerState(state: PickerState, action: PickerAction): PickerState {
  switch (action.kind) {
    case "insert":
      return { ...state, query: `${state.query}${action.value}`, selectedIndex: 0 };
    case "backspace":
      return { ...state, query: state.query.slice(0, -1), selectedIndex: 0 };
    case "up":
      return moveSelection(state, -1);
    case "down":
      return moveSelection(state, 1);
    default:
      return assertNever(action);
  }
}

export function pickerVisibleChoices(state: PickerState): readonly PickerChoice[] {
  const query = state.query.trim().toLowerCase();
  if (query.length === 0) {
    return state.choices;
  }
  return state.choices.filter((choice) => matchesChoice(choice, query));
}

export function pickerSelection(state: PickerState): PickerChoice | undefined {
  return pickerVisibleChoices(state)[state.selectedIndex];
}

function moveSelection(state: PickerState, offset: number): PickerState {
  const visibleCount = pickerVisibleChoices(state).length;
  if (visibleCount === 0) {
    return { ...state, selectedIndex: 0 };
  }
  const nextIndex = (state.selectedIndex + offset + visibleCount) % visibleCount;
  return { ...state, selectedIndex: nextIndex };
}

function matchesChoice(choice: PickerChoice, query: string): boolean {
  return [
    choice.value,
    choice.label,
    choice.description,
    ...choice.keywords,
  ].some((part) => part.toLowerCase().includes(query));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected picker action: ${String(value)}`);
}
