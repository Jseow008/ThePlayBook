/** A transport redelivery retains this value; only an explicit Send/retry creates one. */
export function newNotesReplayAttemptId(now = Date.now()): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let timestamp = Math.floor(now);
    for (let index = 5; index >= 0; index--) { bytes[index] = timestamp % 256; timestamp = Math.floor(timestamp / 256); }
    bytes[6] = (bytes[6] & 15) | 0x70;
    bytes[8] = (bytes[8] & 63) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
