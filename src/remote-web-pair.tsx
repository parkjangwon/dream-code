import { h } from "preact";
import { useState } from "preact/hooks";

import { requestJson, type PairResponse } from "./remote-web-api.js";

export function PairPanel(props: {
  readonly onPaired: () => void;
  readonly labels: {
    readonly connect: string;
    readonly deviceName: string;
    readonly pairDevice: string;
    readonly pairingCode: string;
  };
}) {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("Phone");
  const [error, setError] = useState("");
  return (
    <section class="section">
      <h2 class="section-title">{props.labels.pairDevice}</h2>
      <form class="pair-form" onSubmit={(event) => {
        event.preventDefault();
        requestJson<PairResponse>("POST", "/api/pair", { code, deviceName }).then(() => {
          props.onPaired();
        }).catch((pairError: unknown) => {
          setError(pairError instanceof Error ? pairError.message : "Pairing failed.");
        });
      }}>
        <input value={code} inputMode="numeric" autoComplete="one-time-code" placeholder={props.labels.pairingCode} onInput={(event) => setCode(event.currentTarget.value)} />
        <input value={deviceName} placeholder={props.labels.deviceName} onInput={(event) => setDeviceName(event.currentTarget.value)} />
        <button type="submit">{props.labels.connect}</button>
        {error.length > 0 ? <p class="muted">{error}</p> : null}
      </form>
    </section>
  );
}
