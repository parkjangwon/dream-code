import { appendRemoteAuditEvent, readRemoteAuditEvents } from "./remote-audit.js";
import { listRemoteDevices, revokeRemoteDevice } from "./remote-auth.js";

export async function formatRemoteAudit(root: string, json: boolean): Promise<string> {
  const events = await readRemoteAuditEvents(root);
  const devices = await listRemoteDevices(root);
  if (json) {
    return `${JSON.stringify({ devices, events }, undefined, 2)}\n`;
  }
  if (devices.length === 0 && events.length === 0) {
    return "No remote devices or audit events recorded.\n";
  }
  const deviceLines = devices.map((device) => `device ${device.id} ${device.name} ${device.role}`);
  const eventLines = events.map((event) => `${event.at} ${event.kind} ${event.path ?? ""} ${event.status ?? ""}`.trim());
  return `${[...deviceLines, ...eventLines].join("\n")}\n`;
}

export async function revokeRemoteDeviceById(root: string, deviceId: string, json: boolean): Promise<string> {
  const revoked = await revokeRemoteDevice(root, deviceId);
  if (revoked) {
    await appendRemoteAuditEvent(root, { kind: "device_revoked", deviceId, status: 200 });
  }
  const devices = await listRemoteDevices(root);
  if (json) {
    return `${JSON.stringify({ revoked, devices }, undefined, 2)}\n`;
  }
  return revoked ? `Revoked ${deviceId}.\n` : `Device not found: ${deviceId}\n`;
}
