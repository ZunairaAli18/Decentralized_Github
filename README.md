# Juncture — Decentralized Git Hosting Platform

Juncture is a **decentralized, peer-to-peer code hosting and collaboration platform** — a crypto-native, serverless alternative to GitHub. It lets you create repositories, push files, browse code, view commit history, and collaborate, all without a central server or user accounts.

**Identity is cryptographic.** Your browser generates an Ed25519 keypair. Authentication uses a challenge-response signature protocol — no usernames, no passwords, no email required.

---

## Architecture Overview

```
Browser (React SPA) ──► Nginx ──► Gateway ──► Node Cluster
                              │                  ├─ Node 1 + Postgres
                              │                  ├─ Node 2 + Postgres
                              │                  └─ Node 3 + Postgres
                              │                  ◄── gossip replication ──►
```

- **Frontend** — React 19 SPA with Tailwind CSS, built and served via Vite (dev) or Nginx (prod)
- **Gateway** — Express 5 reverse-proxy that routes requests to the correct storage node using a consistent hash ring + lease manager
- **Node Services** — 3 symmetric Express servers, each with its own PostgreSQL instance and local Git repository storage
- **Replication** — After writes, nodes gossip metadata and Git blobs to all peers for redundancy

---

## Features

### 🔐 Cryptographic Identity
- Ed25519 keypair generated in the browser via [tweetnacl](https://github.com/dchest/tweetnacl-js)
- Keys persisted in `localStorage`
- Challenge-response auth: server issues a nonce → client signs it → server verifies → session token granted
- No passwords, no third-party OAuth, no email verification

### 📦 Repository Management
- Create repositories under a cryptographic identity
- Add contributors by public key
- Search repositories across the cluster by name
- Version-tracking with automatic conflict resolution (higher version wins)
- Owner/contributor reads served from leader node; public reads load-balanced across replicas

### 🗂️ Git Operations (via [isomorphic-git](https://isomorphic-git.org/))
- Initialize Git repos server-side on file creation
- Push files as Git commits (add, commit, write-ref)
- Browse file trees (`git list-files`)
- Read file contents directly from disk
- Full commit log with SHA, message, author, and timestamp
- Default branch: `main`

### 🌐 Consistent Hashing & Leader Election
- SHA-256 ring with 150 virtual nodes per physical node
- Deterministic leader assignment per repository
- Binary-search-based lookup: O(log n)
- Lease system with TTL and term numbering prevents stale leaders after node failure

### 🔁 Gossip Replication
- On every write (create, update, push), the receiving node pushes:
  - **Metadata** — repository record + contributors + update history → `POST /node/replicate`
  - **Git blobs** — all files base64-encoded → `POST /node/replicate/git`
- On startup, each node performs a **catch-up**: pulls newer repos from peers using version comparison

### 🔍 Node Health & Discovery
- Gateway probes all nodes via `/health` (3s timeout)
- `GET /nodes` returns online/offline status with timestamps
- `GET /nodes/discovery/peers` provides peer-discovery format for tooling

### 💻 Web-Based Code Editor
- File tree sidebar
- Textarea code editor with new-file support
- Commit message input
- Side-by-side commit log viewer

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7, React Router DOM 7 |
| **Gateway** | Node.js, Express 5, tweetnacl |
| **Node Service** | Node.js, Express 5, isomorphic-git 1.x, pg (node-postgres) |
| **Database** | PostgreSQL 16 Alpine (3 instances) |
| **Containerization** | Docker Compose |
| **Reverse Proxy** | Nginx |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (optional, for frontend dev mode)

### Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd Juncture

# 2. Create environment files for each node
cat > node-service/.env.node1 <<EOF
NODE_ID=node1
PORT=4001
DATABASE_URL=postgresql://postgres:secret@db1:5432/juncture
PEER_NODES=http://node2:4002,http://node3:4003
REPOS_DIR=/app/repos
EOF

cat > node-service/.env.node2 <<EOF
NODE_ID=node2
PORT=4002
DATABASE_URL=postgresql://postgres:secret@db2:5432/juncture
PEER_NODES=http://node1:4001,http://node3:4003
REPOS_DIR=/app/repos
EOF

cat > node-service/.env.node3 <<EOF
NODE_ID=node3
PORT=4003
DATABASE_URL=postgresql://postgres:secret@db3:5432/juncture
PEER_NODES=http://node1:4001,http://node2:4002
REPOS_DIR=/app/repos
EOF

# 3. Build and start everything
docker compose up --build
```

The app will be available at **http://localhost:5173**.

### Frontend Dev Mode (standalone)

If you want hot-reload during development:

```bash
cd frontend
npm install
npm run dev
```

This starts Vite on `:5173` with the `/api` proxy pointing to `http://localhost:3000` (gateway must be running separately via Docker).

---

## API Reference

### Gateway Routes (`localhost:3000`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/auth/challenge?publicKey=` | — | Get authentication nonce |
| `POST` | `/auth/verify` | — | Verify signature, receive session token |
| `GET` | `/repos` | — | List repositories (optional `?ownerPublicKey=`) |
| `GET` | `/repos/search/query?q=` | — | Search repositories by name |
| `POST` | `/repos` | Bearer | Create a new repository |
| `GET` | `/repos/:repoId` | Optional | Get repository details |
| `POST` | `/repos/:repoId/updates` | Bearer | Record a repository update |
| `GET` | `/repos/:repoId/git/tree` | — | List files in the repository |
| `GET` | `/repos/:repoId/git/log` | — | Get commit log |
| `GET` | `/repos/:repoId/git/file?path=` | — | Read a file's contents |
| `POST` | `/repos/:repoId/git/push` | Bearer | Push files as a new commit |
| `GET` | `/nodes` | — | List all nodes with health status |
| `GET` | `/nodes/discovery/peers` | — | Peer discovery endpoint |

### Auth Flow

```
1. GET  /auth/challenge?publicKey=<hex>           → { challengeId, nonce, expiresAt }
2. Sign nonce with your Ed25519 private key
3. POST /auth/verify { challengeId, publicKey, signature } → { token, publicKey, expiresAt }
4. Use Bearer <token> in subsequent requests
```

---

## Project Structure

```
├── docker-compose.yml          # Multi-container orchestration
├── postgres/
│   └── init.sql                # Database schema
├── gateway/                    # API Gateway (Express 5)
│   └── src/
│       ├── index.js            # Server entry
│       ├── ring.js             # Consistent hash ring + lease manager
│       ├── middleware/auth.js  # Challenge-response authentication
│       └── routes/
│           ├── repos.js        # Repository CRUD + Git operation proxying
│           └── nodes.js        # Node health & discovery
├── node-service/               # Storage Node (Express 5 + Postgres)
│   └── src/
│       ├── index.js            # Server entry, startup catch-up
│       ├── db/index.js         # Postgres connection pool
│       ├── git/operations.js   # isomorphic-git operations
│       ├── gossip/replication.js # Peer replication & catch-up
│       └── routes/
│           ├── repos.js        # Local repository CRUD
│           ├── git.js          # Local Git operations
│           └── replicate.js    # Inbound replication endpoints
└── frontend/                   # React SPA (Vite + TypeScript)
    └── src/
        ├── main.tsx            # React entry
        ├── App.tsx             # Root component + routing
        ├── api/client.ts       # API client class
        ├── crypto/identity.ts  # Ed25519 key management
        ├── index.css           # Tailwind import
        └── pages/
            ├── Home.tsx        # Dashboard
            ├── Search.tsx      # Repo search
            ├── Repo.tsx        # Create/load/update repos
            ├── RepoDetail.tsx  # Code editor + commit log
            └── Profile.tsx     # Identity management
```

---

## Running Integration Tests

Standalone test scripts are provided in `frontend/` (run with Node.js):

```bash
# Full auth flow + repo create
node frontend/test-auth.js

# Git push, tree, log, and file read
node frontend/test-git.js

# Simulate node failure and failover
node frontend/test-failover.js
```

---

## Environment Variables

| Variable | Service | Default | Description |
|---|---|---|---|
| `NODE_REGISTRY` | Gateway | `""` | Comma-separated node URLs for routing |
| `LEASE_TTL_MS` | Gateway | `30000` | Lease duration in milliseconds |
| `AUTH_CHALLENGE_TTL_MS` | Gateway | `120000` | Challenge nonce expiry (2 min) |
| `AUTH_SESSION_TTL_MS` | Gateway | `3600000` | Session token expiry (1 hour) |
| `NODE_ID` | Node Service | — | Human-readable node identifier |
| `PORT` | Node Service | `4001` | HTTP listen port |
| `DATABASE_URL` | Node Service | — | PostgreSQL connection string |
| `PEER_NODES` | Node Service | `""` | Comma-separated peer URLs for replication |
| `REPOS_DIR` | Node Service | `/app/repos` | Git repository storage path |
| `VITE_API_URL` | Frontend | `""` | API base URL (production builds) |

---

## How It Works (Key Algorithms)

### Consistent Hash Ring
Each physical node is replicated into 150 virtual nodes. A `repoId` is SHA-256 hashed, and the first 8 hex chars are converted to an integer. A binary search on the sorted ring of virtual-node positions returns the responsible node. This ensures minimal redistribution when nodes join or leave.

### Lease-Based Writes
The gateway assigns a **lease** (`{leaderNode, term, expiresAt}`) to each `repoId` after verifying the leader is online. All write requests (create, update, push) are routed through the lease holder. If the leader fails, the lease expires (default 30s TTL), and a new lease is assigned to an online node with an incrementing term number.

### Version-Based Replication
Each repository has a `version` integer. When replicating, the receiving node runs `WHERE version < EXCLUDED.version` — the higher version always wins. On startup, `catchUpFromPeers()` compares local vs peer versions and pulls newer data from whichever peer is ahead.

---

## License

ISC

