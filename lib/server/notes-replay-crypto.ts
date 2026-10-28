import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

const keyId = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const keys = z.record(keyId, z.string().regex(/^[a-f0-9]{64}$/)).refine(map => Object.keys(map).length <= 64);
const configSchema = z.object({ encryptionCurrent: keyId, fingerprintCurrent: keyId, encryption: keys, fingerprint: keys });
export function replayKeys() {
    const config = configSchema.parse(JSON.parse(process.env.NOTES_REPLAY_KEYS ?? '{}'));
    if (!config.encryption[config.encryptionCurrent] || !config.fingerprint[config.fingerprintCurrent]) throw new Error('Replay keys unavailable');
    return config;
}
export function canonicalReplayValue(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalReplayValue).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,item]) => item !== undefined)
        .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => `${JSON.stringify(key)}:${canonicalReplayValue(item)}`).join(',')}}`;
    return JSON.stringify(value);
}
export function replayFingerprint(key: string, purpose: 'request' | 'evidence', value: unknown): string {
    return createHmac('sha256', Buffer.from(key,'hex')).update(`notes-replay:v1:${purpose}\0`).update(canonicalReplayValue(value)).digest('hex');
}
export const EncryptedReplaySchema = z.object({ version: z.literal(1), keyId, fingerprintKeyId: keyId,
    nonce: z.string().regex(/^[a-f0-9]{24}$/), tag: z.string().regex(/^[a-f0-9]{32}$/), data: z.string().regex(/^[a-f0-9]+$/).max(524288) });
export type EncryptedReplay = z.infer<typeof EncryptedReplaySchema>;
function aad(identity: unknown, requestFingerprint: string, keyId: string, fingerprintKeyId: string) {
    return Buffer.from(canonicalReplayValue({ version: 1, identity, requestFingerprint, keyId, fingerprintKeyId }));
}
export function encryptReplay(plaintext: string, identity: unknown, requestFingerprint: string): EncryptedReplay {
    const config = replayKeys(), keyId = config.encryptionCurrent, fingerprintKeyId = config.fingerprintCurrent;
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(config.encryption[keyId],'hex'), nonce);
    cipher.setAAD(aad(identity,requestFingerprint,keyId,fingerprintKeyId));
    const data = Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
    return { version: 1, keyId, fingerprintKeyId, nonce: nonce.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') };
}
export function decryptReplay(envelope: EncryptedReplay, identity: unknown, fingerprints: Record<string,string>): string {
    const config = replayKeys(), key = config.encryption[envelope.keyId], fingerprint = fingerprints[envelope.fingerprintKeyId];
    if (!key || !fingerprint) throw new Error('Replay keys unavailable');
    const decipher = createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(envelope.nonce,'hex'));
    decipher.setAAD(aad(identity,fingerprint,envelope.keyId,envelope.fingerprintKeyId));
    decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data,'hex')),decipher.final()]).toString('utf8');
}
