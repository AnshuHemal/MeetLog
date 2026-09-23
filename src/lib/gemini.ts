import axios from "axios";
import {
  waitForAvailableKey,
  reportKeySuccess,
  reportKeyRateLimit,
  reportKeyExhausted,
  parseGoogleRetryDelay,
} from "./key-pool";
import { formatSecondsToTime } from "./time-utils";

export interface GeneratedMeetingInsights {
  summary: string;
  topics: string[];
  actionItems: Array<{
    task: string;
    assignee: string | null;
  }>;
}

export interface GeneratedMeetingChapter {
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
}

export interface SegmentSentimentResult {
  id: string;
  sentiment: "positive" | "neutral" | "negative";
}

/**
 * Safely parses and cleans JSON output from Gemini
 */
function cleanParseJson<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {}
    }

    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {}
    }
  }
  return fallback;
}

/**
 * Central execution engine for Gemini LLM calls with multi-key pool rotation and multi-model failover.
 * If allowWaiting is false, immediately throws when all keys are rate-limited instead of waiting in a 30s loop!
 */
async function callGeminiWithPool(
  promptText: string,
  isJson: boolean = false,
  temperature: number = 0.2,
  excludedKeyIds: string[] = [],
  allowWaiting: boolean = false
): Promise<string> {
  const { getAvailableKey, waitForAvailableKey } = await import("./key-pool");

  let keySelection = null;
  if (allowWaiting) {
    keySelection = await waitForAvailableKey("GEMINI", excludedKeyIds, 30000);
  } else {
    keySelection = await getAvailableKey("GEMINI", excludedKeyIds);
  }

  if (!keySelection) {
    throw new Error("All Gemini API keys are currently rate-limited or exhausted.");
  }

  const { id: keyId, key: apiKey } = keySelection;
  const modelsToTry = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
  ];

  for (const modelName of modelsToTry) {
    try {
      const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const payload: any = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature,
        },
      };

      if (isJson) {
        payload.generationConfig.responseMimeType = "application/json";
      }

      const res = await axios.post(generateUrl, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 90000,
        validateStatus: () => true,
      });

      if (res.status === 200) {
        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          await reportKeySuccess(keyId);
          return text.trim();
        }
      } else if (res.status === 429) {
        const retrySecs = parseGoogleRetryDelay(JSON.stringify(res.data));
        await reportKeyRateLimit(keyId, retrySecs, JSON.stringify(res.data));
        return callGeminiWithPool(promptText, isJson, temperature, [...excludedKeyIds, keyId], allowWaiting);
      } else if (res.status === 402 || res.status === 403) {
        await reportKeyExhausted(keyId, JSON.stringify(res.data));
        return callGeminiWithPool(promptText, isJson, temperature, [...excludedKeyIds, keyId], allowWaiting);
      }
    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        const retrySecs = parseGoogleRetryDelay(err.message);
        await reportKeyRateLimit(keyId, retrySecs, err.message);
        return callGeminiWithPool(promptText, isJson, temperature, [...excludedKeyIds, keyId], allowWaiting);
      }
    }
  }

  // If all models failed on this key, rotate to next key
  return callGeminiWithPool(promptText, isJson, temperature, [...excludedKeyIds, keyId], allowWaiting);
}

