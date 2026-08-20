<div align="center">

<a href="https://github.com/AnshuHemal/MeetLog">
  <img src="./public/logo.svg" width="128" height="128" alt="MeetLog Logo" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);" />
</a>

# 🎙️ MeetLog

### **Enterprise AI Meeting Intelligence, High-Precision Transcription & Key Pool Engine**

*Transform audio recordings into structured intelligence with multi-lingual speech recognition, speaker diarization, automated Kanban action items, and multi-provider API key failover.*

<p align="center">
  <a href="https://github.com/AnshuHemal/MeetLog/stargazers"><img src="https://img.shields.io/github/stars/AnshuHemal/MeetLog?style=for-the-badge&color=FFE838&logo=github" alt="Stars" /></a>
  <a href="https://github.com/AnshuHemal/MeetLog/network/members"><img src="https://img.shields.io/github/forks/AnshuHemal/MeetLog?style=for-the-badge&color=00D1FF&logo=github" alt="Forks" /></a>
  <a href="https://github.com/AnshuHemal/MeetLog/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=black" alt="Neon Postgres" />
  <img src="https://img.shields.io/badge/Prisma_ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-system-architecture">Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-license">License</a>
</p>

</div>

---

## 🌟 Overview

**MeetLog** is a production-grade AI meeting intelligence platform engineered for enterprise workflows. It converts raw audio recordings into high-fidelity transcripts, timestamped summaries, speaker segments, and automated Kanban action items.

Built with **Next.js 15**, **React 19**, **Neon Serverless PostgreSQL**, and a **dynamic Multi-Provider API Key Pool**, MeetLog ensures continuous zero-downtime operation through automated key rotation, load balancing, and instant health checks.

---

## ✨ Key Features

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               MEETLOG CORE SUITE                            │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ 🎙️ Meeting Intelligence      │ 🔄 Multi-Provider Key Pool                   │
│ • High-accuracy ASR          │ • Multi-provider rotation (Sarvam, OpenAI)   │
│ • Speaker diarization        │ • Automated failover & cooldown handling     │
│ • Automated action items     │ • Real-time health connectivity testing      │
│ • Interactive audio player   │ • Persistent Grid & List storage view        │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 1. 🎯 Precision Transcription & AI Intelligence
- **Multi-Lingual Audio Processing**: Native speech-to-text recognition optimized for Indian languages, Hinglish, and global dialects powered by Sarvam AI & OpenAI Whisper.
- **Interactive Audio Workspace**: Custom waveform audio player with synced playback, speed toggles, and volume boosts.
- **Executive Summaries & Task Board**: Instant AI extraction of key discussion points, decisions made, and automated Kanban action items.
- **Custom Vocabulary Calibration**: Tailor domain-specific terminology, acronyms, and phonetic corrections to boost transcription accuracy.

### 2. 🗄️ Multi-Provider API Key Pool & Auto-Rotation
- **Zero Downtime Failover**: Seamlessly rotates through an active pool of API keys across multiple providers (`Sarvam`, `OpenAI`, `Gemini`, `Groq`).
- **Dynamic Health Monitoring**: Background health pinging, rate-limit cooldown management, and automatic exhaustion detection.
- **Grid & List Storage View**: Clean, full-width management table with responsive layout switching and persistent preferences.

---

## 🏗️ System Architecture

```mermaid
graph TD
    A[Client Browser] -->|Next.js App Router| B(MeetLog Web App)
    B -->|Prisma ORM| C[(Neon PostgreSQL Key Pool)]
    B -->|Upload / Stream| D[Audio Ingestion Engine]
    D -->|Failover Key Selection| E{API Key Pool Manager}
    E -->|Route 1: Primary| F[Sarvam AI Engine]
    E -->|Route 2: Fallback| G[OpenAI Whisper]
    E -->|Route 3: LLM Insights| H[Google Gemini / Claude]
    F -->|Transcripts & Diarization| B
    G -->|Transcripts| B
    H -->|Summary & Action Items| B
```

---

## 💻 Tech Stack

### **Frontend & Application Layer**
- **Framework**: Next.js 15 (App Router, Server Actions, Route Handlers)
- **UI Library**: React 19, Tailwind CSS, Radix UI Primitives, Lucide Icons
- **Animations**: Framer Motion & CSS Micro-Interactions
- **Authentication**: Better-Auth with Multi-Workspace RBAC

### **Database & Infrastructure**
- **Database**: Serverless PostgreSQL via **Neon Cloud**
- **ORM**: Prisma ORM with type-safe schema synchronization
- **Audio & Storage**: Google Drive API Resumable Chunked Storage

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **npm** / **pnpm** / **yarn**

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AnshuHemal/MeetLog.git
cd MeetLog

# Install Next.js dependencies
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Public URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"

# Authentication (Better Auth)
BETTER_AUTH_SECRET="your-better-auth-secret"
BETTER_AUTH_URL="http://localhost:3000"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# AI Providers
SARVAM_API_KEY="your-sarvam-api-key"
GEMINI_API_KEY="your-gemini-api-key"

# Google Drive Storage
GOOGLE_DRIVE_REFRESH_TOKEN="your-gdrive-refresh-token"
```

### 3. Run Database Migrations
```bash
npx prisma generate
npx prisma db push
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view MeetLog in your browser.

---

## 🌐 Deployment

MeetLog is ready to deploy on modern cloud platforms:

### Deploy to Render or Vercel
1. Push your code to your GitHub repository.
2. Link the repository in **[Render](https://render.com)** or **[Vercel](https://vercel.com)**.
3. Configure your production environment variables in the dashboard.
4. Deploy!

---

## 👥 Author

**Anshu Hemal**
- GitHub: [@AnshuHemal](https://github.com/AnshuHemal)
- Repository: [AnshuHemal/MeetLog](https://github.com/AnshuHemal/MeetLog)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

<p align="center">
  <b>Built with ❤️ and modern web technologies by <a href="https://github.com/AnshuHemal">Anshu Hemal</a>.</b>
</p>
