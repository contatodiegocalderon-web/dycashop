import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { google } from "googleapis";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;

function normalizePrivateKey(key: string): string {
  if (key.includes("\\n")) {
    return key.replace(/\\n/g, "\n");
  }
  return key;
}

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) {
    return s.slice(1);
  }
  return s;
}

function normalizeJsonText(s: string): string {
  return stripBom(s.trim())
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function unwrapEnvJsonString(s: string): string {
  const t = normalizeJsonText(s);
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    try {
      const inner = JSON.parse(t);
      if (typeof inner === "string") {
        return inner;
      }
    } catch {
      // continua
    }
  }
  return t;
}

/**
 * Tenta localizar ficheiro: absoluto, relativo à raiz do projeto, ou pasta acima (ex.: ../key/x.json).
 */
export function resolveCredentialFilePath(p: string): string | null {
  const t = path.normalize(p.trim());
  if (!t) return null;
  const candidates = [
    t,
    path.join(process.cwd(), t),
    path.join(process.cwd(), "..", t),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const st = statSync(c);
      if (st.isFile()) {
        return c;
      }
    }
  }
  return null;
}

function readCredentialsFile(resolvedPath: string): string {
  const st = statSync(resolvedPath);
  if (st.isDirectory()) {
    throw new Error(
      `O caminho aponta para uma PASTA, não para o ficheiro .json. Ex.: ...\\key\\minha-conta-servico.json (defina GOOGLE_SERVICE_ACCOUNT_JSON_PATH com o ficheiro completo).`
    );
  }
  return readFileSync(resolvedPath, "utf8");
}

function loadRawServiceAccountJson(): string {
  const pathCustom = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  const pathGoogle = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  for (const p of [pathCustom, pathGoogle]) {
    if (!p) continue;
    const resolved = resolveCredentialFilePath(p);
    if (resolved) {
      return readCredentialsFile(resolved);
    }
  }

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 inválido (não é Base64 válido)."
      );
    }
  }

  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!inline) {
    throw new Error(
      "Credenciais Google em falta: defina GOOGLE_SERVICE_ACCOUNT_JSON (JSON), GOOGLE_SERVICE_ACCOUNT_JSON_PATH (caminho do .json), GOOGLE_APPLICATION_CREDENTIALS, ou GOOGLE_SERVICE_ACCOUNT_JSON_BASE64."
    );
  }

  if (!inline.startsWith("{")) {
    const resolved = resolveCredentialFilePath(inline);
    if (resolved) {
      return readCredentialsFile(resolved);
    }
    if (existsSync(path.normalize(inline))) {
      const st = statSync(inline);
      if (st.isDirectory()) {
        throw new Error(
          `GOOGLE_SERVICE_ACCOUNT_JSON parece ser uma pasta ("${inline}"). Use o caminho completo até ao ficheiro .json ou use a variável GOOGLE_SERVICE_ACCOUNT_JSON_PATH=...\\ficheiro.json`
        );
      }
    }
  }

  return inline;
}

function assertServiceAccountJson(
  parsed: Record<string, unknown>
): asserts parsed is {
  type: "service_account";
  client_email: string;
  private_key: string;
} {
  if ("installed" in parsed || "web" in parsed) {
    throw new Error(
      "Este ficheiro é de credencial OAuth (cliente de aplicação), não de conta de serviço. Crie uma conta de serviço: Google Cloud → IAM e administrador → Contas de serviço → Criar → Chaves → JSON. Partilhe a pasta do Drive com o e-mail da conta (xxx@xxx.iam.gserviceaccount.com)."
    );
  }
  if (parsed.type !== "service_account") {
    throw new Error(
      `Tipo de credencial inválido (esperado type: service_account, recebido: ${String(
        parsed.type ?? "—"
      )}). Não use o JSON de 'ID do cliente OAuth'.`
    );
  }
  if (
    typeof parsed.client_email !== "string" ||
    typeof parsed.private_key !== "string"
  ) {
    throw new Error(
      "JSON de conta de serviço incompleto: faltam client_email ou private_key."
    );
  }
}

function parseServiceAccount(
  raw: string
): { client_email: string; private_key: string } {
  const unwrapped = unwrapEnvJsonString(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(unwrapped) as Record<string, unknown>;
  } catch {
    try {
      parsed = JSON.parse(normalizeJsonText(unwrapped)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new Error(
        "O ficheiro não é JSON válido. Use o .json descarregado da Google (conta de serviço), sem editar."
      );
    }
  }
  assertServiceAccountJson(parsed);
  const privateKey = normalizePrivateKey(parsed.private_key);
  return { client_email: parsed.client_email, private_key: privateKey };
}

/** JWT da conta de serviço — apenas em servidor. */
export function getDriveJwtAuth() {
  const raw = loadRawServiceAccountJson();
  const { client_email, private_key } = parseServiceAccount(raw);
  return new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: [...DRIVE_SCOPES],
  });
}

/** E-mail xxx@....iam.gserviceaccount.com (para diagnóstico / health check). */
export function getServiceAccountEmail(): string {
  const raw = loadRawServiceAccountJson();
  return parseServiceAccount(raw).client_email;
}