export async function generateMeetingInsights(
  transcriptText: string
): Promise<GeneratedMeetingInsights> {
  const CHUNK_SIZE = 50_000;
  if (transcriptText.length > CHUNK_SIZE) {
    console.log(`[GEMINI INSIGHTS] Processing long transcript (${transcriptText.length} chars) with multi-chunk synthesis...`);
    const chunks: string[] = [];
    for (let i = 0; i < transcriptText.length; i += CHUNK_SIZE) {
      chunks.push(transcriptText.slice(i, i + CHUNK_SIZE));
    }

    const partialResults: GeneratedMeetingInsights[] = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkPrompt = `You are an executive analyst. Analyze part ${idx + 1} of ${chunks.length} of a meeting transcript.
Extract key takeaways, summary bullet points, topics, and action items with assignees.

Return STRICT JSON format matching:
{
  "summary": "Section summary markdown",
  "topics": ["topic1", "topic2"],
  "actionItems": [{"task": "Task description", "assignee": "Name or null"}]
}

Transcript Section:
${chunks[idx]}
`;
      try {
        const textResult = await callGeminiWithPool(chunkPrompt, true, 0.2);
        const parsed = cleanParseJson<GeneratedMeetingInsights>(textResult, {
          summary: "",
          topics: [],
          actionItems: [],
        });
        if (parsed.summary) partialResults.push(parsed);
      } catch (err) {
        console.error(`[GEMINI INSIGHTS] Chunk ${idx + 1} failed:`, err);
      }
    }

    if (partialResults.length > 0) {
      const mergedSummaries = partialResults.map((p, i) => `### Section ${i + 1}\n${p.summary}`).join("\n\n");
      const mergedActionItems = partialResults.flatMap((p) => p.actionItems);
      const mergedTopics = Array.from(new Set(partialResults.flatMap((p) => p.topics)));

      const masterPrompt = `You are a Lead Executive Analyst. Synthesize the following section summaries into a single, cohesive, highly structured executive meeting summary markdown (with Executive Overview, Key Discussion Highlights, Decisions Made, and Next Steps).

Section Summaries:
${mergedSummaries}

Return STRICT JSON:
{
  "summary": "Unified Executive Markdown Summary",
  "topics": ${JSON.stringify(mergedTopics)},
  "actionItems": ${JSON.stringify(mergedActionItems)}
}
`;
      try {
        const masterResult = await callGeminiWithPool(masterPrompt, true, 0.2);
        return cleanParseJson<GeneratedMeetingInsights>(masterResult, {
          summary: mergedSummaries,
          topics: mergedTopics,
          actionItems: mergedActionItems,
        });
      } catch {
        return {
          summary: mergedSummaries,
          topics: mergedTopics,
          actionItems: mergedActionItems,
        };
      }
    }
  }

  const prompt = `You are a professional business analyst. Analyze the following meeting transcript. 
Extract a comprehensive executive summary (formatted in clean markdown), core topics/tags discussed, and clear action items with assignees.

Return your output STRICTLY as a JSON object matching this schema:
{
  "summary": "Detailed executive markdown summary with ## Overview, ## Key Points, and ## Decisions Made.",
  "topics": ["topic1", "topic2", "topic3"],
  "actionItems": [
    {
      "task": "Specific task description",
      "assignee": "Speaker Name or null"
    }
  ]
}

Transcript:
${transcriptText}
`;

  try {
    const textResult = await callGeminiWithPool(prompt, true, 0.2);
    return cleanParseJson<GeneratedMeetingInsights>(textResult, {
      summary: "Executive summary was synthesized from the discussion.",
      topics: ["General Discussion"],
      actionItems: [],
    });
  } catch (error: any) {
    console.error("Error generating insights from Gemini pool:", error.message);
    return {
      summary: "## Meeting Summary\nDiscussion recorded and transcribed successfully.",
      topics: ["Meeting"],
      actionItems: [],
    };
  }
}

export function normalizeMeetingChapters(
  rawChapters: GeneratedMeetingChapter[],
  totalDurationSeconds?: number
): GeneratedMeetingChapter[] {
  if (!rawChapters || !Array.isArray(rawChapters) || rawChapters.length === 0) {
    if (totalDurationSeconds && totalDurationSeconds > 0) {
      return [
        {
          startTime: 0.0,
          endTime: Math.round(totalDurationSeconds * 10) / 10,
          title: "Full Meeting Discussion",
          summary: "Complete recording discussion.",
        },
      ];
    }
    return [];
  }

  // Filter valid entries with title and valid numbers
  const valid = rawChapters.filter(
    (c) =>
      c &&
      typeof c.title === "string" &&
      c.title.trim().length > 0 &&
      !isNaN(Number(c.startTime)) &&
      !isNaN(Number(c.endTime))
  );

  if (valid.length === 0) {
    if (totalDurationSeconds && totalDurationSeconds > 0) {
      return [
        {
          startTime: 0.0,
          endTime: Math.round(totalDurationSeconds * 10) / 10,
          title: "Full Meeting Discussion",
          summary: "Complete recording discussion.",
        },
      ];
    }
    return [];
  }

  // Sort by startTime
  valid.sort((a, b) => Number(a.startTime) - Number(b.startTime));

  const result: GeneratedMeetingChapter[] = [];

  for (let i = 0; i < valid.length; i++) {
    const raw = valid[i];
    let start = Number(raw.startTime);
    let end = Number(raw.endTime);

    // If first chapter, ensure start is strictly 0.0
    if (i === 0) {
      start = 0.0;
    } else {
      // Stitch seamlessly to previous chapter end
      const prevEnd = result[i - 1].endTime;
      start = prevEnd;
    }

    // Ensure end is strictly greater than start
    if (end <= start) {
      end = start + 30.0;
    }

    // If total duration is known, clamp end so it doesn't overshoot
    if (totalDurationSeconds && totalDurationSeconds > 0 && end > totalDurationSeconds) {
      end = totalDurationSeconds;
    }

    result.push({
      startTime: Math.round(start * 10) / 10,
      endTime: Math.round(end * 10) / 10,
      title: raw.title.trim(),
      summary: (raw.summary || "").trim(),
    });
  }

  // Ensure full coverage to totalDurationSeconds if specified
  if (totalDurationSeconds && totalDurationSeconds > 0 && result.length > 0) {
    const lastChapter = result[result.length - 1];
    const diff = totalDurationSeconds - lastChapter.endTime;

    if (diff > 45) {
      // If gap at the end is more than 45s, add a wrap-up chapter
      result.push({
        startTime: lastChapter.endTime,
        endTime: Math.round(totalDurationSeconds * 10) / 10,
        title: "Closing Discussion & Next Steps",
        summary: "Meeting conclusions, action review, and closing remarks.",
      });
    } else if (diff > 0) {
      // Minor difference: extend the last chapter to the exact end
      lastChapter.endTime = Math.round(totalDurationSeconds * 10) / 10;
    }
  }

  return result;
}

