import { h } from "preact";

import type { ProjectDto, SessionDto } from "./remote-web-api.js";

export function HomeView(props: {
  readonly projects: readonly ProjectDto[];
  readonly recentSessions: readonly SessionDto[];
  readonly labels: HomeLabels;
  readonly onOpenProject: (project: ProjectDto) => void;
  readonly onOpenSession: (session: SessionDto) => void;
}) {
  return (
    <div class="home-menu">
      <ProjectList projects={props.projects} labels={props.labels} onOpenProject={props.onOpenProject} />
      <Section title={props.labels.recentThreads} empty={props.labels.noRecentThreads}>
        {props.recentSessions.map((session) => (
          <ThreadRow key={session.id} session={session} onOpenSession={props.onOpenSession} />
        ))}
      </Section>
    </div>
  );
}

export function ProjectView(props: {
  readonly project: ProjectDto;
  readonly sessions: readonly SessionDto[];
  readonly labels: HomeLabels;
  readonly onDeleteSession: (session: SessionDto) => void;
  readonly onNewThread: () => void;
  readonly onOpenSession: (session: SessionDto) => void;
}) {
  const projectSessions = props.sessions.filter((session) => session.directory === props.project.path);
  return (
    <div class="project-menu">
      <section class="section">
        <h2 class="section-title">{props.project.name}</h2>
        <button class="primary-action" type="button" onClick={props.onNewThread}>{props.labels.newThread}</button>
      </section>
      <Section title={props.labels.threads} empty={props.labels.noSessions}>
        {projectSessions.map((session) => (
          <div class="row-action" key={session.id}>
            <button class="row row-open" type="button" onClick={() => props.onOpenSession(session)}>
              <span class="row-main">{session.name ?? session.summary ?? session.id}</span>
              <span class="row-meta">{formatAge(session.updatedAt)}</span>
            </button>
            <button class="delete-row" type="button" aria-label={`Delete ${session.name ?? session.summary ?? session.id}`} onClick={() => props.onDeleteSession(session)}>
              {props.labels.deleteSession}
            </button>
          </div>
        ))}
      </Section>
    </div>
  );
}

export type HomeLabels = {
  readonly deleteSession: string;
  readonly newThread: string;
  readonly noProjects: string;
  readonly noRecentThreads: string;
  readonly noSessions: string;
  readonly projects: string;
  readonly recentThreads: string;
  readonly threads: string;
};

function ProjectList(props: {
  readonly projects: readonly ProjectDto[];
  readonly labels: HomeLabels;
  readonly onOpenProject: (project: ProjectDto) => void;
}) {
  return (
    <Section title={props.labels.projects} empty={props.labels.noProjects}>
      {props.projects.map((project) => (
        <button class="row" type="button" key={project.id} title={project.path} onClick={() => props.onOpenProject(project)}>
          <FolderIcon />
          <span class="row-stack">
            <span class="row-main">{project.name}</span>
            <span class="row-sub">{project.path}</span>
          </span>
        </button>
      ))}
    </Section>
  );
}

function ThreadRow(props: { readonly session: SessionDto; readonly onOpenSession: (session: SessionDto) => void }) {
  return (
    <button class="row recent-thread-row" type="button" onClick={() => props.onOpenSession(props.session)}>
      <span class="row-stack">
        <span class="row-main">{sessionTitle(props.session)}</span>
        <span class="row-sub">{props.session.directory ?? props.session.id}</span>
      </span>
      <span class="row-meta">{formatAge(props.session.updatedAt)}</span>
    </button>
  );
}

function Section(props: { readonly title: string; readonly empty: string; readonly children: preact.ComponentChildren }) {
  const children = Array.isArray(props.children) ? props.children : [props.children];
  return (
    <section class="section">
      <h2 class="section-title">{props.title}</h2>
      {children.length > 0 ? props.children : <p class="muted">{props.empty}</p>}
    </section>
  );
}

function sessionTitle(session: SessionDto): string {
  return session.name ?? session.summary ?? session.id;
}

function FolderIcon() {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="M3 6.5h7l2 2h9v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 8.5V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v.5" />
    </svg>
  );
}

function formatAge(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  return days === 0 ? "now" : `${days}d`;
}
