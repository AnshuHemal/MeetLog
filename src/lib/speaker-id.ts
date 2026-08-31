/**
 * Cleanly normalizes speaker IDs into consistent format (e.g. SPEAKER_01, SPEAKER_02)
 * Handles "Speaker 1", "SPEAKER_00", "SPEAKER_SPEAKER_1", "1", "spk_1", etc.
 */
export function normalizeSpeakerId(raw: string | number): string {
  let str = String(raw).trim();
  
  // If already standard SPEAKER_01 or SPEAKER_1, ensure uppercase with leading zero
  const standardMatch = str.match(/^SPEAKER_(\d+)$/i);
  if (standardMatch) {
    const num = parseInt(standardMatch[1], 10);
    return `SPEAKER_${String(num).padStart(2, "0")}`;
  }

  // Remove redundant SPEAKER_ prefixes if present
  str = str.replace(/^(?:SPEAKER_)+/i, "");

  // Extract trailing or internal number
  const match = str.match(/(\d+)/);
  if (match) {
    let num = parseInt(match[1], 10);
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
