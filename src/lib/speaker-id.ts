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

/**
 * Consolidates and removes phantom/spurious speakers.
 * If total speakers is 1 (or expected to be 1), or if a single dominant speaker has >= 88% of speech
 * and another speaker only has isolated stray snippets (< 6% of total speech / < 10 seconds),
 * consolidates them into the dominant speaker.
 */
export function consolidateSpeakerDiarization<
  T extends {
    speaker_id?: string | number;
    start_time_seconds?: number | string;
    end_time_seconds?: number | string;
  }
>(entries: T[], expectedNumSpeakers?: number): T[] {
  if (!entries || entries.length === 0) return entries;

  // 1. If explicit 1 speaker was specified, force all to Speaker 1
  if (expectedNumSpeakers === 1) {
    for (const e of entries) {
      e.speaker_id = "Speaker 1";
    }
    return entries;
  }

  // 2. Measure total duration per speaker
  const speakerDurations = new Map<string, number>();
  let totalDuration = 0;

  for (const e of entries) {
    const spk = normalizeSpeakerId(e.speaker_id || "Speaker 1");
    const start = parseFloat(String(e.start_time_seconds || 0));
    const end = parseFloat(String(e.end_time_seconds || start + 1));
    const dur = Math.max(0.5, end - start);
    totalDuration += dur;
    speakerDurations.set(spk, (speakerDurations.get(spk) || 0) + dur);
  }

  if (totalDuration <= 0) return entries;

  // Find dominant speaker
  let dominantSpeaker = "SPEAKER_01";
  let maxDuration = 0;

  for (const [spk, dur] of speakerDurations.entries()) {
    if (dur > maxDuration) {
      maxDuration = dur;
      dominantSpeaker = spk;
    }
  }

  const dominantRatio = maxDuration / totalDuration;

  // If dominant speaker has >= 88% of speech, eliminate micro-artifacts (< 6% of duration)
  if (dominantRatio >= 0.88) {
    const dominantLabel = dominantSpeaker.replace("SPEAKER_0", "Speaker ").replace("SPEAKER_", "Speaker ");
    for (const e of entries) {
      const spk = normalizeSpeakerId(e.speaker_id || "Speaker 1");
      const spkDur = speakerDurations.get(spk) || 0;
      if (spk !== dominantSpeaker && (spkDur / totalDuration < 0.06 || spkDur < 10)) {
        e.speaker_id = dominantLabel;
      }
    }
  }

  return entries;
}
