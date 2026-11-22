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

export type DriveErrorCode = "REAUTH_REQUIRED" | "NOT_FOUND" | "INVALID_FOLDER" | "RETRYABLE" | "UNKNOWN";

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

function classifyStatus(status: number, fallback: string): DriveApiError {
  if (status === 401 || status === 403) {
    return new DriveApiError("REAUTH_REQUIRED", status, "Google Drive authorization expired or was revoked. Please reconnect.");
  }
  if (status === 404) {
    return new DriveApiError("NOT_FOUND", status, "The Habbits folder or file could not be found in Google Drive.");
  }
  if (status === 429 || status >= 500) {
    return new DriveApiError("RETRYABLE", status, "Google Drive is temporarily unavailable. Local changes remain queued.");
  }
  return new DriveApiError("UNKNOWN", status, fallback);
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
    throw classifyStatus(res.status, `Google Drive request failed (${res.status}).`);
  }
  return res;
}

export async function readJsonFile<T = unknown>(
  token: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, fetchImpl);
  return (await res.json()) as T;
}

export async function upsertJsonFile(
  token: string,
  folderId: string,
  fileName: string,
  payload: unknown,
  existingFileId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ fileId: string; modifiedTime: string; checksumSha256: string }> {
  const serialized = JSON.stringify(payload, null, 2);
  const checksumSha256 = await sha256Hex(serialized);

  if (existingFileId) {
    const res = await driveFetch(
      token,
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(existingFileId)}?uploadType=media&fields=id,modifiedTime`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: serialized,
      },
      fetchImpl,
    );
    const data = (await res.json()) as { id: string; modifiedTime?: string };
    return {
      fileId: data.id,
      modifiedTime: data.modifiedTime ?? new Date().toISOString(),
      checksumSha256,
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
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    fetchImpl,
  );
  const data = (await res.json()) as { id: string; modifiedTime?: string };
  return {
    fileId: data.id,
    modifiedTime: data.modifiedTime ?? new Date().toISOString(),
    checksumSha256,
  };
}

export type VerifiedDriveWorkspace = {
  folderId: string;
  manifestFileId: string;
  verifiedAt: string;
  manifest: DriveManifest;
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
  const uploaded = await upsertJsonFile(token, folder.id, MANIFEST_NAME, manifest, undefined, fetchImpl);
  return {
    folderId: folder.id,
    manifestFileId: uploaded.fileId,
    verifiedAt: now,
    manifest,
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
    const raw = await readJsonFile(token, existingManifestId, fetchImpl);
    const manifest = DriveManifestSchema.parse(raw);
    return {
      folderId: meta.id,
      manifestFileId: existingManifestId,
      verifiedAt: now,
      manifest,
    };
  }

  const manifest: DriveManifest = DriveManifestSchema.parse({
    schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
    folderName: DRIVE_ROOT_FOLDER_NAME,
    folderId: meta.id,
    updatedAt: now,
    files: [],
  });
  const uploaded = await upsertJsonFile(token, meta.id, MANIFEST_NAME, manifest, undefined, fetchImpl);
  return {
    folderId: meta.id,
    manifestFileId: uploaded.fileId,
    verifiedAt: now,
    manifest,
  };
}
