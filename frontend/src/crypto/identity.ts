import nacl from "tweetnacl";

const STORAGE_SECRET_KEY = "juncture.identity.secretKeyHex";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBytes(hex: string): Uint8Array {
    if (!hex || hex.length % 2 !== 0) {
        throw new Error("Invalid hex input");
    }

    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

export class Identity {
    private readonly secretKey: Uint8Array;
    private readonly publicKey: Uint8Array;

    constructor(secretKey: Uint8Array) {
        if (secretKey.length !== nacl.sign.secretKeyLength) {
            throw new Error("Invalid secret key length");
        }
        this.secretKey = secretKey;
        this.publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    }

    static generate(): Identity {
        const keyPair = nacl.sign.keyPair();
        return new Identity(keyPair.secretKey);
    }

    static fromSecretKeyHex(secretKeyHex: string): Identity {
        return new Identity(hexToBytes(secretKeyHex));
    }

    static loadOrCreate(): Identity {
        if (typeof window === "undefined") {
            return Identity.generate();
        }

        const existing = window.localStorage.getItem(STORAGE_SECRET_KEY);
        if (existing) {
            try {
                return Identity.fromSecretKeyHex(existing);
            } catch (_err) {
                console.log(_err)
            }
        }

        const identity = Identity.generate();
        identity.save();
        return identity;
    }

    save(): void {
        if (typeof window === "undefined") {
            return;
        }
        window.localStorage.setItem(STORAGE_SECRET_KEY, bytesToHex(this.secretKey));
    }

    getPublicKeyHex(): string {
        return bytesToHex(this.publicKey);
    }

    signMessageHex(message: string): string {
        const payload = new TextEncoder().encode(message);
        const signature = nacl.sign.detached(payload, this.secretKey);
        return bytesToHex(signature);
    }
}