export async function generateMeetingChapters(
  transcriptInput:
    | string
    | Array<{
        startTime: number;
        endTime: number;
        speakerId?: string;
        text: string;
      }>,
  totalDurationSeconds?: number
): Promise<GeneratedMeetingChapter[]> {
  let formattedTranscript = "";
  let effectiveDuration = totalDurationSeconds || 0;

  if (Array.isArray(transcriptInput)) {
    formattedTranscript = transcriptInput
      .map(
        (seg) =>
          `[${formatSecondsToTime(seg.startTime)}] [${seg.speakerId || "Speaker"}]: ${seg.text}`
      )
      .join("\n");
    if (!effectiveDuration && transcriptInput.length > 0) {
      const lastSeg = transcriptInput[transcriptInput.length - 1];
      effectiveDuration = Math.max(lastSeg.endTime || 0, lastSeg.startTime || 0);
    }
  } else {
    formattedTranscript = transcriptInput;
  }

  // If duration still not provided, detect the highest [MM:SS] or [HH:MM:SS] timestamp from text
  if (!effectiveDuration || effectiveDuration <= 0) {
    const timestampMatches = Array.from(
      formattedTranscript.matchAll(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g)
    );
    let maxFound = 0;
    for (const match of timestampMatches) {
      let secs = 0;
      if (match[3]) {
        secs =
          parseInt(match[1], 10) * 3600 +
          parseInt(match[2], 10) * 60 +
          parseInt(match[3], 10);
      } else {
        secs = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
      if (secs > maxFound) maxFound = secs;
    }
    if (maxFound > 0) {
      effectiveDuration = maxFound;
    }
  }

  const durationStr =
    effectiveDuration > 0
      ? `${formatSecondsToTime(effectiveDuration)} (${Math.round(effectiveDuration)} seconds)`
      : "the entire recording";

  const prompt = `You are an expert executive meeting analyst and chapter indexer.
Analyze the following meeting transcript and divide it into clear, coherent, chronological chapters covering the ENTIRE audio recording from start to finish.

CRITICAL REQUIREMENTS:
1. FULL RECORDING COVERAGE: The meeting recording lasts ${durationStr}. Your chapters MUST span the ENTIRE recording from 0.0 seconds to ${effectiveDuration > 0 ? effectiveDuration.toFixed(1) : "the end of the meeting"} seconds. Do NOT stop after the first few minutes or ignore the later portions of the meeting.
2. CONTINUOUS TIMELINE:
   - The first chapter MUST start at "startTime": 0.0.
   - Each subsequent chapter's "startTime" must seamlessly connect with the previous chapter's "endTime" without unindexed gaps.
   - The final chapter MUST end at "endTime": ${effectiveDuration > 0 ? effectiveDuration.toFixed(1) : "the end timestamp"}.
3. PRECISE TIMESTAMPS: Use the bracketed timestamps [MM:SS] present throughout the transcript to determine accurate start and end times in seconds (e.g., [03:45] = 225.0, [14:20] = 860.0).
4. LOGICAL CHAPTER COUNT: Create between 4 and 12 distinct chapters depending on topic shifts across the whole meeting (each chapter typically 2 to 6 minutes long).
5. PROFESSIONAL TITLES & SUMMARIES:
   - "title": A concise, punchy, professional headline (3-7 words) summarizing the core topic.
   - "summary": A crisp 1-2 sentence description highlighting key decisions, updates, or discussions during that segment.

Return your output STRICTLY as a JSON array of objects with no markdown wrapping or extraneous text:
[
  {
    "startTime": 0.0,
    "endTime": 185.0,
    "title": "Introductions & Meeting Agenda",
    "summary": "The team aligns on meeting objectives and reviews initial metrics."
  },
  {
    "startTime": 185.0,
    "endTime": ${effectiveDuration > 0 ? effectiveDuration.toFixed(1) : "600.0"},
    "title": "Project Architecture & Key Discussion",
    "summary": "Detailed review of client workflows, technical deliverables, and next steps."
  }
]

Transcript:
${formattedTranscript}
`;

  try {
    const textResult = await callGeminiWithPool(prompt, true, 0.2);
    const parsed = cleanParseJson<GeneratedMeetingChapter[]>(textResult, []);
    return normalizeMeetingChapters(parsed, effectiveDuration > 0 ? effectiveDuration : undefined);
  } catch (error: any) {
    console.error("Error generating chapters from Gemini pool:", error.message);
    return normalizeMeetingChapters([], effectiveDuration > 0 ? effectiveDuration : undefined);
  }
}

export async function generateFollowUpEmail(
  title: string,
  summary: string,
  actionItems: string[]
): Promise<string> {
  const prompt = `You are a professional executive assistant. Draft a polished, professional follow-up email based on the following meeting details.

Meeting Title: ${title}
Executive Summary:
${summary}

Action Items:
${actionItems.map((item, idx) => `${idx + 1}. ${item}`).join("\n")}

Return ONLY the body content of the email draft with clean formatting (Greeting, Highlights, Action Items, Sign-off).
`;

  try {
    return await callGeminiWithPool(prompt, false, 0.3);
  } catch (error: any) {
    console.error("Error generating email from Gemini pool:", error.message);
    return `Subject: Follow-up: ${title}\n\nHi Team,\n\nHere is a summary of our recent discussion:\n\n${summary}\n\nBest regards.`;
  }
}

export async function answerTranscriptQuestion(
  transcriptText: string,
  userQuery: string
): Promise<string> {
  const prompt = `You are a helpful, expert AI assistant inside MeetLog.
Analyze the provided meeting transcript and answer the user's question accurately, thoroughly, and professionally.

FORMATTING REQUIREMENTS:
- Format your response in clean, beautiful Markdown.
- Organize your answer with clear section headings (e.g., "### 1. Section Title" or "### Summary").
- Use bullet points (- or *) for distinct items, lists, or takeaways. Always place each bullet point on its own line with a blank line between sections.
- Bold key terms, speaker names, important metrics, and action items.
- When referencing specific moments, quotes, or discussions, include clickable timestamp citations in brackets like [MM:SS] (e.g., [02:45] or [14:10]) based on the transcript timestamps.
- If the requested information was not mentioned in the transcript, state that clearly and politely.

Transcript:
${transcriptText}

User Question: "${userQuery}"
`;

  try {
    return await callGeminiWithPool(prompt, false, 0.2);
  } catch (error: any) {
    return "I am currently unable to process your query against the meeting transcript. Please try again.";
  }
}

export async function analyzeSentimentBatch(
  segments: Array<{ id: string; text: string; speakerId: string }>
): Promise<SegmentSentimentResult[]> {
  const segmentList = segments
    .map((s) => `ID:${s.id} | "${s.text.slice(0, 200)}"`)
    .join("\n");

  const prompt = `Classify the sentiment of each transcript segment as "positive", "neutral", or "negative".

Return STRICT JSON array:
[{ "id": "segment-id", "sentiment": "positive" | "neutral" | "negative" }]

Segments:
${segmentList}
`;

  try {
    const textResult = await callGeminiWithPool(prompt, true, 0.1);
    return cleanParseJson<SegmentSentimentResult[]>(textResult, []);
  } catch {
    return segments.map((s) => ({ id: s.id, sentiment: "neutral" }));
  }
}

export async function generateGeminiContent(promptText: string): Promise<string> {
  return callGeminiWithPool(promptText, false, 0.3);
}
