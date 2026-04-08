export function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function humanizeIdentifier(value: string): string {
  const words = splitIdentifier(value);
  if (words.length === 0) {
    return value;
  }

  return words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower;
  }).join(" ");
}

export function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function renderCodeBlock(language: string, lines: string[]): string {
  return `\`\`\`${language}\n${lines.join("\n")}\n\`\`\``;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

