import type { ChatMessage, MemoryInfo, Provider } from "../types";
import { toolLabel } from "../tools";

export const ANGER_NAMES = [
  "Sippin' sweet tea",
  "Mildly bothered",
  "Grumblin'",
  "Grumpy",
  "Suspicious",
  "Gettin' riled",
  "Hit the road, dude",
  "Callin' Trey",
  "LOCK 'EM UP",
  "Fit to be tied",
  "Total meltdown",
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  providers: Provider[] | null;
  providerError: string | null;
  provider: string;
  onProvider: (id: string) => void;
  temperature: number;
  onTemperature: (n: number) => void;
  anger: number;
  onAnger: (n: number) => void;
  maxMessages: number;
  onMaxMessages: (n: number) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
  voiceAvailable: boolean;
  speakAloud: boolean;
  onSpeakAloud: (v: boolean) => void;
  memory: MemoryInfo | null;
  messages: ChatMessage[];
  onExport: () => void;
  onClear: () => void;
  busy: boolean;
}

function TackleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="3" y="9" width="18" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 14h18" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Collapsible sidebar: model, grandpa's mood, memory window, voice, logs and actions. */
export function TackleBox(p: Props) {
  const allTools = p.messages.flatMap((m) => m.tools ?? []);
  const trespassers = allTools
    .filter((t) => t.name === "call_trey_taylor")
    .map((t) => `${t.args.first_name ?? ""} ${t.args.last_name ?? ""}`.trim())
    .filter((n, i, all) => n && all.indexOf(n) === i);
  const catches = Object.entries(
    allTools.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.name]: (acc[t.name] ?? 0) + 1 }), {}),
  );
  const memPct = p.memory ? Math.round((p.memory.kept / Math.max(1, p.memory.total)) * 100) : 0;

  return (
    <aside className="tackle" data-collapsed={p.collapsed}>
      <div className="tackle-head">
        {!p.collapsed && <h2 className="tackle-title">Tackle box</h2>}
        <button
          type="button"
          className="tackle-toggle"
          onClick={p.onToggle}
          aria-expanded={!p.collapsed}
          aria-controls="tackle-body"
          title={p.collapsed ? "Open tackle box" : "Close tackle box"}
        >
          <TackleIcon />
          <span className="sr-only">{p.collapsed ? "Open tackle box" : "Close tackle box"}</span>
        </button>
      </div>

      {!p.collapsed && (
        <div id="tackle-body" className="tackle-body">
          <section className="tray">
            <h3>Who's answerin'</h3>
            {p.providerError && <p className="tray-note warn">{p.providerError}</p>}
            <div className="providers" role="radiogroup" aria-label="Model provider">
              {(p.providers ?? []).map((pr) => (
                <label key={pr.id} className="provider" data-available={pr.available}>
                  <input
                    type="radio"
                    name="provider"
                    value={pr.id}
                    checked={p.provider === pr.id}
                    onChange={() => p.onProvider(pr.id)}
                    disabled={p.busy}
                  />
                  <span className="provider-dot" aria-hidden />
                  <span className="provider-name">{pr.label}</span>
                  <span className="provider-model">{pr.available ? pr.model : "no key / offline"}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="tray">
            <h3>Grandpa's mood</h3>
            <label className="slider" htmlFor="anger">
              <span>grandpas_anger</span>
              <output>{p.anger}/10</output>
            </label>
            <input
              id="anger"
              className="anger-range"
              type="range"
              min={0}
              max={10}
              step={1}
              value={p.anger}
              onChange={(e) => p.onAnger(Number(e.target.value))}
              style={{ ["--anger" as string]: p.anger / 10 }}
            />
            <p className="anger-name" data-level={p.anger}>
              {ANGER_NAMES[p.anger]}
            </p>
            <label className="slider" htmlFor="temperature">
              <span>Temperature</span>
              <output>{p.temperature.toFixed(1)}</output>
            </label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={p.temperature}
              onChange={(e) => p.onTemperature(Number(e.target.value))}
            />
            <p className="tray-note">Low keeps him predictable, high makes him ramble. OpenAI gpt-5 models ignore it.</p>
          </section>

          <section className="tray">
            <h3>Grandpa's memory</h3>
            <label className="slider" htmlFor="max-messages">
              <span>Last messages</span>
              <output>{p.maxMessages}</output>
            </label>
            <input
              id="max-messages"
              type="range"
              min={2}
              max={30}
              step={1}
              value={p.maxMessages}
              onChange={(e) => p.onMaxMessages(Number(e.target.value))}
            />
            <label className="slider" htmlFor="max-chars">
              <span>Character limit</span>
              <output>{p.maxChars.toLocaleString("en")}</output>
            </label>
            <input
              id="max-chars"
              type="range"
              min={300}
              max={8000}
              step={100}
              value={p.maxChars}
              onChange={(e) => p.onMaxChars(Number(e.target.value))}
            />
            <div className="gauge" aria-label="Messages Grandpa remembers">
              <div className="gauge-fill" style={{ width: `${memPct}%` }} />
            </div>
            <p className="tray-note">
              {p.memory
                ? `Last reply saw ${p.memory.kept} of ${p.memory.total} messages (${p.memory.chars.toLocaleString("en")} chars).`
                : "Send a message to see how much Grandpa remembers."}
            </p>
          </section>

          <section className="tray">
            <h3>Grandpa's voice</h3>
            <label className="switch">
              <input
                type="checkbox"
                checked={p.speakAloud && p.voiceAvailable}
                disabled={!p.voiceAvailable}
                onChange={(e) => p.onSpeakAloud(e.target.checked)}
              />
              <span>Read every reply out loud</span>
            </label>
            {!p.voiceAvailable && (
              <p className="tray-note">Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to backend/.env to hear him.</p>
            )}
          </section>

          <section className="tray">
            <h3>Trespasser log</h3>
            {trespassers.length ? (
              <ul className="log">
                {trespassers.map((n) => (
                  <li key={n}>
                    <span>{n}</span>
                    <span className="stamp">Denied</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tray-note">Nobody reported to Trey yet. Tell Grandpa yer full name.</p>
            )}
          </section>

          <section className="tray">
            <h3>Catch log</h3>
            {catches.length ? (
              <ul className="log">
                {catches.map(([name, count]) => (
                  <li key={name}>
                    <span>{toolLabel(name)}</span>
                    <span className="count">×{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tray-note">No tools used yet.</p>
            )}
          </section>

          <section className="tray tray-actions">
            <button type="button" onClick={p.onExport} disabled={p.messages.length < 2}>
              Download conversation
            </button>
            <button type="button" className="ghost" onClick={p.onClear} disabled={p.busy}>
              Start over
            </button>
          </section>
        </div>
      )}
    </aside>
  );
}
