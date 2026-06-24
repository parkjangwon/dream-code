export type PendingUpload = {
  readonly id: string;
  readonly file: File;
};

export type PendingUploadPayload = {
  readonly dataBase64: string;
  readonly name: string;
  readonly type: string;
};

export async function pendingUploadPayloads(pending: readonly PendingUpload[]): Promise<readonly PendingUploadPayload[]> {
  return Promise.all(pending.map(async (upload) => ({
    dataBase64: await readFileBase64(upload.file),
    name: upload.file.name,
    type: upload.file.type,
  })));
}

export function pendingUploadsFromFiles(files: FileList): readonly PendingUpload[] {
  return Array.from(files).map((file, index) => ({
    file,
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
  }));
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
