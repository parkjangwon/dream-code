import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import type { RemoteModelDto } from "./remote-web-api.js";
import { saveRemoteModel } from "./remote-web-run-ops.js";

export function ModelControl(props: {
  readonly model: RemoteModelDto | undefined;
  readonly onSaved: (model: RemoteModelDto) => void;
  readonly onError: (message: string) => void;
}) {
  const providers = props.model?.providers ?? [];
  const [provider, setProvider] = useState(props.model?.single.provider ?? "");
  const [model, setModel] = useState(props.model?.single.model ?? "");
  const [tier, setTier] = useState(props.model?.single.defaultTier ?? "mid");
  const [saving, setSaving] = useState(false);
  const selectedProvider = useMemo(() => providers.find((entry) => entry.id === provider), [provider, providers]);

  useEffect(() => {
    setProvider(props.model?.single.provider ?? "");
    setModel(props.model?.single.model ?? "");
    setTier(props.model?.single.defaultTier ?? "mid");
  }, [props.model]);

  if (props.model === undefined) {
    return null;
  }

  return (
    <section class="section remote-control-panel">
      <div class="section-head">
        <h2 class="section-title">Model Control</h2>
        <span class="row-meta">{props.model.mode}</span>
      </div>
      <div class="control-grid">
        <label>
          <span>Provider</span>
          <select value={provider} onChange={(event) => {
            const nextProvider = event.currentTarget.value;
            const nextModels = providers.find((entry) => entry.id === nextProvider)?.models ?? [];
            setProvider(nextProvider);
            setModel(nextModels[0] ?? "");
          }}>
            {providers.map((entry) => (
              <option value={entry.id} key={entry.id}>{entry.name} · {entry.source}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Model</span>
          <select value={model} onChange={(event) => setModel(event.currentTarget.value)}>
            {(selectedProvider?.models ?? []).map((entry) => <option value={entry} key={entry}>{entry}</option>)}
          </select>
        </label>
        <label>
          <span>Tier</span>
          <select value={tier} onChange={(event) => setTier(modelTier(event.currentTarget.value))}>
            <option value="low">low</option>
            <option value="mid">mid</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>
      <button class="primary-action compact-action" type="button" disabled={saving || provider.length === 0 || model.length === 0} onClick={() => {
        setSaving(true);
        saveRemoteModel(provider, model, tier)
          .then(props.onSaved)
          .catch((error: unknown) => props.onError(error instanceof Error ? error.message : "Model update failed."))
          .finally(() => setSaving(false));
      }}>
        {saving ? "Saving..." : "Use Model"}
      </button>
    </section>
  );
}

function modelTier(value: string): "low" | "mid" | "high" {
  switch (value) {
    case "low":
    case "mid":
    case "high":
      return value;
    default:
      return "mid";
  }
}
