const express = require('express');
const { pickLeaderNode, pickRoundRobin, getLease, assignLease, isLeaseExpired, renewLease } = require('../ring');
const { requireAuth, getSession } = require('../middleware/auth');
const router = express.Router();

function ok(data, meta) {
    return {
        ok: true,
        data,
        meta: meta || null,
    };
}

function fail(code, message, details) {
    return {
        ok: false,
        error: {
            code,
            message,
            details: details || null,
        },
    };
}

function parseNodesFromEnv() {
    const raw = process.env.NODE_REGISTRY || '';
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeRepoShape(repo) {
    if (!repo || typeof repo !== 'object') return repo;
    return {
        repoId: repo.repoId || repo.repo_id,
        name: repo.name,
        ownerPublicKey: repo.ownerPublicKey || repo.owner_public_key,
        leaderNode: repo.leaderNode || repo.leader_node || null,
        version: typeof repo.version === 'number' ? repo.version : 0,
        contributors: repo.contributors || [],
        createdAt: repo.createdAt || repo.created_at || null,
        updatedAt: repo.updatedAt || repo.updated_at || null,
    };
}

async function requestJson(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(url, {
            ...(options || {}),
            signal: controller.signal,
            headers: {
                'content-type': 'application/json',
                ...((options && options.headers) || {}),
            },
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = body && body.error && body.error.message ? body.error.message : 'Upstream node error';
            throw new Error(message);
        }
        return body;
    } finally {
        clearTimeout(timeout);
    }
}

async function isNodeOnline(nodeUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
        const response = await fetch(`${nodeUrl}/health`, { signal: controller.signal });
        return response.ok;
    } catch (_err) {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function ensureActiveLease(repoId, nodes, preferredNode) {
    if (!nodes.length) {
        return null;
    }

    const existing = getLease(repoId);
    if (existing && !isLeaseExpired(existing) && nodes.includes(existing.leaderNode)) {
        const online = await isNodeOnline(existing.leaderNode);
        if (online) {
            return renewLease(repoId);
        }
    }

    const onlineNodes = [];
    for (const nodeUrl of nodes) {
        if (await isNodeOnline(nodeUrl)) {
            onlineNodes.push(nodeUrl);
        }
    }

    const eligible = onlineNodes.length ? onlineNodes : nodes;
    return assignLease(repoId, eligible, { preferredNode });
}

function validateCreatePayload(body) {
    if (!body || typeof body !== 'object') {
        return 'Body must be a JSON object';
    }

    if (!body.name || typeof body.name !== 'string') {
        return 'Field "name" is required and must be a string';
    }

    if (!body.ownerPublicKey || typeof body.ownerPublicKey !== 'string') {
        return 'Field "ownerPublicKey" is required and must be a string';
    }

    if (body.contributors && !Array.isArray(body.contributors)) {
        return 'Field "contributors" must be an array when provided';
    }

    return null;
}

router.get('/', async (req, res) => {
    const ownerPublicKey = typeof req.query.ownerPublicKey === 'string' ? req.query.ownerPublicKey : null;
    const nodes = parseNodesFromEnv();

    const tasks = nodes.map(async (nodeUrl) => {
        const suffix = ownerPublicKey ? `?ownerPublicKey=${encodeURIComponent(ownerPublicKey)}` : '';
        const payload = await requestJson(`${nodeUrl}/node/repos${suffix}`);
        return {
            nodeUrl,
            repos: (payload.data || []).map(normalizeRepoShape),
        };
    });

    const settled = await Promise.allSettled(tasks);
    const repoById = new Map();
    let online = 0;

    for (const item of settled) {
        if (item.status !== 'fulfilled') continue;
        online += 1;
        for (const repo of item.value.repos) {
            const existing = repoById.get(repo.repoId);
            if (!existing || (repo.version || 0) > (existing.version || 0)) {
                repoById.set(repo.repoId, repo);
            }
        }
    }

    const merged = [...repoById.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    res.json(ok(merged, { total: merged.length, onlineNodes: online, totalNodes: nodes.length }));
});

router.get('/search/query', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
        res.status(400).json(fail('BAD_REQUEST', 'Query parameter "q" is required'));
        return;
    }

    const nodes = parseNodesFromEnv();
    const tasks = nodes.map(async (nodeUrl) => {
        const payload = await requestJson(`${nodeUrl}/node/repos?q=${encodeURIComponent(q)}`);
        return {
            nodeUrl,
            repos: (payload.data || []).map(normalizeRepoShape),
        };
    });

    const settled = await Promise.allSettled(tasks);
    const found = [];
    let online = 0;
    for (const item of settled) {
        if (item.status !== 'fulfilled') continue;
        online += 1;
        found.push(...item.value.repos);
    }

    const deduped = [...new Map(found.map((repo) => [repo.repoId, repo])).values()];
    res.json(ok(deduped, { query: q, total: deduped.length, onlineNodes: online, totalNodes: nodes.length, partial: online !== nodes.length }));
});

router.post('/', requireAuth, async (req, res) => {
    const validationError = validateCreatePayload(req.body);
    if (validationError) {
        res.status(400).json(fail('BAD_REQUEST', validationError));
        return;
    }

    if (req.auth.publicKey !== req.body.ownerPublicKey) {
        res.status(403).json(fail('FORBIDDEN', 'Authenticated key must match ownerPublicKey'));
        return;
    }

    const nodes = parseNodesFromEnv();
    if (!nodes.length) {
        res.status(503).json(fail('NO_NODES', 'No nodes available in NODE_REGISTRY'));
        return;
    }

    const repoId = req.body.repoId || `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const preferredLeader = pickLeaderNode(repoId, nodes);
    const lease = await ensureActiveLease(repoId, nodes, preferredLeader);
    const leader = lease ? lease.leaderNode : preferredLeader;
    try {
        const payload = await requestJson(`${leader}/node/repos`, {
            method: 'POST',
            body: JSON.stringify({
                ...req.body,
                repoId,
                leaderNode: leader,
            }),
        });
        res.status(201).json(
            ok(normalizeRepoShape(payload.data), {
                lease,
            })
        );
    } catch (err) {
        res.status(502).json(fail('UPSTREAM_ERROR', 'Failed to create repository on leader node', { message: err.message }));
    }
});

function parseBearerToken(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') return null;
    const [scheme, token] = headerValue.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
}

router.get('/:repoId', async (req, res) => {
    const nodes = parseNodesFromEnv();
    const repoId = req.params.repoId;

    if (!nodes.length) {
        return res.status(503).json(fail('NO_NODES', 'No nodes available'));
    }

    // step 1 — repo fetch karo kisi bhi node se (contributors check ke liye)
    let repo = null;
    for (const nodeUrl of nodes) {
        try {
            const payload = await requestJson(
                `${nodeUrl}/node/repos/${encodeURIComponent(repoId)}`
            );
            repo = normalizeRepoShape(payload.data);
            break;
        } catch (_err) { continue; }
    }

    if (!repo) {
        return res.status(404).json(fail('NOT_FOUND', 'Repository not found'));
    }

    // step 2 — caller ki identity nikalo
    const token = parseBearerToken(req.headers.authorization);
    const session = token ? getSession(token) : null;
    const callerKey = session ? session.publicKey : null;

    const isPrivileged =
        callerKey &&
        (callerKey === repo.ownerPublicKey ||
            (repo.contributors || []).includes(callerKey));

    // step 3 — node select karo
    let targetNode;

    if (isPrivileged) {
        // owner ya contributor — leader se serve karo
        const lease = getLease(repoId);
        targetNode =
            lease && !isLeaseExpired(lease)
                ? lease.leaderNode
                : pickLeaderNode(repoId, nodes);
    } else {
        // public user — round robin
        targetNode = pickRoundRobin(nodes);
    }

    // step 4 — target node se fetch karo, fallback to others
    const orderedNodes = [targetNode, ...nodes.filter((n) => n !== targetNode)];

    for (const nodeUrl of orderedNodes) {
        try {
            const payload = await requestJson(
                `${nodeUrl}/node/repos/${encodeURIComponent(repoId)}`
            );
            res.json(
                ok(normalizeRepoShape(payload.data), {
                    sourceNode: nodeUrl,
                    servedFrom: isPrivileged ? 'leader' : 'replica',
                })
            );
            return;
        } catch (_err) { continue; }
    }

    res.status(404).json(fail('NOT_FOUND', 'Repository not found'));
});

router.post('/:repoId/updates', requireAuth, async (req, res) => {
    if (!req.body || req.auth.publicKey !== req.body.actorPublicKey) {
        res.status(403).json(fail('FORBIDDEN', 'Authenticated key must match actorPublicKey'));
        return;
    }

    const nodes = parseNodesFromEnv();
    if (!nodes.length) {
        res.status(503).json(fail('NO_NODES', 'No nodes available in NODE_REGISTRY'));
        return;
    }

    const repoId = req.params.repoId;
    let lease = await ensureActiveLease(repoId, nodes, pickLeaderNode(repoId, nodes));

    const leader = lease ? lease.leaderNode : pickLeaderNode(repoId, nodes);
    const orderedNodes = [leader, ...nodes.filter((node) => node !== leader)];

    for (const nodeUrl of orderedNodes) {
        try {
            const payload = await requestJson(
                `${nodeUrl}/node/repos/${encodeURIComponent(req.params.repoId)}/updates`,
                {
                    method: 'POST',
                    body: JSON.stringify(req.body || {}),
                }
            );

            if (!lease || lease.leaderNode !== nodeUrl) {
                lease = assignLease(repoId, nodes, { preferredNode: nodeUrl });
            } else {
                lease = renewLease(repoId);
            }

            res.status(202).json(ok(payload.data, { acceptedBy: nodeUrl, lease }));
            return;
        } catch (_err) {
            continue;
        }
    }

    res.status(502).json(fail('UPSTREAM_ERROR', 'No reachable node accepted the update'));
});
// GET /repos/:repoId/git/tree
router.get('/:repoId/git/tree', async (req, res) => {
    const nodes = parseNodesFromEnv();
    const repoId = req.params.repoId;
    const lease = getLease(repoId);
    const leader = lease && !isLeaseExpired(lease)
        ? lease.leaderNode
        : pickLeaderNode(repoId, nodes);

    const orderedNodes = [leader, ...nodes.filter(n => n !== leader)];

    for (const nodeUrl of orderedNodes) {
        try {
            const payload = await requestJson(`${nodeUrl}/node/repos/${encodeURIComponent(repoId)}/git/tree`);
            return res.json(payload);
        } catch (_err) { continue; }
    }
    res.status(404).json(fail('NOT_FOUND', 'Repo not found'));
});

// GET /repos/:repoId/git/log
router.get('/:repoId/git/log', async (req, res) => {
    const nodes = parseNodesFromEnv();
    const repoId = req.params.repoId;
    const lease = getLease(repoId);
    const leader = lease && !isLeaseExpired(lease)
        ? lease.leaderNode
        : pickLeaderNode(repoId, nodes);

    const orderedNodes = [leader, ...nodes.filter(n => n !== leader)];

    for (const nodeUrl of orderedNodes) {
        try {
            const payload = await requestJson(`${nodeUrl}/node/repos/${encodeURIComponent(repoId)}/git/log`);
            return res.json(payload);
        } catch (_err) { continue; }
    }
    res.status(404).json(fail('NOT_FOUND', 'Repo not found'));
});

// GET /repos/:repoId/git/file
router.get('/:repoId/git/file', async (req, res) => {
    const nodes = parseNodesFromEnv();
    const repoId = req.params.repoId;
    const lease = getLease(repoId);
    const leader = lease && !isLeaseExpired(lease)
        ? lease.leaderNode
        : pickLeaderNode(repoId, nodes);

    const orderedNodes = [leader, ...nodes.filter(n => n !== leader)];

    for (const nodeUrl of orderedNodes) {
        try {
            const payload = await requestJson(
                `${nodeUrl}/node/repos/${encodeURIComponent(repoId)}/git/file?path=${encodeURIComponent(req.query.path || '')}`
            );
            return res.json(payload);
        } catch (_err) { continue; }
    }
    res.status(404).json(fail('NOT_FOUND', 'File not found'));
});

// POST /repos/:repoId/git/push
router.post('/:repoId/git/push', requireAuth, async (req, res) => {
    const nodes = parseNodesFromEnv();
    const repoId = req.params.repoId;

    const lease = await ensureActiveLease(repoId, nodes, pickLeaderNode(repoId, nodes));
    const leader = lease ? lease.leaderNode : pickLeaderNode(repoId, nodes);

    try {
        const payload = await requestJson(
            `${leader}/node/repos/${encodeURIComponent(repoId)}/git/push`,
            {
                method: 'POST',
                body: JSON.stringify({
                    ...req.body,
                    authorPublicKey: req.auth.publicKey,
                }),
            }
        );
        res.json(payload);
    } catch (err) {
        res.status(502).json(fail('UPSTREAM_ERROR', err.message));
    }
});
module.exports = router;
