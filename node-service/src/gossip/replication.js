const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const db = require('../db');

const PEER_NODES = (process.env.PEER_NODES || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

const REPOS_DIR = process.env.REPOS_DIR || '/app/repos';

async function replicateRepo(repoId) {
    if (!PEER_NODES.length) return;

    const repoResult = await db.query(
        `SELECT * FROM repositories WHERE repo_id = $1`, [repoId]
    );
    if (!repoResult.rows.length) return;

    const repo = repoResult.rows[0];
    const contribResult = await db.query(
        `SELECT public_key FROM repo_contributors WHERE repo_id = $1`, [repoId]
    );
    const contributors = contribResult.rows.map(r => r.public_key);

    const updatesResult = await db.query(
        `SELECT * FROM repo_updates WHERE repo_id = $1 ORDER BY created_at ASC`, [repoId]
    );

    const payload = {
        repo: { ...repo, contributors },
        updates: updatesResult.rows,
    };

    for (const peer of PEER_NODES) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch(`${peer}/node/replicate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
        } catch (_err) {}
    }
}

async function getAllFiles(dirPath, base) {
    const basePath = base || dirPath;
    const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await getAllFiles(fullPath, basePath));
        } else {
            const content = fsSync.readFileSync(fullPath).toString('base64');
            const relativePath = fullPath.replace(basePath + path.sep, '');
            files.push({ path: relativePath, content });
        }
    }
    return files;
}

async function replicateGitRepo(repoId) {
    if (!PEER_NODES.length) return;

    const repoPath = path.join(REPOS_DIR, repoId);
    if (!fsSync.existsSync(repoPath)) return;

    let files;
    try {
        files = await getAllFiles(repoPath);
    } catch (err) {
        console.error(`[replication] getAllFiles error: ${err.message}`);
        return;
    }

    const payload = { repoId, files };

    for (const peer of PEER_NODES) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            await fetch(`${peer}/node/replicate/git`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            console.log(`[replication] git synced to ${peer}`);
        } catch (_err) {
            console.log(`[replication] git sync to ${peer} failed: ${_err.message}`);
        }
    }
}

async function catchUpFromPeers() {
    if (!PEER_NODES.length) return;
    console.log(`[replication] starting catch-up from peers`);

    for (const peer of PEER_NODES) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${peer}/node/repos`, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) continue;

            const body = await res.json();
            const peerRepos = body.data || [];

            for (const peerRepo of peerRepos) {
                const local = await db.query(
                    `SELECT version FROM repositories WHERE repo_id = $1`,
                    [peerRepo.repo_id]
                );

                const localVersion = local.rows.length ? local.rows[0].version : -1;
                const peerVersion = peerRepo.version || 0;

                if (peerVersion > localVersion) {
                    console.log(`[replication] catching up ${peerRepo.repo_id} from ${peer}`);
                    await pullRepoFromPeer(peer, peerRepo.repo_id);
                }
            }
        } catch (_err) {
            console.log(`[replication] catch-up from ${peer} failed: ${_err.message}`);
        }
    }

    console.log(`[replication] catch-up complete`);
}

async function pullRepoFromPeer(peerUrl, repoId) {
    try {
        // postgres data pull
        const repoRes = await fetch(`${peerUrl}/node/repos/${encodeURIComponent(repoId)}`);
        if (!repoRes.ok) return;

        const repoBody = await repoRes.json();
        const repo = repoBody.data;
        if (!repo) return;

        const updatesRes = await fetch(`${peerUrl}/node/repos/${encodeURIComponent(repoId)}/updates`);
        const updates = updatesRes.ok ? (await updatesRes.json()).data || [] : [];

        await fetch(`http://localhost:${process.env.PORT || 4001}/node/replicate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ repo, updates }),
        });

        // git files pull
        const gitRes = await fetch(`${peerUrl}/node/replicate/git/pull/${encodeURIComponent(repoId)}`);
        if (gitRes.ok) {
            const gitBody = await gitRes.json();
            if (gitBody.files) {
                await fetch(`http://localhost:${process.env.PORT || 4001}/node/replicate/git`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ repoId, files: gitBody.files }),
                });
            }
        }
    } catch (_err) {
        console.log(`[replication] pull failed: ${_err.message}`);
    }
}

module.exports = { replicateRepo, replicateGitRepo, catchUpFromPeers };