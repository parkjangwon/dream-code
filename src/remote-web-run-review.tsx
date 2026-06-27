import { h } from "preact";
import { useState } from "preact/hooks";

import type { CommandRecord, RunDto, RunReviewDto } from "./remote-web-api.js";
import { continueRun, loadRunReview, restoreRunChanges } from "./remote-web-run-ops.js";

export function RunReviewSection(props: {
  readonly runs: readonly RunDto[];
  readonly onCommand: (command: CommandRecord) => void;
  readonly onError: (message: string) => void;
}) {
  const [review, setReview] = useState<RunReviewDto | undefined>(undefined);
  const [busyRunId, setBusyRunId] = useState<string | undefined>(undefined);
  const [continuePrompt, setContinuePrompt] = useState("continue from this run and finish the safest next action");
  const recentRuns = props.runs.slice(0, 5);
  return (
    <section class="section run-review-panel">
      <h2 class="section-title">Recent Runs</h2>
      {recentRuns.length === 0 ? <p class="muted">No recent runs yet.</p> : null}
      {recentRuns.map((run) => (
        <div class="run-review-row" key={run.id}>
          <button class="row row-open" type="button" onClick={() => {
            setBusyRunId(run.id);
            loadRunReview(run.id)
              .then(setReview)
              .catch((error: unknown) => props.onError(error instanceof Error ? error.message : "Run review failed."))
              .finally(() => setBusyRunId(undefined));
          }}>
            <span class="row-stack">
              <span class="row-main">{run.prompt ?? run.id}</span>
              <span class="row-sub">{run.status} · {run.changedFiles?.length ?? 0} changed · {run.checkpoints?.length ?? 0} checkpoints</span>
            </span>
            <span class="row-meta">{busyRunId === run.id ? "..." : "Review"}</span>
          </button>
        </div>
      ))}
      {review === undefined ? null : (
        <div class="run-review-detail">
          <div class="section-head">
            <h3>{review.run.status} · {review.run.id}</h3>
            <button type="button" onClick={() => setReview(undefined)}>Close</button>
          </div>
          <pre class="diff-preview">{review.diff}</pre>
          <label class="continue-field">
            <span>Continue prompt</span>
            <textarea value={continuePrompt} onInput={(event) => setContinuePrompt(event.currentTarget.value)} />
          </label>
          <div class="review-actions">
            <button type="button" onClick={() => {
              setBusyRunId(review.run.id);
              restoreRunChanges(review.run.id)
                .then((paths) => props.onError(paths.length === 0 ? "No checkpointed paths to restore." : `Restored ${paths.length} path(s).`))
                .catch((error: unknown) => props.onError(error instanceof Error ? error.message : "Restore failed."))
                .finally(() => setBusyRunId(undefined));
            }}>Restore</button>
            <button type="button" onClick={() => {
              setBusyRunId(review.run.id);
              continueRun(review.run.id, continuePrompt)
                .then(props.onCommand)
                .catch((error: unknown) => props.onError(error instanceof Error ? error.message : "Continue failed."))
                .finally(() => setBusyRunId(undefined));
            }}>Continue</button>
          </div>
        </div>
      )}
    </section>
  );
}
