const express = require('express');

const router = express.Router();

function ok(data, meta) {
	return {
		ok: true,
		data,
		meta: meta || null,
	};
}

function parseNodesFromEnv() {
	const raw = process.env.NODE_REGISTRY || '';
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((address, index) => ({
			nodeId: `node-${index + 1}`,
			address,
			status: 'offline',
			lastSeenAt: null,
		}));
}

async function probeNode(node) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3000);
	try {
		const response = await fetch(`${node.address}/health`, { signal: controller.signal });
		if (!response.ok) {
			return node;
		}

		return {
			...node,
			status: 'online',
			lastSeenAt: new Date().toISOString(),
		};
	} catch (_err) {
		return node;
	} finally {
		clearTimeout(timeout);
	}
}

router.get('/', async (_req, res) => {
	const nodes = parseNodesFromEnv();
	const settled = await Promise.all(nodes.map((node) => probeNode(node)));
	const online = settled.filter((node) => node.status === 'online').length;

	res.json(
		ok(settled, {
			total: settled.length,
			online,
		})
	);
});

router.get('/discovery/peers', async (_req, res) => {
	const nodes = await Promise.all(parseNodesFromEnv().map((node) => probeNode(node)));
	res.json(
		ok(
			{
				peers: nodes,
			},
			{
				source: 'gateway-node-registry',
			}
		)
	);
});

module.exports = router;
