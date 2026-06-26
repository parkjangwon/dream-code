export const remoteStrings = {
  en: {
    askDreamCode: "Ask Dream Code",
    back: "Back",
    checkingConnection: "Checking connection...",
    connect: "Connect",
    deleteSession: "Delete",
    deviceName: "Device name",
    logoutDevice: "Logout",
    newThread: "New Thread",
    noProjects: "No projects yet.",
    noRecentThreads: "No recent threads yet.",
    noSessions: "No sessions yet.",
    paired: "Paired",
    pairDevice: "Pair this device",
    pairingCode: "Pairing code",
    projects: "Projects",
    recentThreads: "Recent Threads",
    remote: "Dream Code Remote",
    threads: "Threads",
    thread: "Thread",
  },
} as const;

export const remoteLabels = remoteStrings.en;
export const pairedStorageKey = "dream.remote.paired";

export type RemoteLabels = typeof remoteLabels;
