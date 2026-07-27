const express = require('express');
const nacl = require('tweetnacl');
const { randomUUID } = require('crypto');

const router = express.Router();

const challengeTtlMs = Number(process.env.AUTH_CHALLENGE_TTL_MS || 120000);
const sessionTtlMs = Number(process.env.AUTH_SESSION_TTL_MS || 3600000);

const challenges = new Map();
const sessions = new Map();

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

function cleanupExpired() {
    const now = Date.now();
    for (const [id, value] of challenges.entries()) {
        if (value.expiresAt <= now) {
            challenges.delete(id);
        }
    }
    for (const [token, value] of sessions.entries()) {
        if (value.expiresAt <= now) {
            sessions.delete(token);
        }
    }
}

function parseBearerToken(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
        return null;
    }
    const [scheme, token] = headerValue.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return null;
    }
    return token;
}

router.get('/challenge', (req, res) => {
    cleanupExpired();
    const publicKey = typeof req.query.publicKey === 'string' ? req.query.publicKey.trim() : '';
    if (!publicKey) {
        res.status(400).json(fail('BAD_REQUEST', 'Query parameter "publicKey" is required'));
        return;
    }

    const challengeId = randomUUID();
    const nonce = randomUUID();
    const expiresAt = Date.now() + challengeTtlMs;
    challenges.set(challengeId, {
        challengeId,
        publicKey,
        nonce,
        expiresAt,
    });

    res.json(ok({ challengeId, nonce, expiresAt }));
});

router.post('/verify', (req, res) => {
    cleanupExpired();

    const challengeId = req.body && req.body.challengeId;
    const publicKey = req.body && req.body.publicKey;
    const signature = req.body && req.body.signature;

    if (!challengeId || !publicKey || !signature) {
        res.status(400).json(fail('BAD_REQUEST', 'Fields "challengeId", "publicKey", and "signature" are required'));
        return;
    }

    const challenge = challenges.get(challengeId);
    if (!challenge || challenge.publicKey !== publicKey) {
        res.status(401).json(fail('AUTH_INVALID', 'Invalid challenge or public key'));
        return;
    }

    try {
        const message = Buffer.from(challenge.nonce, 'utf8');
        const sigBytes = Buffer.from(signature, 'hex');
        const pubBytes = Buffer.from(publicKey, 'hex');

        const valid = nacl.sign.detached.verify(message, sigBytes, pubBytes);
        if (!valid) {
            res.status(401).json(fail('AUTH_INVALID', 'Signature verification failed'));
            return;
        }

        challenges.delete(challengeId);
        const token = randomUUID();
        const expiresAt = Date.now() + sessionTtlMs;
        sessions.set(token, {
            token,
            publicKey,
            createdAt: Date.now(),
            expiresAt,
        });

        res.json(ok({ token, publicKey, expiresAt }));
    } catch (err) {
        res.status(400).json(fail('BAD_REQUEST', 'Invalid key or signature encoding', { message: err.message }));
    }
});

function requireAuth(req, res, next) {
    cleanupExpired();
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
        res.status(401).json(fail('AUTH_REQUIRED', 'Bearer token is required'));
        return;
    }

    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (session) {
            sessions.delete(token);
        }
        res.status(401).json(fail('AUTH_INVALID', 'Session is invalid or expired'));
        return;
    }

    req.auth = {
        publicKey: session.publicKey,
        token: session.token,
        expiresAt: session.expiresAt,
    };

    next();
}

function getSession(token) {
    cleanupExpired();
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) return null;
    return { ...session };
}

module.exports = {
    router,
    requireAuth,
    getSession,   
};
