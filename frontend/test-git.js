import pkg from 'tweetnacl';
const nacl = pkg;

const GATEWAY = 'http://localhost:3000';

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
        body: JSON.stringify({ challengeId: data.challengeId, publicKey, signature: bytesToHex(signature) }),
    });
    const { data: vData } = await verifyRes.json();
    return vData.token;
}

async function main() {
    const token = await getToken();

    // repo create
    const repoRes = await fetch(`${GATEWAY}/repos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: `git-test-${Date.now()}`, ownerPublicKey: publicKey }),
    });
    const repoData = await repoRes.json();
    const repoId = repoData.data?.repoId;
    console.log('Repo:', repoId, '| leader:', repoData.meta?.lease?.leaderNode);

    // files push karo
    const pushRes = await fetch(`${GATEWAY}/repos/${repoId}/git/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
        body: JSON.stringify({
            message: 'initial commit',
            files: [
                { path: 'README.md', content: '# My Repo\nHello World' },
                { path: 'src/index.js', content: 'console.log("hello")' },
            ],
        }),
    });
    const pushData = await pushRes.json();
    console.log('Push:', pushData);
    // 2 sec wait karo replication ke liye
    await new Promise(resolve => setTimeout(resolve, 3000));
    // tree dekho
    const treeRes = await fetch(`${GATEWAY}/repos/${repoId}/git/tree`);
    const treeData = await treeRes.json();
    console.log('Tree:', treeData.data);

    // log dekho
    const logRes = await fetch(`${GATEWAY}/repos/${repoId}/git/log`);
    const logData = await logRes.json();
    console.log('Log:', logData.data);

    // file content dekho
    const fileRes = await fetch(`${GATEWAY}/repos/${repoId}/git/file?path=README.md`);
    const fileData = await fileRes.json();
    console.log('README.md:', fileData.data?.content);
}

main().catch(console.error);