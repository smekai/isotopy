const BASIC_ESCAPES = /[\\"]/g;

export function tomlString(value: string): string {
  return value.includes("'") ? `"${value.replace(BASIC_ESCAPES, "\\$&")}"` : `'${value}'`;
}

export function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

export function tomlStringTable(entries: Record<string, string>): string {
  const pairs = Object.entries(entries).map(([key, value]) => `${key} = ${tomlString(value)}`);
  return `{ ${pairs.join(", ")} }`;
}
