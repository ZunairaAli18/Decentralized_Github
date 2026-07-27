import pkg from 'tweetnacl';
const nacl = pkg;

const GATEWAY = 'http://localhost:3000';

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

const keypair = nacl.sign.keyPair();
const publicKey = bytesToHex(keypair.publicKey);
const secretKey = keypair.secretKey;

async function getToken() {
    const challengeRes = await fetch(`${GATEWAY}/auth/challenge?publicKey=${publicKey}`);
    const { data } = await challengeRes.json();
    const message = new TextEncoder().encode(data.nonce);
    const signature = nacl.sign.detached(message, secretKey);
    const verifyRes = await fetch(`${GATEWAY}/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            challengeId: data.challengeId,
            publicKey,
            signature: bytesToHex(signature),
        }),
    });
    const { data: vData } = await verifyRes.json();
    return vData.token;
}

async function main() {
    const token = await getToken();
    console.log('Token:', token);

    // pehle repo create karo is keypair se
    const repoRes = await fetch(`${GATEWAY}/repos`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            name: `failover-test-${Date.now()}`,
            ownerPublicKey: publicKey,
        }),
    });
    const repoData = await repoRes.json();
    console.log('Repo created on leader:', repoData.meta?.lease?.leaderNode);

    const repoId = repoData.data?.repoId;

    // ab node3 band karo aur update karo
    console.log('\nAb alag terminal mein node3 band karo:');
    console.log('docker compose stop node3');
    console.log('\nPhir Enter dabaو...');
    await new Promise(resolve => process.stdin.once('data', resolve));

    const updateRes = await fetch(`${GATEWAY}/repos/${repoId}/updates`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            actorPublicKey: publicKey,
            message: 'test update after leader down',
        }),
    });
    const updateData = await updateRes.json();
    console.log('Update response:', JSON.stringify(updateData, null, 2));
}

main().catch(console.error);