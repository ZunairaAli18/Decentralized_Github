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

console.log('Public Key:', publicKey);

async function main() {
    // challenge
    const challengeRes = await fetch(`${GATEWAY}/auth/challenge?publicKey=${publicKey}`);
    const challengeData = await challengeRes.json();
    console.log('Challenge:', JSON.stringify(challengeData, null, 2));

    const { challengeId, nonce } = challengeData.data;

    // sign
    const message = new TextEncoder().encode(nonce);
    const signature = nacl.sign.detached(message, secretKey);
    const signatureHex = bytesToHex(signature);

    // verify
    const verifyRes = await fetch(`${GATEWAY}/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, publicKey, signature: signatureHex }),
    });
    const verifyData = await verifyRes.json();
    console.log('Token:', verifyData.data?.token);

    if (!verifyData.ok) return;
    const token = verifyData.data.token;

    // repo create
    const repoRes = await fetch(`${GATEWAY}/repos`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'test-repo', ownerPublicKey: publicKey }),
    });
    const repoData = await repoRes.json();
    console.log('Repo:', JSON.stringify(repoData, null, 2));

    const repoId = repoData.data?.repoId;
    if (!repoId) return;

    // public read — round robin
    const pubRead = await fetch(`${GATEWAY}/repos/${repoId}`);
    const pubData = await pubRead.json();
    console.log('Public read meta:', pubData.meta);

    // owner read — leader
    const ownerRead = await fetch(`${GATEWAY}/repos/${repoId}`, {
        headers: { 'authorization': `Bearer ${token}` },
    });
    const ownerData = await ownerRead.json();
    console.log('Owner read meta:', ownerData.meta);
}

main().catch(console.error);