import { t as tNewUi } from "@/i18n";
export const GITHUB_PRIVATE_KEY_FILE_MAX_BYTES = 64 * 1024;

export function createGitHubPrivateKeyReadGuard() {
  let revision = 0;
  return {
    start() {
      revision += 1;
      return revision;
    },
    invalidate() {
      revision += 1;
    },
    isCurrent(candidate: number) {
      return candidate === revision;
    },
  };
}

export async function readGitHubPrivateKeyFile(
  file: Pick<File, "size" | "text">,
): Promise<string> {
  if (file.size === 0) {
    throw new Error(
      tNewUi("newUi.k81db729956a8"),
    );
  }
  if (file.size > GITHUB_PRIVATE_KEY_FILE_MAX_BYTES) {
    throw new Error(
      tNewUi("newUi.k909e61bc9b5d"),
    );
  }

  let value: string;
  try {
    value = await file.text();
  } catch {
    throw new Error(
      tNewUi("newUi.kf8fe4915aff5"),
    );
  }
  if (!value.trim()) {
    throw new Error(
      tNewUi("newUi.k81db729956a8"),
    );
  }
  return value;
}
