/** Human names for the agent's tools, as Grandpa would put it. */
const LABELS: Record<string, string> = {
  calculator: "Calculated the trespass fine",
  get_weather: "Checked the sky",
  local_searchMM: "Looked it up in the MulaMula book",
  check_property_status: "Checked the land registry",
  call_trey_taylor: "Called Trey Taylor",
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? `Used ${name}`;
}

export function argsSummary(args: Record<string, unknown>): string {
  return Object.values(args)
    .map((v) => String(v))
    .join(", ");
}
