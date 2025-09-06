// lib/jwt.ts
import {
	Payload,
	verify,
} from "https://deno.land/x/djwt@v2.8/mod.ts";

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

const JWT_SECRET_STRING = Deno.env.get("DA_JWT_SECRET");
if (!JWT_SECRET_STRING) throw new Error("Missing JWT_SECRET env var");

export const JWT_SECRET = await importKey(JWT_SECRET_STRING);


export interface AccessTokenPayload extends Payload {
	userId: number | string;
	username: string;
	type: "access";
}

export interface RefreshTokenPayload extends Payload {
	userId: number | string;
	username: string;
	type: "refresh";
	jti: string;
}

export type JwtPayload = AccessTokenPayload | RefreshTokenPayload;

/**
 * Verify a JWT token and return the decoded payload if valid.
 * Throws if token is invalid or expired.
 */
export async function verifyJWT(token: string): Promise<JwtPayload> {
	const payload = await verify(token, JWT_SECRET);
	return payload as JwtPayload;
}