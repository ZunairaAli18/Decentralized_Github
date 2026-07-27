const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const git = require('isomorphic-git');

const REPOS_DIR = process.env.REPOS_DIR || '/app/repos';

function getRepoPath(repoId) {
    return path.join(REPOS_DIR, repoId);
}
async function getDefaultBranch(fss, dir) {
    // pehle main try karo, phir master
    const branches = ['main', 'master'];
    for (const branch of branches) {
        try {
            await git.resolveRef({ fs: fss, dir, ref: branch });
            return branch;
        } catch (_err) {
            continue;
        }
    }
    return null;
}

async function ensureRepo(repoId) {
    const dir = getRepoPath(repoId);
    const fss = require('fs');

    if (!fsSync.existsSync(path.join(dir, '.git'))) {
        await fs.mkdir(dir, { recursive: true });
        await git.init({ fs: fss, dir, defaultBranch: 'main' });
    }
    return dir;
}

// files push karo — commit banao
async function pushFiles(repoId, { files, message, authorPublicKey }) {
    const dir = await ensureRepo(repoId);
    const fss = require('fs');

    for (const file of files) {
        const filePath = path.join(dir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        if (file.deleted) {
            if (fsSync.existsSync(filePath)) {
                await fs.unlink(filePath);
                await git.remove({ fs: fss, dir, filepath: file.path });
            }
        } else {
            await fs.writeFile(filePath, file.content, 'utf8');
            await git.add({ fs: fss, dir, filepath: file.path });
        }
    }

    const sha = await git.commit({
        fs: fss,
        dir,
        message: message || 'update',
        author: {
            name: authorPublicKey.slice(0, 16),
            email: `${authorPublicKey.slice(0, 16)}@juncture`,
        },
    });

    // explicitly main branch pe set karo
    await git.writeRef({
        fs: fss,
        dir,
        ref: 'refs/heads/main',
        value: sha,
        force: true,
    });

    return sha;
}

// file tree fetch karo
async function getTree(repoId) {
    const dir = getRepoPath(repoId);
    const fss = require('fs');

    try {
        const branch = await getDefaultBranch(fss, dir);
        if (!branch) return [];
        const files = await git.listFiles({ fs: fss, dir, ref: branch });
        return files;
    } catch (_err) {
        console.error('[git] getTree error:', _err.message);
        return [];
    }
}


// file content fetch karo
async function getFile(repoId, filepath) {
    const dir = getRepoPath(repoId);
    const fss = require('fs');

    try {
        const branch = await getDefaultBranch(fss, dir);
        if (!branch) return null;

        const fullPath = path.join(dir, filepath);
        if (!fss.existsSync(fullPath)) return null;
        return fss.readFileSync(fullPath, 'utf8');
    } catch (_err) {
        console.error('[git] getFile error:', _err.message);
        return null;
    }
}
// commit log fetch karo
async function getLog(repoId, depth = 20) {
    const dir = getRepoPath(repoId);
    const fss = require('fs');

    try {
        const branch = await getDefaultBranch(fss, dir);
        if (!branch) return [];

        const commits = await git.log({ fs: fss, dir, ref: branch, depth });
        return commits.map(c => ({
            sha: c.oid,
            message: c.commit.message.trim(),
            author: c.commit.author.name,
            timestamp: c.commit.author.timestamp,
        }));
    } catch (_err) {
        console.error('[git] getLog error:', _err.message);
        return [];
    }
}

module.exports = { ensureRepo, pushFiles, getTree, getFile, getLog, getRepoPath };