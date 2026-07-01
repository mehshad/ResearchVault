import { Client } from "ldapts";
import { log } from "../logger";

export interface LdapAuthResult {
  success: boolean;
  message?: string;
  user?: { username: string; name: string; email: string };
}

function ldapLog(msg: string) { log(msg, "auth:ldap"); }
function ldapError(msg: string, err?: unknown) {
  const detail = err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : "";
  log(`ERROR ${msg}${detail}`, "auth:ldap");
}

function getLdapConfig() {
  return {
    url:           process.env.LDAP_URL           || "ldap://localhost:389",
    bindDN:        process.env.LDAP_BIND_DN        || "",
    bindPassword:  process.env.LDAP_BIND_PASSWORD  || "",
    searchBase:    process.env.LDAP_SEARCH_BASE    || "",
    // Use {{username}} as placeholder, e.g. (sAMAccountName={{username}})
    searchFilter:  process.env.LDAP_SEARCH_FILTER  || "(uid={{username}})",
    usernameField: process.env.LDAP_USER_FIELD_USERNAME || "uid",
    nameField:     process.env.LDAP_USER_FIELD_NAME     || "cn",
    emailField:    process.env.LDAP_USER_FIELD_EMAIL    || "mail",
    tlsEnabled:    process.env.LDAP_TLS === "true",
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
  };
}

export async function authenticateLdap(
  username: string,
  password: string,
): Promise<LdapAuthResult> {
  const cfg = getLdapConfig();

  ldapLog(`authenticating username=${username} url=${cfg.url} searchBase=${cfg.searchBase} tls=${cfg.tlsEnabled}`);

  if (!cfg.bindDN) {
    ldapError("LDAP_BIND_DN is not configured — cannot perform service account bind");
    return { success: false, message: "LDAP_BIND_DN is not configured" };
  }
  if (!cfg.searchBase) {
    ldapError("LDAP_SEARCH_BASE is not configured — cannot search for user");
    return { success: false, message: "LDAP_SEARCH_BASE is not configured" };
  }

  const client = new Client({
    url: cfg.url,
    tlsOptions: cfg.tlsEnabled
      ? { rejectUnauthorized: cfg.tlsRejectUnauthorized }
      : undefined,
  });

  try {
    // Bind with the service account to search for the user
    ldapLog(`service account bind dn=${cfg.bindDN}`);
    try {
      await client.bind(cfg.bindDN, cfg.bindPassword);
    } catch (err) {
      ldapError(`service account bind failed dn=${cfg.bindDN}`, err);
      return { success: false, message: "LDAP service account bind failed — check LDAP_BIND_DN / LDAP_BIND_PASSWORD" };
    }
    ldapLog("service account bind success");

    // Search for the user entry
    const filter = cfg.searchFilter.replace(/\{\{username\}\}/g, username);
    ldapLog(`searching base=${cfg.searchBase} filter=${filter}`);
    let searchEntries: any[];
    try {
      ({ searchEntries } = await client.search(cfg.searchBase, {
        filter,
        attributes: ["dn", cfg.usernameField, cfg.nameField, cfg.emailField],
      }));
    } catch (err) {
      ldapError(`search failed base=${cfg.searchBase} filter=${filter}`, err);
      return { success: false, message: "LDAP search failed — check LDAP_SEARCH_BASE and LDAP_SEARCH_FILTER" };
    }

    if (searchEntries.length === 0) {
      ldapLog(`user not found username=${username} filter=${filter}`);
      return { success: false, message: "User not found" };
    }
    if (searchEntries.length > 1) {
      ldapLog(`WARN multiple entries (${searchEntries.length}) found for username=${username} — using first`);
    }

    const entry = searchEntries[0];
    const userDN = entry.dn;
    ldapLog(`user entry found dn=${userDN}`);

    // Unbind service account, then re-bind as the user to verify password
    try { await client.unbind(); } catch {}

    ldapLog(`user bind attempt dn=${userDN}`);
    const userClient = new Client({ url: cfg.url });
    try {
      await userClient.bind(userDN, password);
    } catch (err) {
      ldapLog(`user bind failed (wrong password) username=${username} dn=${userDN}`);
      return { success: false, message: "Invalid credentials" };
    } finally {
      try { await userClient.unbind(); } catch {}
    }
    ldapLog(`user bind success username=${username}`);

    const name  = String(entry[cfg.nameField]  ?? username);
    const email = String(entry[cfg.emailField] ?? "");

    if (!email) {
      ldapLog(`WARN no email found for username=${username} using field=${cfg.emailField}`);
    }

    ldapLog(`authentication success username=${username} name=${name} email=${email}`);
    return { success: true, user: { username, name, email } };
  } catch (err) {
    ldapError(`unexpected error during authentication for username=${username}`, err);
    return { success: false, message: "LDAP authentication error" };
  } finally {
    try { await client.unbind(); } catch {}
  }
}
