# SETUP.md — AI SWARM ALM Backend Setup Guide

This guide walks you through setting up the backend Express server for the AI Swarm ALM system.

---

## Prerequisites

- Node.js 18+ (tested with v24)
- npm dependencies installed (`npm install`)
- A Firebase project with Firestore enabled

---

## Step 1: Get Firebase Admin Credentials

The backend server needs **Firebase Admin SDK** credentials to read/write Firestore.

### 1.1 Download the Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select the project: **gen-lang-client-0812048150**
3. Click the ⚙️ gear icon → **Project Settings**
4. Go to the **Service Accounts** tab
5. Click **Generate New Private Key**
6. A JSON file will download — **DO NOT commit this file to git**

### 1.2 Extract the Values

Open the downloaded JSON file. You need three fields:

| JSON field            | Env variable              |
|-----------------------|---------------------------|
| `project_id`          | `FIREBASE_PROJECT_ID`     |
| `client_email`        | `FIREBASE_CLIENT_EMAIL`   |
| `private_key`         | `FIREBASE_PRIVATE_KEY`    |

### 1.3 Add to `server/.env`

Edit `server/.env` and fill in the values:

```env
FIREBASE_PROJECT_ID=gen-lang-client-0812048150
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@gen-lang-client-0812048150.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
PORT=3001
```

> ⚠️ The `FIREBASE_PRIVATE_KEY` must include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers. Newlines should be `\n`.

---

## Step 2: Start the Backend Server

### Development (with auto-restart)

```bash
npm run server
```

This runs `npx tsx server/index.ts` — TypeScript execution without compilation.

### Development (frontend + backend together)

```bash
npm run dev:full
```

Runs both the Vite dev server (port 3000) and the Express API (port 3001) concurrently.

### Verify it works

```bash
curl http://localhost:3001/api/health
```

**Without Firebase creds** (demo mode):
```json
{
  "status": "ok",
  "mode": "demo",
  "firebase": "not_connected",
  "message": "Server running without Firebase. Set FIREBASE_* env vars to connect."
}
```

**With Firebase creds** (live mode):
```json
{
  "status": "ok",
  "mode": "live",
  "firebase": "connected",
  "agents": 16,
  "tasks": 42
}
```

---

## Step 3: Seed Agents

After Firebase is connected, seed the 16 swarm agents:

```bash
npx tsx server/seed-agents.ts
```

This writes 16 agent documents to the `agents` collection in Firestore. It's safe to re-run — it overwrites by agent ID.

---

## Environment Variables

| Variable                  | Required | Description                                    |
|---------------------------|----------|------------------------------------------------|
| `PORT`                    | No       | Server port (default: 3001)                    |
| `FIREBASE_PROJECT_ID`     | Yes*     | Firebase project ID                            |
| `FIREBASE_CLIENT_EMAIL`   | Yes*     | Service account client email                   |
| `FIREBASE_PRIVATE_KEY`    | Yes*     | Service account private key                    |

\* Required for Firebase connection. Server runs in demo mode without them.

---

## API Endpoints

| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | `/api/health`             | Health check (works in demo)   |
| GET    | `/api/tasks`              | List all tasks                 |
| GET    | `/api/tasks/:id`          | Get single task                |
| POST   | `/api/tasks`              | Create task                    |
| PATCH  | `/api/tasks/:id`          | Update task                    |
| DELETE | `/api/tasks/:id`          | Delete task                    |
| GET    | `/api/agents`             | List all agents                |
| GET    | `/api/agents/:id`         | Get single agent               |
| PATCH  | `/api/agents/:id`         | Update agent (heartbeat)       |
| GET    | `/api/test-runs`          | List test runs                 |
| POST   | `/api/test-runs`          | Create test run                |
| GET    | `/api/requirements`       | List requirements              |
| POST   | `/api/requirements`       | Create requirement             |
| PATCH  | `/api/requirements/:id`   | Update requirement             |
| GET    | `/api/audit`              | List audit log entries         |

All write endpoints return `503` in demo mode. Read endpoints return empty arrays.

---

## Production Deployment

### Build the Frontend

```bash
npm run build
```

Output goes to `dist/`. Serve with any static file server (nginx, Caddy, etc.).

### Run the Backend

```bash
# Option 1: Direct
npx tsx server/index.ts

# Option 2: With node (after building a bundle)
# If you want to compile server TS:
npx tsx server/index.ts

# Option 3: PM2 for process management
pm2 start "npx tsx server/index.ts" --name alm-api
```

### Production Checklist

1. ✅ Set `server/.env` with Firebase credentials on the production server
2. ✅ Build frontend: `npm run build`
3. ✅ Serve `dist/` on port 443 (HTTPS) via nginx/Caddy
4. ✅ Run Express API on port 3001
5. ✅ Configure reverse proxy: `/api/*` → `localhost:3001`
6. ✅ Set CORS origins in `server/index.ts` to match your production domain
7. ✅ Seed agents: `npx tsx server/seed-agents.ts`
8. ✅ Verify: `curl https://swarmbuzz.online/api/health`

### Example Nginx Config

```nginx
server {
    listen 443 ssl;
    server_name swarmbuzz.online www.swarmbuzz.online;

    # Frontend
    root /var/www/alm/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Troubleshooting

### "Firebase not connected" in health check
→ Check `server/.env` has all three FIREBASE_* variables set correctly.

### "Service account not found" warning
→ The `FIREBASE_CLIENT_EMAIL` or `FIREBASE_PRIVATE_KEY` is empty or missing.

### Port 3001 already in use
→ Kill existing process: `lsof -ti:3001 | xargs kill` or change PORT in `.env`.

### Seed agents fails
→ Firebase must be connected first. Verify health check returns `"mode": "live"`.
