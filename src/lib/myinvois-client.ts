import { decrypt } from "./encrypt";

interface MyInvoisConfig {
  clientId: string;
  clientSecret: string;
  environment: "SANDBOX" | "PRODUCTION";
}

const BASE_URLS = {
  SANDBOX:    "https://preprod.myinvois.hasil.gov.my",
  PRODUCTION: "https://myinvois.hasil.gov.my",
};

interface TokenCache {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCache>();

export async function getAccessToken(config: MyInvoisConfig): Promise<string> {
  const cacheKey = `${config.clientId}:${config.environment}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 30000) return cached.token;

  const base = BASE_URLS[config.environment];
  const res = await fetch(`${base}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     config.clientId,
      client_secret: config.clientSecret,
      grant_type:    "client_credentials",
      scope:         "InvoicingAPI",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MyInvois auth failed: ${err}`);
  }

  const data = await res.json();
  const token = data.access_token as string;
  const expiresIn = (data.expires_in as number) * 1000;
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn });
  return token;
}

export async function submitDocuments(
  config: MyInvoisConfig,
  documents: object[]
): Promise<{
  submissionUID: string;
  acceptedDocuments: { uuid: string; invoiceCodeNumber: string; longId?: string }[];
  rejectedDocuments: { invoiceCodeNumber: string; error: object }[];
}> {
  const base = BASE_URLS[config.environment];
  const token = await getAccessToken(config);

  const res = await fetch(`${base}/api/v1.0/documentsubmissions`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ documents }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error((data as any).error?.message ?? JSON.stringify(data));
  return data;
}

export async function cancelDocument(
  config: MyInvoisConfig,
  uuid: string,
  reason: string
): Promise<{ status: string }> {
  const base = BASE_URLS[config.environment];
  const token = await getAccessToken(config);

  const res = await fetch(`${base}/api/v1.0/documents/state/${uuid}/state`, {
    method: "PUT",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "cancelled", reason }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error((data as any).error?.message ?? JSON.stringify(data));
  return data;
}

export async function getDocumentStatus(
  config: MyInvoisConfig,
  uuid: string
): Promise<{ status: string; longId?: string; validationResults?: object }> {
  const base = BASE_URLS[config.environment];
  const token = await getAccessToken(config);

  const res = await fetch(`${base}/api/v1.0/documents/${uuid}/details`, {
    headers: { "Authorization": `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error((data as any).error?.message ?? JSON.stringify(data));
  return data;
}

export function getEntityConfig(entity: {
  myInvoisClientId?: string | null;
  myInvoisClientSecret?: string | null;
  myInvoisEnvironment?: string | null;
}): MyInvoisConfig {
  const clientId     = entity.myInvoisClientId     ? decrypt(entity.myInvoisClientId)     : "";
  const clientSecret = entity.myInvoisClientSecret ? decrypt(entity.myInvoisClientSecret) : "";
  const environment  = (entity.myInvoisEnvironment ?? "SANDBOX") as "SANDBOX" | "PRODUCTION";
  if (!clientId || !clientSecret) throw new Error("MyInvois credentials not configured for this entity");
  return { clientId, clientSecret, environment };
}

export function getQrUrl(environment: string, uuid: string, longId: string): string {
  const base = environment === "PRODUCTION"
    ? "https://myinvois.hasil.gov.my"
    : "https://preprod.myinvois.hasil.gov.my";
  return `${base}/${uuid}/share/${longId}`;
}
