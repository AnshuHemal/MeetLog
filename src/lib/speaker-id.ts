export function normalizeSpeakerId(raw: string | number): string {
  const str = String(raw).trim();

  const prefixed = str.match(/^SPEAKER_(\d+)$/i);
  if (prefixed) {
    const num = parseInt(prefixed[1], 10);
    return `SPEAKER_${String(num).padStart(2, "0")}`;
  }

  const num = parseInt(str, 10);
  if (!Number.isNaN(num)) {
    return `SPEAKER_${String(num).padStart(2, "0")}`;
  }

  return `SPEAKER_${str}`;
}

export function collectUniqueSpeakerIds(
  entries: Array<{ speaker_id: string | number }>,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const entry of entries) {
    const id = normalizeSpeakerId(entry.speaker_id);
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  return ordered;
}
