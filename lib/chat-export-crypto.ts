import type { ChatExportPayload, EncryptedChatExportPayload } from "@/lib/chat-export";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

export async function encryptChatExport(payload: ChatExportPayload): Promise<{
    encrypted: EncryptedChatExportPayload;
    key: string;
}> {
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const plaintext = textEncoder.encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, plaintext);

    return {
        encrypted: {
            version: 1,
            ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
            iv: bytesToBase64Url(iv),
        },
        key: bytesToBase64Url(rawKey),
    };
}

export async function decryptChatExport(
    encrypted: EncryptedChatExportPayload,
    encodedKey: string
): Promise<ChatExportPayload> {
    const keyBytes = base64UrlToBytes(encodedKey);
    const iv = base64UrlToBytes(encrypted.iv);
    const ciphertext = base64UrlToBytes(encrypted.ciphertext);
    const key = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(keyBytes),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext)
    );

    return JSON.parse(textDecoder.decode(plaintext)) as ChatExportPayload;
}
