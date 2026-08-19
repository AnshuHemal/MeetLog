import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3.5-flash";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables.");
}

export interface GeneratedMeetingInsights {
  summary: string;
  topics: string[];
  actionItems: Array<{
    task: string;
    assignee: string | null;
  }>;
}

async function callGeminiForChunk(promptText: string): Promise<GeneratedMeetingInsights> {
  const response = await axios.post(
    `${BASE_URL}?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    },
    { headers: { "Content-Type": "application/json" } }
  );

  const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResult) {
    throw new Error("Empty response received from Gemini API.");
  }
  return JSON.parse(textResult.trim());
}

export async function generateMeetingInsights(
  transcriptText: string
): Promise<GeneratedMeetingInsights> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const CHUNK_SIZE = 50_000;
  if (transcriptText.length > CHUNK_SIZE) {
    console.log(`[LONG AUDIO GEMINI] Processing long transcript (${transcriptText.length} chars) with multi-chunk synthesis...`);
    const chunks: string[] = [];
    for (let i = 0; i < transcriptText.length; i += CHUNK_SIZE) {
      chunks.push(transcriptText.slice(i, i + CHUNK_SIZE));
    }

    const partialResults: GeneratedMeetingInsights[] = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkPrompt = `You are an executive analyst. Analyze part ${idx + 1} of ${chunks.length} of a long meeting transcript.
Extract key takeaways, summary bullet points, topics, and action items with assignees.

Return JSON format:
{
  "summary": "Section summary points",
  "topics": ["topic1", "topic2"],
  "actionItems": [{"task": "Task description", "assignee": "Name or null"}]
}

Transcript Section:
${chunks[idx]}
`;
      try {
        const res = await callGeminiForChunk(chunkPrompt);
        partialResults.push(res);
      } catch (err) {
        console.error(`[LONG AUDIO GEMINI] Chunk ${idx + 1} failed, skipping:`, err);
      }
    }

    if (partialResults.length === 0) {
      throw new Error("All transcript chunks failed during long audio AI processing.");
    }

    const mergedSummaries = partialResults.map((p, i) => `### Section ${i + 1}\n${p.summary}`).join("\n\n");
    const mergedActionItems = partialResults.flatMap((p) => p.actionItems);
    const mergedTopics = Array.from(new Set(partialResults.flatMap((p) => p.topics)));

    const masterPrompt = `You are a Lead Executive Analyst. Synthesize the following section summaries into a single, cohesive, highly structured executive meeting summary markdown (with Key Highlights, Main Discussion Points, Decisions Made, and Next Steps).

Section Summaries:
${mergedSummaries}

Return JSON format:
{
  "summary": "Unified Executive Markdown Summary",
  "topics": ${JSON.stringify(mergedTopics)},
  "actionItems": ${JSON.stringify(mergedActionItems)}
}
`;
    try {
      return await callGeminiForChunk(masterPrompt);
    } catch (e) {
      return {
        summary: mergedSummaries,
        topics: mergedTopics,
        actionItems: mergedActionItems,
      };
    }
  }

  const prompt = `You are a professional business analyst. Analyze the following meeting transcript. 
Extract an executive summary (formatted in clean markdown), core topics/tags discussed, and clear action items with assignees (extracted from speaker labels or names).

Return your output STRICTLY as a JSON object matching this schema:
{
  "summary": "Detailed executive markdown summary of the meeting, using bullet points and headers where appropriate.",
  "topics": ["topic1", "topic2", "topic3"],
  "actionItems": [
    {
      "task": "Specific task description",
      "assignee": "Speaker Name or Label (e.g. SPEAKER_00 or Renamed Name), or null if unassigned"
    }
  ]
}

Ensure the summary is highly professional, captures key decisions made, and focuses on results.

Here is the meeting transcript:
${transcriptText}
`;

  try {
    return await callGeminiForChunk(prompt);
  } catch (error: any) {
    console.error("Error generating insights from Gemini API:", error?.response?.data || error.message);
    throw new Error(`Gemini insight generation failed: ${error.message}`);
  }
}

export interface GeneratedMeetingChapter {
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
}

