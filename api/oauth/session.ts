import * as jose from "jose";
import { Session } from "@contracts/constants";
import { env } from "../lib/env";
import type { SessionPayload } from "./types";

const JWT_ALG = "HS256";
const SESSION_MAX_AGE_SECONDS = Math.floor(Session.maxAgeMs / 1000);

export async function signSessionToken(
  payload: SessionPayload
): Promise<string> {
  const secret = new TextEncoder().encode(env.sessionSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS)
    .sign(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  if (!token) {
    console.warn("[session] No token provided for verification.");
    return null;
  }
  try {
    const secret = new TextEncoder().encode(env.sessionSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    const { unionId, clientId } = payload;
    if (!unionId || !clientId) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    return { unionId, clientId } as SessionPayload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      console.info("[session] Session token expired; clearing auth state.");
      return null;
    }

    console.warn("[session] JWT verification failed:", error);
    return null;
  }
}
