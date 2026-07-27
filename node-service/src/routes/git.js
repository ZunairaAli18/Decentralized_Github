const express = require('express');
const router = express.Router({ mergeParams: true });
const { pushFiles, getTree, getFile, getLog } = require('../git/operations');
const path = require('path');
const fs = require('fs');
const { replicateRepo, replicateGitRepo } = require('../gossip/replication');

function ok(data, meta) {
    return { ok: true, data, meta: meta || null };
}

function fail(code, message) {
    return { ok: false, error: { code, message } };
}

router.post('/git', async (req, res) => {
    const { repoId, files } = req.body;
    if (!repoId || !files) {
        return res.status(400).json(fail('BAD_REQUEST', 'repoId and files required'));
    }

    const repoPath = path.join(process.env.REPOS_DIR || '/app/repos', repoId);

    try {
        for (const file of files) {
            const filePath = path.join(repoPath, file.path);
            await require('fs/promises').mkdir(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
        }
        res.json(ok({ synced: repoId }));
    } catch (err) {
        res.status(500).json(fail('SYNC_ERROR', err.message));
    }
});
// GET /node/repos/:repoId/git/tree
router.get('/tree', async (req, res) => {
    const { repoId } = req.params;
    try {
        const files = await getTree(repoId);
        res.json(ok(files));
    } catch (err) {
        res.status(500).json(fail('GIT_ERROR', err.message));
    }
});

// GET /node/repos/:repoId/git/file?path=src/index.js
router.get('/file', async (req, res) => {
    const { repoId } = req.params;
    const filepath = req.query.path;

    if (!filepath) {
        return res.status(400).json(fail('BAD_REQUEST', 'path query required'));
    }

    try {
        const content = await getFile(repoId, filepath);
        if (content === null) {
            return res.status(404).json(fail('NOT_FOUND', 'File not found'));
        }
        res.json(ok({ path: filepath, content }));
    } catch (err) {
        res.status(500).json(fail('GIT_ERROR', err.message));
    }
});

// GET /node/repos/:repoId/git/log
router.get('/log', async (req, res) => {
    const { repoId } = req.params;
    const depth = parseInt(req.query.depth) || 20;

    try {
        const commits = await getLog(repoId, depth);
        res.json(ok(commits));
    } catch (err) {
        res.status(500).json(fail('GIT_ERROR', err.message));
    }
});

// POST /node/repos/:repoId/git/push
router.post('/push', async (req, res) => {
    const { repoId } = req.params;
    const { files, message, authorPublicKey } = req.body;

    if (!files || !Array.isArray(files) || !files.length) {
        return res.status(400).json(fail('BAD_REQUEST', 'files array required'));
    }

    if (!authorPublicKey) {
        return res.status(400).json(fail('BAD_REQUEST', 'authorPublicKey required'));
    }

    let sha = null;

    try {
        sha = await pushFiles(repoId, { files, message, authorPublicKey });
    } catch (err) {
        return res.status(500).json(fail('GIT_ERROR', err.message));
    }

    res.json(ok({ sha, message, fileCount: files.length }));

    replicateRepo(repoId).catch(() => {});
    replicateGitRepo(repoId).catch(() => {});
});

module.exports = router;