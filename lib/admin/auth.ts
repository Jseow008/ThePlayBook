/**
 * Admin Authentication Utilities
 * 
 * Simple password-based auth for the admin panel.
 * Uses a signed session cookie stored in httpOnly cookie.
 */

import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";

const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a signed session token
 */
function createSessionToken(): string {
    const random = randomBytes(32).toString("hex");
    const timestamp = Date.now().toString();
    const data = `${random}:${timestamp}`;
    const signature = createHash("sha256")
        .update(data + process.env.ADMIN_PASSWORD)
        .digest("hex");
    return `${data}:${signature}`;
}

/**
 * Verify a session token is valid and not expired
 */
function verifySessionToken(token: string): boolean {
    try {
        const parts = token.split(":");
        if (parts.length !== 3) return false;

        const [random, timestamp, signature] = parts;
        const data = `${random}:${timestamp}`;

        // Verify signature
        const expectedSignature = createHash("sha256")
            .update(data + process.env.ADMIN_PASSWORD)
            .digest("hex");

        if (signature !== expectedSignature) return false;

        // Check expiration
        const tokenTime = parseInt(timestamp, 10);
        if (Date.now() - tokenTime > SESSION_DURATION_MS) return false;

        return true;
    } catch {
        return false;
    }
}

/**
 * Verify the current request has a valid admin session
 */
export async function verifyAdminSession(): Promise<boolean> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);

    if (!sessionCookie?.value) {
        return false;
    }

    return verifySessionToken(sessionCookie.value);
}

/**
 * Create an admin session and set the cookie
 */
export async function createAdminSession(): Promise<void> {
    const cookieStore = await cookies();
    const token = createSessionToken();

    cookieStore.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION_MS / 1000, // in seconds
        path: "/",
    });
}

/**
 * Clear the admin session cookie
 */
export async function clearAdminSession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_COOKIE_NAME);
}

/**
 * Verify password matches the environment variable
 */
export function verifyAdminPassword(password: string): boolean {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error("ADMIN_PASSWORD environment variable is not set");
        return false;
    }
    return password === adminPassword;
}
