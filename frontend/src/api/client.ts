import { Identity } from "../crypto/identity";

const STORAGE_TOKEN_KEY = "juncture.auth.token";

type ApiEnvelope<T> = {
    ok: boolean;
    data: T;
    meta: unknown;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
};

export type Repo = {
    repoId: string;
    name: string;
    ownerPublicKey: string;
    leaderNode: string | null;
    version: number;
    contributors: string[];
    createdAt: string | null;
    updatedAt: string | null;
};

export type GitCommit = {
    sha: string;
    message: string;
    author: string;
    timestamp: number;
};

export type GitFile = {
    path: string;
    content: string;
    deleted?: boolean;
};

export type GitPushResult = {
    sha: string;
    message: string;
    fileCount: number;
};

class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function getApiBaseUrl(): string {
    const envBase = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
    return envBase || "";
}

export class JunctureClient {
    private readonly baseUrl: string;
    private readonly identity: Identity;
    private token: string | null;

    constructor() {
        this.baseUrl = getApiBaseUrl();
        this.identity = Identity.loadOrCreate();
        this.token = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_TOKEN_KEY) : null;
    }

    getPublicKey(): string {
        return this.identity.getPublicKeyHex();
    }

    isConnected(): boolean {
        return Boolean(this.token);
    }

    disconnect(): void {
        this.setToken(null);
    }

    async connect(): Promise<void> {
        await this.login();
    }

    private setToken(token: string | null): void {
        this.token = token;
        if (typeof window === "undefined") {
            return;
        }
        if (!token) {
            window.localStorage.removeItem(STORAGE_TOKEN_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
    }

    private async request<T>(path: string, options?: RequestInit, withAuth?: boolean): Promise<T> {
        const headers: Record<string, string> = {
            "content-type": "application/json",
            ...((options && options.headers) as Record<string, string> | undefined),
        };

        if (withAuth) {
            await this.ensureAuthenticated();
            if (this.token) {
                headers.authorization = `Bearer ${this.token}`;
            }
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...(options || {}),
            headers,
        });

        const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
        if (!response.ok || !body.ok) {
            const code = body?.error?.code || "REQUEST_FAILED";
            const message = body?.error?.message || `Request failed with status ${response.status}`;
            throw new ApiError(response.status, code, message);
        }

        return body.data;
    }

    async login(): Promise<void> {
        const publicKey = this.identity.getPublicKeyHex();
        const challenge = await this.request<{ challengeId: string; nonce: string }>(
            `/api/auth/challenge?publicKey=${encodeURIComponent(publicKey)}`
        );

        const signature = this.identity.signMessageHex(challenge.nonce);
        const verified = await this.request<{ token: string }>("/api/auth/verify", {
            method: "POST",
            body: JSON.stringify({
                challengeId: challenge.challengeId,
                publicKey,
                signature,
            }),
        });

        this.setToken(verified.token);
    }

    async ensureAuthenticated(): Promise<void> {
        if (this.token) {
            return;
        }
        await this.login();
    }

    // ── Repo ────────────────────────────────────────────

    async listRepos(ownerPublicKey?: string): Promise<Repo[]> {
        const suffix = ownerPublicKey
            ? `?ownerPublicKey=${encodeURIComponent(ownerPublicKey)}`
            : "";
        return this.request<Repo[]>(`/api/repos${suffix}`);
    }

    async searchRepos(query: string): Promise<Repo[]> {
        return this.request<Repo[]>(`/api/repos/search/query?q=${encodeURIComponent(query)}`);
    }

    async getRepo(repoId: string): Promise<Repo> {
        return this.request<Repo>(`/api/repos/${encodeURIComponent(repoId)}`);
    }

    async createRepo(name: string, contributors: string[] = []): Promise<Repo> {
        const ownerPublicKey = this.identity.getPublicKeyHex();
        const mergedContributors = Array.from(new Set([ownerPublicKey, ...contributors]));
        return this.request<Repo>(
            "/api/repos",
            {
                method: "POST",
                body: JSON.stringify({
                    name,
                    ownerPublicKey,
                    contributors: mergedContributors,
                }),
            },
            true
        );
    }

    async updateRepo(
        repoId: string,
        head: string,
        message: string
    ): Promise<{ repoId: string; version: number; updatedAt: string }> {
        const actorPublicKey = this.identity.getPublicKeyHex();
        return this.request<{ repoId: string; version: number; updatedAt: string }>(
            `/api/repos/${encodeURIComponent(repoId)}/updates`,
            {
                method: "POST",
                body: JSON.stringify({
                    actorPublicKey,
                    head,
                    message,
                }),
            },
            true
        );
    }

    // ── Git ─────────────────────────────────────────────

    async pushFiles(
        repoId: string,
        files: GitFile[],
        message: string
    ): Promise<GitPushResult> {
        return this.request<GitPushResult>(
            `/api/repos/${encodeURIComponent(repoId)}/git/push`,
            {
                method: "POST",
                body: JSON.stringify({ files, message }),
            },
            true
        );
    }

    async getTree(repoId: string): Promise<string[]> {
        return this.request<string[]>(
            `/api/repos/${encodeURIComponent(repoId)}/git/tree`
        );
    }

    async getFile(
        repoId: string,
        filePath: string
    ): Promise<{ path: string; content: string }> {
        return this.request<{ path: string; content: string }>(
            `/api/repos/${encodeURIComponent(repoId)}/git/file?path=${encodeURIComponent(filePath)}`
        );
    }

    async getLog(repoId: string, depth = 20): Promise<GitCommit[]> {
        return this.request<GitCommit[]>(
            `/api/repos/${encodeURIComponent(repoId)}/git/log?depth=${depth}`
        );
    }
}

export const client = new JunctureClient();