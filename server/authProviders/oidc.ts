// OpenID Connect provider using openid-client v6
import * as oidcClient from "openid-client";
import type { Request, Response } from "express";
import { log } from "../logger";

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  providerName: string;
  // Claim mappings
  usernameClaim: string;
  nameClaim: string;
  emailClaim: string;
}

function oidcLog(msg: string) { log(msg, "auth:oidc"); }
function oidcError(msg: string, err?: unknown) {
  const detail = err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : "";
  log(`ERROR ${msg}${detail}`, "auth:oidc");
}

export function getOidcConfig(): OidcConfig {
  return {
    issuerUrl:     process.env.OIDC_ISSUER_URL     || "",
    clientId:      process.env.OIDC_CLIENT_ID      || "",
    clientSecret:  process.env.OIDC_CLIENT_SECRET  || "",
    redirectUri:   process.env.OIDC_REDIRECT_URI   || `${process.env.APP_URL || "http://localhost:5000"}/api/auth/callback`,
    scope:         process.env.OIDC_SCOPE          || "openid profile email",
    providerName:  process.env.OIDC_PROVIDER_NAME  || "SSO",
    usernameClaim: process.env.OIDC_CLAIM_USERNAME || "preferred_username",
    nameClaim:     process.env.OIDC_CLAIM_NAME     || "name",
    emailClaim:    process.env.OIDC_CLAIM_EMAIL    || "email",
  };
}

// Cached OIDC configuration (discovered from the issuer once)
let cachedOidcConfig: oidcClient.Configuration | null = null;

async function getOidcConfiguration(): Promise<oidcClient.Configuration> {
  if (cachedOidcConfig) return cachedOidcConfig;

  const cfg = getOidcConfig();
  if (!cfg.issuerUrl) {
    throw new Error("OIDC_ISSUER_URL is not set");
  }
  if (!cfg.clientId) {
    throw new Error("OIDC_CLIENT_ID is not set");
  }

  oidcLog(`discovering OIDC configuration from issuer=${cfg.issuerUrl}`);
  try {
    cachedOidcConfig = await oidcClient.discovery(
      new URL(cfg.issuerUrl),
      cfg.clientId,
      cfg.clientSecret,
    );
    oidcLog(`OIDC discovery success issuer=${cfg.issuerUrl} provider=${cfg.providerName}`);
    return cachedOidcConfig;
  } catch (err) {
    oidcError(`OIDC discovery failed issuer=${cfg.issuerUrl}`, err);
    throw err;
  }
}

// Start the OIDC authorization flow — redirects browser to the IDP
export async function startOidcFlow(req: Request, res: Response): Promise<void> {
  const cfg = getOidcConfig();

  oidcLog(`starting authorization flow redirectUri=${cfg.redirectUri} scope=${cfg.scope}`);
  let config: oidcClient.Configuration;
  try {
    config = await getOidcConfiguration();
  } catch (err) {
    oidcError("cannot start flow — OIDC configuration unavailable", err);
    throw err;
  }

  const state = oidcClient.randomState();
  const nonce = oidcClient.randomNonce();

  // Persist state & nonce in session to verify the callback
  (req.session as any).oidcState = state;
  (req.session as any).oidcNonce = nonce;

  const redirectUrl = oidcClient.buildAuthorizationUrl(config, {
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
    nonce,
  });

  oidcLog(`redirecting to IDP url=${redirectUrl.origin}${redirectUrl.pathname}`);
  res.redirect(redirectUrl.href);
}

export interface OidcCallbackResult {
  success: boolean;
  message?: string;
  user?: { username: string; name: string; email: string };
}

// Handle the IDP callback and extract the authenticated user
export async function handleOidcCallback(
  req: Request,
): Promise<OidcCallbackResult> {
  const cfg = getOidcConfig();

  let config: oidcClient.Configuration;
  try {
    config = await getOidcConfiguration();
  } catch (err) {
    oidcError("cannot handle callback — OIDC configuration unavailable", err);
    return { success: false, message: "OIDC configuration unavailable" };
  }

  const expectedState = (req.session as any).oidcState as string | undefined;
  const expectedNonce = (req.session as any).oidcNonce as string | undefined;

  if (!expectedState) {
    oidcLog("callback received but no oidcState in session — possible replay or stale session");
  }

  // Clear state from session
  delete (req.session as any).oidcState;
  delete (req.session as any).oidcNonce;

  try {
    const callbackUrl = new URL(
      req.url,
      process.env.APP_URL || "http://localhost:5000",
    );

    // Surface any IDP-level errors sent back in the callback query string
    const idpError = callbackUrl.searchParams.get("error");
    const idpErrorDesc = callbackUrl.searchParams.get("error_description");
    if (idpError) {
      oidcLog(`IDP returned error=${idpError} description=${idpErrorDesc ?? "(none)"}`);
      return { success: false, message: idpErrorDesc || idpError };
    }

    oidcLog("exchanging authorization code for tokens");
    const tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
      expectedState,
      expectedNonce,
    });

    const claims = tokens.claims();
    if (!claims) {
      oidcError("token exchange succeeded but claims() returned null");
      return { success: false, message: "No claims in token" };
    }

    oidcLog(`token claims received sub=${claims.sub} claims=${Object.keys(claims).join(",")}`);

    const username = String(claims[cfg.usernameClaim] ?? claims.sub);
    const name     = String(claims[cfg.nameClaim]     ?? username);
    const email    = String(claims[cfg.emailClaim]    ?? "");

    if (!username || username === "undefined") {
      oidcError(`username claim '${cfg.usernameClaim}' missing from token — available claims: ${Object.keys(claims).join(", ")}`);
      return { success: false, message: `Username claim '${cfg.usernameClaim}' not found in token` };
    }
    if (!email) {
      oidcLog(`WARN email claim '${cfg.emailClaim}' missing from token for username=${username}`);
    }

    oidcLog(`claims extracted username=${username} name=${name} email=${email}`);
    return { success: true, user: { username, name, email } };
  } catch (err) {
    // Distinguish common failure modes for actionable log messages
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("state")) {
      oidcError("state mismatch — possible CSRF or session expiry", err);
      return { success: false, message: "Authentication state mismatch. Please try logging in again." };
    }
    if (msg.includes("nonce")) {
      oidcError("nonce mismatch — possible replay attack or session expiry", err);
      return { success: false, message: "Authentication nonce mismatch. Please try logging in again." };
    }
    if (msg.includes("expired") || msg.includes("exp")) {
      oidcError("token has expired", err);
      return { success: false, message: "SSO token has expired. Please log in again." };
    }
    oidcError("authorization code grant failed", err);
    return { success: false, message: "Authentication failed" };
  }
}
