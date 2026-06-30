export type InitialRemoteRoute =
  | { readonly kind: "none" }
  | { readonly kind: "threadProject"; readonly projectId: string };

export function initialRemoteRouteFromHash(hash: string): InitialRemoteRoute {
  const match = /^#\/thread\/([^/?#]+)/u.exec(hash);
  const encodedProjectId = match?.[1];
  if (encodedProjectId === undefined || encodedProjectId.length === 0) {
    return { kind: "none" };
  }
  return { kind: "threadProject", projectId: safeDecodeURIComponent(encodedProjectId) };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) {
      return value;
    }
    throw error;
  }
}
