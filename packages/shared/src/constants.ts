export const API_VERSION = "v1" as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;

/** Fixed, user-approved visible Google Drive root folder name (exact spelling). */
export const DRIVE_ROOT_FOLDER_NAME = "Habbits" as const;

/** Least-privilege Drive scope validated under the Drive-first architecture. */
export const DRIVE_LEAST_PRIVILEGE_SCOPE = "https://www.googleapis.com/auth/drive.file" as const;
