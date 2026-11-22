/**
 * Google Picker integration for selecting an existing visible `Habbits` folder
 * under the least-privilege `drive.file` scope.
 */

type PickerDoc = { id: string; name: string; mimeType?: string };
type PickerCallbackData = { action: string; docs?: PickerDoc[] };

type GapiGlobal = {
  load: (api: string, callback: () => void) => void;
};

type GooglePickerGlobal = {
  picker?: {
    ViewId: { FOLDERS: string };
    Action: { PICKED: string; CANCEL: string };
    DocsView: new (viewId: string) => {
      setIncludeFolders: (v: boolean) => unknown;
      setSelectFolderEnabled: (v: boolean) => unknown;
      setQuery: (q: string) => unknown;
    };
    PickerBuilder: new () => {
      setOAuthToken: (token: string) => unknown;
      setDeveloperKey: (key: string) => unknown;
      setTitle: (title: string) => unknown;
      addView: (view: unknown) => unknown;
      setCallback: (cb: (data: PickerCallbackData) => void) => unknown;
      build: () => { setVisible: (visible: boolean) => void };
    };
  };
};

let pickerLoader: Promise<void> | null = null;

function loadPickerApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser environment required."));
  const g = (window as unknown as { google?: GooglePickerGlobal }).google;
  if (g?.picker) return Promise.resolve();
  if (pickerLoader) return pickerLoader;

  pickerLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const gapi = (window as unknown as { gapi?: GapiGlobal }).gapi;
      if (!gapi) {
        reject(new Error("Google API loader unavailable."));
        return;
      }
      gapi.load("picker", () => resolve());
    };
    script.onerror = () => reject(new Error("Failed to load Google Picker script."));
    document.head.appendChild(script);
  });
  return pickerLoader;
}

export function getGooglePickerApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim();
  return key || null;
}

export async function pickExistingHabbitsFolder(accessToken: string): Promise<{ folderId: string; name: string } | null> {
  const developerKey = getGooglePickerApiKey();
  if (!developerKey) {
    throw new Error("Google Picker API key is not configured (NEXT_PUBLIC_GOOGLE_PICKER_API_KEY).");
  }

  await loadPickerApi();
  const pickerNs = (window as unknown as { google?: GooglePickerGlobal }).google?.picker;
  if (!pickerNs) throw new Error("Google Picker failed to initialize.");

  return new Promise((resolve, reject) => {
    const view = new pickerNs.DocsView(pickerNs.ViewId.FOLDERS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(true);
    view.setQuery("Habbits");

    const builder = new pickerNs.PickerBuilder();
    builder.setOAuthToken(accessToken);
    builder.setDeveloperKey(developerKey);
    builder.setTitle("Select your Habbits folder");
    builder.addView(view);
    builder.setCallback((data) => {
      if (data.action === pickerNs.Action.CANCEL) {
        resolve(null);
        return;
      }
      if (data.action === pickerNs.Action.PICKED) {
        const doc = data.docs?.[0];
        if (!doc) {
          reject(new Error("No folder was selected."));
          return;
        }
        resolve({ folderId: doc.id, name: doc.name });
      }
    });
    builder.build().setVisible(true);
  });
}
