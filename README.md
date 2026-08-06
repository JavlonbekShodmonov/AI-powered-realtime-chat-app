# SumMeet

AI-powered meeting intelligence for modern teams — built to turn live conversations into instant summaries, action items, response suggestions, and searchable history.

SumMeet combines a polished Next.js frontend with a NestJS microservices backend to deliver real-time collaboration, meeting context, and AI assistance in one experience.

![SumMeet](https://img.shields.io/badge/Status-Production%20Ready-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![NestJS](https://img.shields.io/badge/NestJS-10-red) ![Socket.io](https://img.shields.io/badge/Socket.io-Real-time-010101)

---

## Why SumMeet?

SumMeet helps people stay present during meetings while still capturing the important outcomes afterward.

It can:
- detect meeting context and room activity
- generate AI summaries and follow-up tasks
- suggest responses during live conversations
- store meeting history for later retrieval
- support real-time presence and notifications
- work across web and backend services with a scalable architecture

---

## Core Features

### ✨ Meeting Intelligence
- AI-generated meeting summaries
- action items and follow-up suggestions
- response recommendations based on conversation context
- searchable meeting history

### 🔌 Real-Time Collaboration
- live room presence
- socket-based updates
- appointment and notification events
- fast communication between frontend and backend services

### 🧠 AI-Powered Workflow
- Gemini-powered summarization and planning
- transcription and content processing pipelines
- extensible service-oriented backend for future AI features

### 🌍 Multi-Experience UI
- modern dashboard experience
- multilingual interface support
- authentication via Google and GitHub

---

## Architecture

This repository is split into two main parts:

- Frontend application: a Next.js app for the user experience, meeting UI, auth, and socket integration
- Backend services: NestJS microservices for API gateway, AI processing, and realtime handling

### High-level structure

shadmanov/            # Next.js frontend + app routes + socket server
summeet-backend/      # NestJS microservices backend
```

### Main components

| Layer | Purpose |
| --- | --- |
| Frontend | Next.js app, meeting screens, auth, UI, socket client |
| API Gateway | REST API, auth, payments, routing |
| AI Service | summarization, planning, transcription, AI workflows |
| Realtime Service | socket communication, notification pipeline |
| Data Layer | MongoDB + Redis for persistence and realtime state |

---

## Tech Stack

### Frontend
- Next.js 14
- React 18
- Tailwind CSS
- NextAuth
- Socket.IO client
- next-intl

### Backend
- NestJS
- Socket.IO
- MongoDB + Mongoose
- Redis + BullMQ
- Google GenAI
- Web Push / notifications

### Deployment
- Vercel for frontend
- Render for backend services

---

## Project Structure

```text
.
├── shadmanov/
│   ├── src/
│   │   ├── app/
│   │   ├── lib/
│   │   └── messages/
│   ├── server/
│   └── package.json
├── summeet-backend/
│   ├── apps/
│   │   ├── api-gateway/
│   │   ├── ai-service/
│   │   └── realtime-service/
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

Make sure you have:
- Node.js 20+
- npm
- MongoDB running or accessible
- Redis running or accessible

### 1) Install frontend dependencies

```bash
cd shadmanov
npm install
```

### 2) Install backend dependencies

```bash
cd ../summeet-backend
npm install
```

### 3) Configure environment variables

Create environment variables for both apps before running them.

#### Frontend variables

Example values to define in the frontend app:

```env
NEXTAUTH_SECRET=your-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
MONGODB_URI=your-mongodb-uri
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:3003
NEXT_PUBLIC_REALTIME_SERVICE_URL=http://localhost:3002
NEXT_PUBLIC_API_URL=http://localhost:3001
SOCKET_AUTH_SECRET=your-socket-secret
GEMINI_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
```

#### Backend variables

Example values for the backend services:

```env
PORT=3001
AI_SERVICE_PORT=3003
REALTIME_PORT=3002
MONGODB_URI=your-mongodb-uri
REDIS_URL=redis://localhost:6379
GEMINI_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
SOCKET_AUTH_SECRET=your-socket-secret
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
INTERNAL_API_SECRET=your-internal-secret
```

> Keep secrets out of version control. Use environment variables or a secure secret manager in production.

### 4) Run locally

#### Frontend

```bash
cd shadmanov
npm run dev
```

#### Backend microservices

```bash
cd summeet-backend
npm run build
npm run dev
```

For production-style startup from compiled output:

```bash
cd summeet-backend
npm run build
npm start
```

---

## Deployment

### Frontend on Vercel

Deploy the Next.js frontend to Vercel and configure the public environment variables there.

### Backend on Render

Deploy the backend as a single service and use:
- Build command: `npm run build`
- Start command: `npm start`

Set the production environment variables in Render, especially:
- `PORT`
- `MONGODB_URI`
- `REDIS_URL`
- `GEMINI_KEY`
- `GROQ_API_KEY`
- `SOCKET_AUTH_SECRET`

---

## Contributing

Contributions are welcome.

If you want to improve SumMeet:
1. fork the repository
2. create a feature branch
3. make your changes
4. open a pull request

---

## License

This project is currently maintained as a private application. Please check repository ownership and licensing before redistribution.
