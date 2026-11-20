import { Fragment, useEffect, useRef, useState } from "react";
import { fetchProviders, fetchSpeech, fetchVoice, streamChat } from "./api";
import type { ChatMessage, MemoryInfo, Provider, StreamEvent } from "./types";
import { Sign } from "./components/Sign";
import { MessageItem } from "./components/MessageItem";
import { TackleBox } from "./components/TackleBox";
import { Composer } from "./components/Composer";

const GREETING: ChatMessage = { id: "greeting", role: "assistant", content: "Who told ya you could feesh here?!" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window etc. - settings just won't persist */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const isShout = (t: string) => /\b[A-Z']{5,}\b/.test(t);

export default function App() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>(() => load("grandpa.provider", "gemini"));
  const [maxMessages, setMaxMessages] = useState<number>(() => load("grandpa.maxMessages", 8));
  const [maxChars, setMaxChars] = useState<number>(() => load("grandpa.maxChars", 4000));
  const [messages, setMessages] = useState<ChatMessage[]>(() => load("grandpa.messages", [GREETING]));
  const [memory, setMemory] = useState<MemoryInfo | null>(() => load("grandpa.memory", null));
  const [temperature, setTemperature] = useState<number>(() => load("grandpa.temperature", 0.7));
  const [anger, setAnger] = useState<number>(() => load("grandpa.anger", 6));
  const [collapsed, setCollapsed] = useState<boolean>(() => load("grandpa.collapsed", false));
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speakAloud, setSpeakAloud] = useState<boolean>(() => load("grandpa.speakAloud", false));
  const [voice, setVoice] = useState<{ id: string; state: "loading" | "playing" } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [jolt, setJolt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    fetchProviders()
      .then((list) => {
        setProviders(list);
        setProviderError(null);
        // first visit: pick the first provider that actually works
        if (!localStorage.getItem("grandpa.provider")) {
          const firstUp = list.find((x) => x.available);
          if (firstUp) setProvider(firstUp.id);
        }
      })
      .catch(() => setProviderError("Can't reach the backend. Start it with: uv run uvicorn server:app --port 8000"));
  }, []);

  useEffect(() => void save("grandpa.provider", provider), [provider]);
  useEffect(() => void save("grandpa.maxMessages", maxMessages), [maxMessages]);
  useEffect(() => void save("grandpa.maxChars", maxChars), [maxChars]);
  useEffect(() => void save("grandpa.memory", memory), [memory]);
  useEffect(() => void save("grandpa.temperature", temperature), [temperature]);
  useEffect(() => void save("grandpa.anger", anger), [anger]);
  useEffect(() => void save("grandpa.collapsed", collapsed), [collapsed]);
  useEffect(() => void save("grandpa.speakAloud", speakAloud), [speakAloud]);
  useEffect(() => {
    fetchVoice()
      .then((v) => setVoiceAvailable(v.available))
      .catch(() => setVoiceAvailable(false));
  }, []);

  function stopVoice() {
    audioRef.current?.pause();
    audioRef.current = null;
    setVoice(null);
  }

  async function speak(id: string, text: string) {
    stopVoice();
    setVoice({ id, state: "loading" });
    try {
      const blob = await fetchSpeech(text, anger);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setVoice((v) => (v?.id === id ? null : v));
      };
      setVoice({ id, state: "playing" });
      await audio.play();
    } catch (err) {
      console.error("TTS failed", err);
      setVoice(null);
    }
  }
  useEffect(() => {
    if (!busy) save("grandpa.messages", messages);
  }, [messages, busy]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function send(text: string) {
    const history = [...messages, { id: uid(), role: "user" as const, content: text }];
    const replyId = uid();
    let streamed = "";
    setMessages([...history, { id: replyId, role: "assistant", content: "", tools: [], pending: true }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const onEvent = (e: StreamEvent) => {
      switch (e.type) {
        case "memory":
          setMemory({ start: e.start, kept: e.kept, total: e.total, chars: e.chars });
          break;
        case "token":
          streamed += e.text;
          patchLast((m) => ({ ...m, content: m.content + e.text }));
          break;
        case "reset":
          streamed = "";
          patchLast((m) => ({ ...m, content: "" }));
          break;
        case "tool_start":
          patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, name: e.name, args: e.args }] }));
          break;
        case "tool_end":
          patchLast((m) => ({
            ...m,
            tools: (m.tools ?? []).map((t) => (t.id === e.id ? { ...t, result: e.result } : t)),
          }));
          break;
        case "done":
          {
            const content = e.text || streamed;
            patchLast((m) => ({ ...m, content, pending: false }));
            if (speakAloud && voiceAvailable && content) void speak(replyId, content);
          }
          if (anger >= 4 && isShout(e.text)) setJolt((j) => j + 1);
          break;
        case "error":
          patchLast((m) => ({ ...m, error: e.message, pending: false }));
          break;
      }
    };

    try {
      await streamChat({
        provider,
        messages: history.map(({ role, content }) => ({ role, content })),
        maxMessages,
        maxChars,
        temperature,
        anger,
        signal: ctrl.signal,
        onEvent,
      });
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patchLast((m) => ({
        ...m,
        pending: false,
        content: aborted ? m.content || "Fine. Git off mah land then." : m.content,
        error: aborted ? undefined : (err as Error).message,
      }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  function exportTranscript() {
    const pr = providers?.find((x) => x.id === provider);
    const lines = [
      "# State Property Grandpa: conversation",
      "",
      `- Model: ${pr ? `${pr.label} (${pr.model})` : provider}`,
      `- Memory window: last ${maxMessages} messages, max ${maxChars} characters`,
      `- Exported: ${new Date().toLocaleString("pl-PL")}`,
      "",
    ];
    for (const m of messages) {
      lines.push(`**${m.role === "user" ? "Me" : "Grandpa"}:** ${m.content || m.error || ""}`);
      for (const t of m.tools ?? []) lines.push(`> tool \`${t.name}(${JSON.stringify(t.args)})\` → ${t.result ?? "…"}`);
      lines.push("");
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "grandpa-conversation.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clear() {
    stopVoice();
    setMessages([GREETING]);
    setMemory(null);
  }

  // messages before memory.start were trimmed away on the last request
  const forgottenBefore = memory && memory.total <= messages.length ? memory.start : 0;

  return (
    <div className="layout" data-collapsed={collapsed}>
      <TackleBox
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        temperature={temperature}
        onTemperature={setTemperature}
        anger={anger}
        onAnger={setAnger}
        voiceAvailable={voiceAvailable}
        speakAloud={speakAloud}
        onSpeakAloud={setSpeakAloud}
        providers={providers}
        providerError={providerError}
        provider={provider}
        onProvider={setProvider}
        maxMessages={maxMessages}
        onMaxMessages={setMaxMessages}
        maxChars={maxChars}
        onMaxChars={setMaxChars}
        memory={memory}
        messages={messages}
        onExport={exportTranscript}
        onClear={clear}
        busy={busy}
      />
      <main className="lake">
        <Sign joltKey={jolt} anger={anger} />
        <ol className="chat" aria-live="polite">
          {messages.map((m, i) => (
            <Fragment key={m.id}>
              {forgottenBefore > 0 && i === forgottenBefore && (
                <li className="memory-line" aria-label="Grandpa remembers from here">
                  <span>Grandpa remembers from here down</span>
                </li>
              )}
              <MessageItem
                msg={m}
                forgotten={i < forgottenBefore}
                voice={
                  voiceAvailable
                    ? {
                        state: voice?.id === m.id ? voice.state : "idle",
                        onToggle: () => (voice?.id === m.id ? stopVoice() : void speak(m.id, m.content)),
                      }
                    : undefined
                }
              />
            </Fragment>
          ))}
          <li ref={endRef} className="chat-end" aria-hidden />
        </ol>
        <Composer busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} />
      </main>
    </div>
  );
}
