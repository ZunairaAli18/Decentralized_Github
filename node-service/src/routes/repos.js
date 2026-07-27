const express = require('express');
const router = express.Router();
const db = require('../db');
const { replicateRepo } = require('../gossip/replication');


function ok(data, meta) {
    return { ok: true, data, meta: meta || null };
}

function fail(code, message, details) {
    return { ok: false, error: { code, message, details: details || null } };
}

// GET /node/repos
router.get('/', async (req, res) => {
    const { ownerPublicKey, q } = req.query;
    try {
        let result;
        if (q) {
            result = await db.query(
                `SELECT * FROM repositories WHERE name ILIKE $1 ORDER BY updated_at DESC`,
                [`%${q}%`]
            );
        } else if (ownerPublicKey) {
            result = await db.query(
                `SELECT * FROM repositories WHERE owner_public_key = $1 ORDER BY updated_at DESC`,
                [ownerPublicKey]
            );
        } else {
            result = await db.query(
                `SELECT * FROM repositories ORDER BY updated_at DESC`
            );
        }

        const repos = await Promise.all(result.rows.map(async (repo) => {
            const contrib = await db.query(
                `SELECT public_key FROM repo_contributors WHERE repo_id = $1`,
                [repo.repo_id]
            );
            return { ...repo, contributors: contrib.rows.map(r => r.public_key) };
        }));

        res.json(ok(repos));
    } catch (err) {
        res.status(500).json(fail('DB_ERROR', err.message));
    }
});

// GET /node/repos/:repoId
router.get('/:repoId', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM repositories WHERE repo_id = $1`,
            [req.params.repoId]
        );

        if (!result.rows.length) {
            return res.status(404).json(fail('NOT_FOUND', 'Repository not found'));
        }

        const repo = result.rows[0];
        const contrib = await db.query(
            `SELECT public_key FROM repo_contributors WHERE repo_id = $1`,
            [repo.repo_id]
        );

        res.json(ok({ ...repo, contributors: contrib.rows.map(r => r.public_key) }));
    } catch (err) {
        res.status(500).json(fail('DB_ERROR', err.message));
    }
});

// POST /node/repos
router.post('/', async (req, res) => {
    const { repoId, name, ownerPublicKey, leaderNode, contributors } = req.body;

    if (!repoId || !name || !ownerPublicKey) {
        return res.status(400).json(fail('BAD_REQUEST', 'repoId, name, ownerPublicKey required'));
    }

    let savedRepo = null;
    let allContributors = [];

    try {
        await db.query(
            `INSERT INTO users (public_key) VALUES ($1) ON CONFLICT DO NOTHING`,
            [ownerPublicKey]
        );

        const result = await db.query(
            `INSERT INTO repositories (repo_id, name, owner_public_key, leader_node, version)
             VALUES ($1, $2, $3, $4, 0)
             ON CONFLICT (repo_id) DO UPDATE SET leader_node = EXCLUDED.leader_node
             RETURNING *`,
            [repoId, name, ownerPublicKey, leaderNode || null]
        );

        savedRepo = result.rows[0];

        allContributors = contributors && contributors.length
            ? [...new Set([ownerPublicKey, ...contributors])]
            : [ownerPublicKey];

        for (const key of allContributors) {
            await db.query(
                `INSERT INTO users (public_key) VALUES ($1) ON CONFLICT DO NOTHING`,
                [key]
            );
            await db.query(
                `INSERT INTO repo_contributors (repo_id, public_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [repoId, key]
            );
        }
    } catch (err) {
        return res.status(500).json(fail('DB_ERROR', err.message));
    }

    // try/catch ke bahar — ab sirf ek baar response jayega
    res.status(201).json(ok({ ...savedRepo, contributors: allContributors }));

    // replication bilkul alag — response ke baad
    replicateRepo(repoId).catch(() => {});
});

// POST /node/repos/:repoId/updates
router.post('/:repoId/updates', async (req, res) => {
    const { actorPublicKey, message, head } = req.body;
    const { repoId } = req.params;

    if (!actorPublicKey) {
        return res.status(400).json(fail('BAD_REQUEST', 'actorPublicKey required'));
    }

    let updatedRow = null;

    try {
        const repoCheck = await db.query(
            `SELECT repo_id FROM repositories WHERE repo_id = $1`,
            [repoId]
        );
        if (!repoCheck.rows.length) {
            return res.status(404).json(fail('NOT_FOUND', 'Repository not found'));
        }

        await db.query(
            `INSERT INTO repo_updates (repo_id, actor_public_key, head, message)
             VALUES ($1, $2, $3, $4)`,
            [repoId, actorPublicKey, head || null, message || null]
        );

        const updated = await db.query(
            `UPDATE repositories 
             SET version = version + 1, updated_at = NOW()
             WHERE repo_id = $1
             RETURNING repo_id, version, updated_at`,
            [repoId]
        );

        updatedRow = updated.rows[0];
    } catch (err) {
        return res.status(500).json(fail('DB_ERROR', err.message));
    }

    // try/catch ke bahar
    res.status(202).json(ok(updatedRow));

    // async replication
    replicateRepo(repoId).catch(() => {});
});
// GET /node/repos/:repoId/updates
router.get('/:repoId/updates', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM repo_updates WHERE repo_id = $1 ORDER BY created_at ASC`,
            [req.params.repoId]
        );
        res.json(ok(result.rows));
    } catch (err) {
        res.status(500).json(fail('DB_ERROR', err.message));
    }
});
module.exports = router;