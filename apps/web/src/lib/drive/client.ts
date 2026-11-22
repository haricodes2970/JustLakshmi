import {
  CURRENT_DRIVE_SCHEMA_VERSION,
  DRIVE_ROOT_FOLDER_NAME,
  DriveManifestSchema,
  type DriveManifest,
} from "@justlakshmi/shared";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MANIFEST_NAME = "manifest.json";

export type DriveErrorCode =
  | "REAUTH_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_FOLDER"
  | "CONFLICT"
  | "CHECKSUM_MISMATCH"
  | "SCHEMA_UNSUPPORTED"
  | "RETRYABLE"
  | "UNKNOWN";

export class DriveApiError extends Error {
  readonly code: DriveErrorCode;
  readonly status: number;

  constructor(code: DriveErrorCode, status: number, message: string) {
    super(message);
    this.name = "DriveApiError";
    this.code = code;
    this.status = status;
  }
}

export async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Migrates older Drive manifest schema versions cleanly to CURRENT_DRIVE_SCHEMA_VERSION.
 * Rejects unknown future schema versions so older clients never corrupt newer Drive workspaces.
 */
export function migrateDriveManifest(raw: unknown, fallbackFolderId?: string): DriveManifest {
  if (!raw || typeof raw !== "object") {
    throw new DriveApiError("UNKNOWN", 422, "Drive manifest is not a valid JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const rawVersion = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0;

  if (rawVersion > CURRENT_DRIVE_SCHEMA_VERSION) {
    throw new DriveApiError(
      "SCHEMA_UNSUPPORTED",
      422,
      `Drive workspace schema v${rawVersion} is newer than this app supports (v${CURRENT_DRIVE_SCHEMA_VERSION}). Update the app before syncing.`,
    );
  }

  // Upgrade v0 / legacy manifests cleanly to v1.
  const normalized = {
    schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
    folderName: obj.folderName ?? DRIVE_ROOT_FOLDER_NAME,
    folderId: typeof obj.folderId === "string" && obj.folderId.length > 0 ? obj.folderId : (fallbackFolderId ?? ""),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
    files: Array.isArray(obj.files) ? obj.files : [],
  };

  return DriveManifestSchema.parse(normalized);
}

async function classifyResponseError(res: Response, fallback: string): Promise<DriveApiError> {
  if (res.status === 412) {
    return new DriveApiError(
      "CONFLICT",
      412,
      "Google Drive manifest was modified concurrently by another device. Please retry sync to merge.",
    );
  }
  if (res.status === 401) {
    return new DriveApiError("REAUTH_REQUIRED", 401, "Google Drive authorization expired. Please reconnect Drive.");
  }
  if (res.status === 403) {
    const bodyText = await res.text().catch(() => "");
    if (/rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quota/i.test(bodyText)) {
      return new DriveApiError("RETRYABLE", 403, "Google Drive quota/rate limit reached. Local changes remain queued.");
    }
    return new DriveApiError("REAUTH_REQUIRED", 403, "Google Drive access was revoked or insufficient. Please reconnect Drive.");
  }
  if (res.status === 404) {
    return new DriveApiError("NOT_FOUND", 404, "The Habbits folder or file could not be found in Google Drive.");
  }
  if (res.status === 429 || res.status >= 500) {
    return new DriveApiError("RETRYABLE", res.status, "Google Drive is temporarily unavailable. Local changes remain queued.");
  }
  return new DriveApiError("UNKNOWN", res.status, fallback);
}

async function driveFetch(token: string, url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw await classifyResponseError(res, `Google Drive request failed (${res.status}).`);
  }
  return res;
}

export async function getFileRevisionMeta(
  token: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; modifiedTime?: string; headRevisionId?: string; etag?: string }> {
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,modifiedTime,headRevisionId`,
    {},
    fetchImpl,
  );
  const etag = res.headers.get("etag") ?? undefined;
  const data = (await res.json()) as { id: string; modifiedTime?: string; headRevisionId?: string };
  return { ...data, etag };
}

/** Downloads a JSON file, optionally verifying its SHA-256 checksum before parsing. */
export async function readJsonFile<T = unknown>(
  token: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
  expectedSha256?: string,
): Promise<{ data: T; etag?: string; checksumSha256: string }> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, fetchImpl);
  const rawText = await res.text();
  const checksumSha256 = await sha256Hex(rawText);
  if (expectedSha256 && checksumSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new DriveApiError(
      "CHECKSUM_MISMATCH",
      422,
      `Checksum mismatch for Drive file ${fileId}. Aborting sync to protect local data.`,
    );
  }
  return {
    data: JSON.parse(rawText) as T,
    etag: res.headers.get("etag") ?? undefined,
    checksumSha256,
  };
}

export type UpsertJsonOptions = {
  existingFileId?: string;
  ifMatchEtag?: string;
  expectedHeadRevisionId?: string;
};

export async function upsertJsonFile(
  token: string,
  folderId: string,
  fileName: string,
  payload: unknown,
  options: UpsertJsonOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ fileId: string; modifiedTime: string; checksumSha256: string; headRevisionId?: string; etag?: string }> {
  const serialized = JSON.stringify(payload, null, 2);
  const checksumSha256 = await sha256Hex(serialized);

  if (options.existingFileId) {
    // Verify headRevisionId precondition before overwriting when supplied.
    if (options.expectedHeadRevisionId) {
      const currentMeta = await getFileRevisionMeta(token, options.existingFileId, fetchImpl);
      if (currentMeta.headRevisionId && currentMeta.headRevisionId !== options.expectedHeadRevisionId) {
        throw new DriveApiError(
          "CONFLICT",
          412,
          "Remote Drive file revision changed concurrently by another device.",
        );
      }
    }

    const headers: Record<string, string> = { "Content-Type": "application/json; charset=UTF-8" };
    if (options.ifMatchEtag) {
      headers["If-Match"] = options.ifMatchEtag;
    }

    const res = await driveFetch(
      token,
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(options.existingFileId)}?uploadType=media&fields=id,modifiedTime,headRevisionId`,
      {
        method: "PATCH",
        headers,
        body: serialized,
      },
      fetchImpl,
    );
    const data = (await res.json()) as { id: string; modifiedTime?: string; headRevisionId?: string };
    return {
      fileId: data.id,
      modifiedTime: data.modifiedTime ?? new Date().toISOString(),
      checksumSha256,
      headRevisionId: data.headRevisionId,
      etag: res.headers.get("etag") ?? undefined,
    };
  }

  const boundary = `jl_${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: "application/json",
    parents: [folderId],
  });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    serialized,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime,headRevisionId`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    fetchImpl,
  );
  const data = (await res.json()) as { id: string; modifiedTime?: string; headRevisionId?: string };
  return {
    fileId: data.id,
    modifiedTime: data.modifiedTime ?? new Date().toISOString(),
    checksumSha256,
    headRevisionId: data.headRevisionId,
    etag: res.headers.get("etag") ?? undefined,
  };
}