export async function generateMeetingChapters(
  transcriptText: string
): Promise<GeneratedMeetingChapter[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `You are an expert meeting analyst. Analyze the following meeting transcript.
Divide the meeting into distinct, sequential chapters based on when topics switch.
For each chapter, provide:
1. "startTime": the start time (in seconds) matching the beginning of the first sentence of the chapter.
2. "endTime": the end time (in seconds) matching the end of the last sentence of the chapter.
3. "title": a short, professional topic header.
4. "summary": a brief, one-sentence description of the discussion.

Return your output STRICTLY as a JSON array of objects matching this schema:
[
  {
    "startTime": 0.0,
    "endTime": 120.0,
    "title": "Topic Header",
    "summary": "Description of the discussion."
  }
]

Ensure chapters cover the entire meeting chronologically, without overlapping.

Here is the meeting transcript:
${transcriptText}
`;

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.25,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("Empty response received from Gemini API.");
    }

    const chapters: GeneratedMeetingChapter[] = JSON.parse(textResult.trim());
    return chapters;
  } catch (error: any) {
    console.error("Error generating chapters from Gemini API:", error?.response?.data || error.message);
    throw new Error(`Gemini chapter generation failed: ${error.message}`);
  }
}

export async function generateFollowUpEmail(
  title: string,
  summary: string,
  actionItems: string[]
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `You are a professional administrative assistant. Draft a polished, professional follow-up email based on the following meeting details.

Meeting Title: ${title}
Executive Summary:
${summary}

Action Items:
${actionItems.map((item, idx) => `${idx + 1}. ${item}`).join("\n")}

The email should be clear, professional, and structured as follows:
- Greeting: Professional greeting (e.g. "Dear Team," or "Hello everyone,")
- Opening: Brief sentence thanking everyone for their time.
- Key Highlights: A neat summary of the core discussion points.
- Action Items: A bulleted list of assigned tasks and who is responsible for each (if name is provided).
- Closing: Professional sign-off (e.g., "Best regards,\n[Your Name]").

Return ONLY the body content of the email draft (including greeting, highlights, actions, and signoff). Do not include any HTML formatting tags, just return plain structured text with standard formatting.
`;

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("Empty response received from Gemini API.");
    }

    return textResult.trim();
  } catch (error: any) {
    console.error("Error generating follow-up email from Gemini API:", error?.response?.data || error.message);
    throw new Error(`Gemini email draft generation failed: ${error.message}`);
  }
}

export async function answerTranscriptQuestion(
  transcriptText: string,
  userQuery: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `You are a helpful AI assistant inside MeetLog, a meeting intelligence platform.
Your task is to answer the user's question based strictly on the provided meeting transcript.

Transcript context:
${transcriptText}

User's Question: "${userQuery}"

Instructions:
1. Answer the question accurately using facts directly mentioned in the transcript.
2. Be professional, direct, and concise (1-3 sentences or a short bulleted list is preferred).
3. If the answer is not mentioned anywhere in the transcript, reply politely saying: "I cannot find this information in the transcript."
4. Do not make up facts or extrapolate beyond what is stated in the dialog scripts.
`;

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("Empty response received from Gemini API.");
    }

    return textResult.trim();
  } catch (error: any) {
    console.error("Error generating answer from Gemini API:", error?.response?.data || error.message);
    throw new Error(`Gemini Q&A generation failed: ${error.message}`);
  }
}
export interface SegmentSentimentResult {
  id: string;
  sentiment: "positive" | "neutral" | "negative";
}

export async function analyzeSentimentBatch(
  segments: Array<{ id: string; text: string; speakerId: string }>
): Promise<SegmentSentimentResult[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const segmentList = segments
    .map((s) => `ID:${s.id} | "${s.text.slice(0, 200)}"`)
    .join("\n");

  const prompt = `You are a sentiment analysis expert. Classify the sentiment of each of the following meeting transcript segments as exactly one of: "positive", "neutral", or "negative".

Rules:
- "positive": Enthusiasm, agreement, good news, solutions found, praise, energy
- "negative": Frustration, disagreement, bad news, blockers, complaints, risk
- "neutral": Facts, status updates, questions, mundane discussion

Return STRICTLY a JSON array matching this schema — one entry per segment in the same order:
[{ "id": "segment-id", "sentiment": "positive" | "neutral" | "negative" }]

Segments to analyze:
${segmentList}
`;

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) throw new Error("Empty response from Gemini.");

    const results: SegmentSentimentResult[] = JSON.parse(textResult.trim());
    return results;
  } catch (error: any) {
    console.error("Error in sentiment analysis:", error?.response?.data || error.message);
    throw new Error(`Gemini sentiment analysis failed: ${error.message}`);
  }
}

export async function generateGeminiContent(promptText: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  try {
    const response = await axios.post(
      `${BASE_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const textResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("Empty response received from Gemini API.");
    }

    return textResult.trim();
  } catch (error: any) {
    console.error("Error generating content from Gemini API:", error?.response?.data || error.message);
    throw new Error(`Gemini generation failed: ${error.message}`);
  }
}
