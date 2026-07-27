// function hash(input) {
//     let h = 0;
//     for (let i = 0; i < input.length; i += 1) {
//         h = (h << 5) - h + input.charCodeAt(i);
//         h |= 0;
//     }
//     return Math.abs(h);
// }

// function pickLeaderNode(repoId, nodes) {
//     if (!Array.isArray(nodes) || nodes.length === 0) {
//         return null;
//     }
//     const index = hash(repoId) % nodes.length;
//     return nodes[index];
// }

// const DEFAULT_LEASE_TTL_MS = Number(process.env.LEASE_TTL_MS || 30000);
// const leases = new Map();

// function nowMs() {
//     return Date.now();
// }

// function getLease(repoId) {
//     const lease = leases.get(repoId);
//     if (!lease) {
//         return null;
//     }
//     return { ...lease };
// }

// function assignLease(repoId, nodes, options) {
//     const ttlMs = Number((options && options.ttlMs) || DEFAULT_LEASE_TTL_MS);
//     const preferredNode = options && options.preferredNode;
//     if (!Array.isArray(nodes) || nodes.length === 0) {
//         return null;
//     }

//     const previous = leases.get(repoId);
//     const leaderNode = preferredNode && nodes.includes(preferredNode)
//         ? preferredNode
//         : pickLeaderNode(repoId, nodes);

//     const term = !previous
//         ? 1
//         : previous.leaderNode === leaderNode
//             ? previous.term
//             : previous.term + 1;

//     const lease = {
//         repoId,
//         leaderNode,
//         term,
//         ttlMs,
//         assignedAt: nowMs(),
//         expiresAt: nowMs() + ttlMs,
//     };

//     leases.set(repoId, lease);
//     return { ...lease };
// }

// function isLeaseExpired(lease) {
//     if (!lease) {
//         return true;
//     }
//     return nowMs() >= lease.expiresAt;
// }

// function renewLease(repoId, ttlMs) {
//     const lease = leases.get(repoId);
//     if (!lease) {
//         return null;
//     }

//     const nextTtlMs = Number(ttlMs || lease.ttlMs || DEFAULT_LEASE_TTL_MS);
//     const renewed = {
//         ...lease,
//         ttlMs: nextTtlMs,
//         expiresAt: nowMs() + nextTtlMs,
//     };
//     leases.set(repoId, renewed);
//     return { ...renewed };
// }
// let rrCounter = 0;

// function pickRoundRobin(nodes) {
//     if (!nodes.length) return null;
//     const node = nodes[rrCounter % nodes.length];
//     rrCounter += 1;
//     return node;
// }

// module.exports = {
//     pickLeaderNode,
//     pickRoundRobin,   
//     getLease,
//     assignLease,
//     isLeaseExpired,
//     renewLease,
// };
const crypto = require('crypto');

// virtual nodes for better distribution
const VIRTUAL_NODES = 150;

class ConsistentHashRing {
    constructor() {
        this.ring = new Map();   // hash -> nodeUrl
        this.sorted = [];        // sorted hashes
    }

    _hash(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    _hexToNum(hex) {
        // first 8 chars — enough for distribution
        return parseInt(hex.slice(0, 8), 16);
    }

    addNode(nodeUrl) {
        for (let i = 0; i < VIRTUAL_NODES; i++) {
            const virtualKey = `${nodeUrl}#${i}`;
            const hash = this._hexToNum(this._hash(virtualKey));
            this.ring.set(hash, nodeUrl);
            this.sorted.push(hash);
        }
        this.sorted.sort((a, b) => a - b);
    }

    removeNode(nodeUrl) {
        for (let i = 0; i < VIRTUAL_NODES; i++) {
            const virtualKey = `${nodeUrl}#${i}`;
            const hash = this._hexToNum(this._hash(virtualKey));
            this.ring.delete(hash);
        }
        this.sorted = this.sorted.filter(h => this.ring.has(h));
    }

    getNode(key) {
    if (!this.sorted.length) return null;
    
    const hash = this._hexToNum(this._hash(key));
    
    let lo = 0;
    let hi = this.sorted.length - 1;
    
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (this.sorted[mid] < hash) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    
    if (this.sorted[lo] < hash) {
        return this.ring.get(this.sorted[0]);
    }
    
    return this.ring.get(this.sorted[lo]);
}
}

// singleton ring — nodes env se load karo
const ring = new ConsistentHashRing();

function initRing(nodes) {
    for (const node of nodes) {
        ring.addNode(node);
    }
}

function parseNodesFromEnv() {
    const raw = process.env.NODE_REGISTRY || '';
    return raw.split(',').map(n => n.trim()).filter(Boolean);
}

// startup pe ring initialize karo
initRing(parseNodesFromEnv());

// ── Lease ────────────────────────────────────────────

const DEFAULT_LEASE_TTL_MS = Number(process.env.LEASE_TTL_MS || 30000);
const leases = new Map();

function nowMs() {
    return Date.now();
}

function pickLeaderNode(repoId, nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    // agar nodes change hue hain toh ring update karo
    const currentNodes = new Set([...ring.ring.values()]);
    for (const node of nodes) {
        if (!currentNodes.has(node)) {
            ring.addNode(node);
        }
    }

    return ring.getNode(repoId);
}

function getLease(repoId) {
    const lease = leases.get(repoId);
    if (!lease) return null;
    return { ...lease };
}

function assignLease(repoId, nodes, options) {
    const ttlMs = Number((options && options.ttlMs) || DEFAULT_LEASE_TTL_MS);
    const preferredNode = options && options.preferredNode;

    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    const previous = leases.get(repoId);
    const leaderNode = preferredNode && nodes.includes(preferredNode)
        ? preferredNode
        : pickLeaderNode(repoId, nodes);

    const term = !previous
        ? 1
        : previous.leaderNode === leaderNode
            ? previous.term
            : previous.term + 1;

    const lease = {
        repoId,
        leaderNode,
        term,
        ttlMs,
        assignedAt: nowMs(),
        expiresAt: nowMs() + ttlMs,
    };

    leases.set(repoId, lease);
    return { ...lease };
}

function isLeaseExpired(lease) {
    if (!lease) return true;
    return nowMs() >= lease.expiresAt;
}

function renewLease(repoId, ttlMs) {
    const lease = leases.get(repoId);
    if (!lease) return null;

    const nextTtlMs = Number(ttlMs || lease.ttlMs || DEFAULT_LEASE_TTL_MS);
    const renewed = {
        ...lease,
        ttlMs: nextTtlMs,
        expiresAt: nowMs() + nextTtlMs,
    };
    leases.set(repoId, renewed);
    return { ...renewed };
}

// ── Round Robin ──────────────────────────────────────

let rrCounter = 0;

function pickRoundRobin(nodes) {
    if (!nodes.length) return null;
    const node = nodes[rrCounter % nodes.length];
    rrCounter += 1;
    return node;
}

module.exports = {
    pickLeaderNode,
    pickRoundRobin,
    getLease,
    assignLease,
    isLeaseExpired,
    renewLease,
};