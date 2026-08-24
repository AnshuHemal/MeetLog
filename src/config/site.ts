export const siteConfig = {
  name: "MeetLog",
  tagline: "Turns hours of meetings into minutes of reading",

  description:
    "MeetLog is a modern meeting transcription and intelligence platform built for business analysts and fast-moving teams. Upload your meeting recordings to automatically generate speaker-diarized transcripts, high-quality summaries, and structured action items using AI.",

  shortDescription:
    "Automated meeting transcription, speaker diarization, and AI-generated meeting insights.",

  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://meetlog--web.vercel.app",

  ogImage: "/og.png",

  titleTemplate: "%s | MeetLog",

  keywords: [
    "meeting transcription",
    "speaker diarization",
    "meeting summary",
    "action items tracker",
    "speech to text",
    "sarvam ai",
    "business analyst tools",
    "meeting assistant",
    "audio transcriber",
    "transcript editor",
    "ai note taker",
    "meetlog",
  ],

  author: {
    name: "MeetLog",
    url: "https://meetlog--web.vercel.app",
  },

  links: {
    github: "https://github.com/meetlog-app",
    twitter: "https://twitter.com/meetlog_app",
  },

  social: {
    twitter: "https://twitter.com/meetlog_app",
    github: "https://github.com/meetlog-app",
  },
} as const;

export type SiteConfig = typeof siteConfig;