export type VerifiedDriveWorkspace = {
  folderId: string;
  manifestFileId: string;
  verifiedAt: string;
  manifest: DriveManifest;
  manifestEtag?: string;
};

/** Creates a new visible `Habbits` folder in My Drive and initializes `manifest.json`. */
export async function createHabbitsFolder(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedDriveWorkspace> {
  const folderRes = await driveFetch(
    token,
    `${DRIVE_API}/files?fields=id,name,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: DRIVE_ROOT_FOLDER_NAME, mimeType: FOLDER_MIME }),
    },
    fetchImpl,
  );
  const folder = (await folderRes.json()) as { id: string; name: string };
  const now = new Date().toISOString();
  const manifest: DriveManifest = DriveManifestSchema.parse({
    schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
    folderName: DRIVE_ROOT_FOLDER_NAME,
    folderId: folder.id,
    updatedAt: now,
    files: [],
  });
  const uploaded = await upsertJsonFile(token, folder.id, MANIFEST_NAME, manifest, {}, fetchImpl);
  return {
    folderId: folder.id,
    manifestFileId: uploaded.fileId,
    verifiedAt: now,
    manifest,
    manifestEtag: uploaded.etag,
  };
}

/**
 * Verifies ownership/access to a selected `Habbits` folder and locates or initializes `manifest.json`.
 */
export async function verifyHabbitsFolder(
  token: string,
  folderId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedDriveWorkspace> {
  const metaRes = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`,
    {},
    fetchImpl,
  );
  const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string; trashed?: boolean };

  if (meta.trashed || meta.mimeType !== FOLDER_MIME || meta.name !== DRIVE_ROOT_FOLDER_NAME) {
    throw new DriveApiError(
      "INVALID_FOLDER",
      400,
      `Selected item must be an active Google Drive folder named exactly "${DRIVE_ROOT_FOLDER_NAME}".`,
    );
  }

  const q = encodeURIComponent(`'${folderId}' in parents and name = '${MANIFEST_NAME}' and trashed = false`);
  const listRes = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)`, {}, fetchImpl);
  const listed = (await listRes.json()) as { files?: Array<{ id: string }> };
  const now = new Date().toISOString();

  const existingManifestId = listed.files?.[0]?.id;
  if (existingManifestId) {
    const { data: raw, etag } = await readJsonFile(token, existingManifestId, fetchImpl);
    const manifest = migrateDriveManifest(raw, meta.id);
    return {
      folderId: meta.id,
      manifestFileId: existingManifestId,
      verifiedAt: now,
      manifest,
      manifestEtag: etag,
    };
  }

  const manifest: DriveManifest = DriveManifestSchema.parse({
    schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
    folderName: DRIVE_ROOT_FOLDER_NAME,
    folderId: meta.id,
    updatedAt: now,
    files: [],
  });
  const uploaded = await upsertJsonFile(token, meta.id, MANIFEST_NAME, manifest, {}, fetchImpl);
  return {
    folderId: meta.id,
    manifestFileId: uploaded.fileId,
    verifiedAt: now,
    manifest,
    manifestEtag: uploaded.etag,
  };
}
