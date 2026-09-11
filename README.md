# 🤖 AI Swarm ALM (Agent Lifecycle Management)

A complete orchestration system for managing AI agents as a workforce. This tool allows you to track tasks, requirements, and bugs, and dispatch them to a fleet of autonomous agents via a PM (Project Manager) agent or direct assignment.

## 🚀 Quick Start

### 🪄 Easy Setup (Recommended)

The easiest way to get the system running is using the deployment wizard. It will guide you through the configuration of your database, gateway, and OAuth secrets:

```bash
node deploy.mjs
```

### Manual Installation

#### Prerequisites
- **Node.js** (v18+)
- **PostgreSQL** (v14+)

#### Installation
1. **Clone the repo:**
   ```bash
   git clone <your-repo-url>
   cd ai-swarm-alm
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Edit .env and set your DATABASE_URL, JWT_SECRET, and Gateway tokens.
   ```

4. **Database Initialization:**
   ```bash
   npx prisma db push
   ```

5. **Run the application:**
   ```bash
   npm run dev:full
   ```
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:3001`

## 🛠 Architecture

- **Frontend**: React + Vite + Tailwind CSS.
- **Backend**: Express.js + TypeScript + Prisma ORM.
- **Database**: PostgreSQL.
- **Agent Integration**: Connects to an Agent Gateway to spawn/wake autonomous agents via API calls.

## ⚙️ Core Concepts

### Dispatch Modes
- **PM Mode (`DISPATCH_MODE=pm`)**: Tasks are first sent to a PM agent who reviews the backlog and decides which specialized agent should handle the task.
- **Direct Mode (`DISPATCH_MODE=direct`)**: Tasks are automatically dispatched to the assigned agent without a review layer.

### The Agent Registry
Agents are identified by IDs (e.g., `agent:seniordev`). You can control which agents are allowed to be "woken up" via the `TRIGGER_ENABLED_AGENTS` environment variable.

## 📂 Project Structure
- `src/`: React frontend.
- `server/`: Express backend.
- `prisma/`: Database schema and migrations.
- `docs/`: Architecture decisions (ADRs) and design docs.

## 📄 License
MIT
