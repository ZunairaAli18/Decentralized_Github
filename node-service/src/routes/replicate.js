const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const REPOS_DIR = process.env.REPOS_DIR || '/app/repos';

function ok(data) {
    return { ok: true, data };
}

function fail(code, message) {
    return { ok: false, error: { code, message } };
}

async function getAllFiles(dirPath, base) {
    const basePath = base || dirPath;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await getAllFiles(fullPath, basePath));
        } else {
            const content = fs.readFileSync(fullPath).toString('base64');
            const relativePath = fullPath.replace(basePath + path.sep, '');
            files.push({ path: relativePath, content });
        }
    }
    return files;
}

// POST /node/replicate — Postgres sync
router.post('/', async (req, res) => {
    const { repo, updates } = req.body;

    if (!repo || !repo.repo_id) {
        return res.status(400).json(fail('BAD_REQUEST', 'repo required'));
    }

    try {
        await db.query(
            `INSERT INTO users (public_key) VALUES ($1) ON CONFLICT DO NOTHING`,
            [repo.owner_public_key]
        );

        await db.query(
            `INSERT INTO repositories 
                (repo_id, name, owner_public_key, leader_node, version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (repo_id) DO UPDATE SET
                leader_node = EXCLUDED.leader_node,
                version = EXCLUDED.version,
                updated_at = EXCLUDED.updated_at
             WHERE repositories.version < EXCLUDED.version`,
            [
                repo.repo_id,
                repo.name,
                repo.owner_public_key,
                repo.leader_node,
                repo.version,
                repo.created_at,
                repo.updated_at,
            ]
        );

        if (repo.contributors && repo.contributors.length) {
            for (const key of repo.contributors) {
                await db.query(
                    `INSERT INTO users (public_key) VALUES ($1) ON CONFLICT DO NOTHING`,
                    [key]
                );
                await db.query(
                    `INSERT INTO repo_contributors (repo_id, public_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [repo.repo_id, key]
                );
            }
        }

        if (updates && updates.length) {
            for (const update of updates) {
                await db.query(
                    `INSERT INTO users (public_key) VALUES ($1) ON CONFLICT DO NOTHING`,
                    [update.actor_public_key]
                );
                await db.query(
                    `INSERT INTO repo_updates 
                        (update_id, repo_id, actor_public_key, head, message, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (update_id) DO NOTHING`,
                    [
                        update.update_id,
                        update.repo_id,
                        update.actor_public_key,
                        update.head,
                        update.message,
                        update.created_at,
                    ]
                );
            }
        }

        res.json(ok({ synced: repo.repo_id }));
    } catch (err) {
        res.status(500).json(fail('DB_ERROR', err.message));
    }
});

// POST /node/replicate/git — git files receive karo
router.post('/git', async (req, res) => {
    const { repoId, files } = req.body;
    if (!repoId || !files) {
        return res.status(400).json(fail('BAD_REQUEST', 'repoId and files required'));
    }

    const repoPath = path.join(REPOS_DIR, repoId);

    try {
        for (const file of files) {
            const filePath = path.join(repoPath, file.path);
            await fsp.mkdir(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
        }
        console.log(`[replicate] git synced: ${repoId}`);
        res.json(ok({ synced: repoId }));
    } catch (err) {
        res.status(500).json(fail('SYNC_ERROR', err.message));
    }
});

// GET /node/replicate/git/pull/:repoId — git files bhejo peers ko
router.get('/git/pull/:repoId', async (req, res) => {
    const { repoId } = req.params;
    const repoPath = path.join(REPOS_DIR, repoId);

    if (!fs.existsSync(repoPath)) {
        return res.status(404).json(fail('NOT_FOUND', 'Repo not found'));
    }

    try {
        const files = await getAllFiles(repoPath);
        res.json({ files });
    } catch (err) {
        res.status(500).json(fail('READ_ERROR', err.message));
    }
});

module.exports = router;