/**
 * Cleanly normalizes speaker IDs into consistent format (e.g. SPEAKER_01, SPEAKER_02)
 * Handles "Speaker 1", "SPEAKER_00", "SPEAKER_SPEAKER_1", "1", "spk_1", etc.
 */
export function normalizeSpeakerId(raw: string | number): string {
  const str = String(raw).trim();

  // Extract trailing or internal number
  const match = str.match(/(\d+)/);
  if (match) {
    let num = parseInt(match[1], 10);
    // If it was 0-based like "SPEAKER_00", map to 1-based "SPEAKER_01"
    if (str.toLowerCase().includes("00") && num === 0) {
      num = 1;
    } else if (num === 0) {
      num = 1;
    }
    return `SPEAKER_${String(num).padStart(2, "0")}`;
  }

  // If no number found, sanitize string
  const clean = str.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return `SPEAKER_${clean || "01"}`;
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
