import type { Provider, Role, StreamEvent } from "./types";

export async function fetchProviders(): Promise<Provider[]> {
  const r = await fetch("/api/providers");
  if (!r.ok) throw new Error(`Backend answered ${r.status}`);
  return r.json();
}

interface ChatParams {
  provider: string;
  messages: { role: Role; content: string }[];
  maxMessages: number;
  maxChars: number;
  temperature: number;
  anger: number;
  signal: AbortSignal;
  onEvent: (e: StreamEvent) => void;
}

/** POSTs the history and reads the Server-Sent Events stream line by line. */
export async function streamChat(p: ChatParams): Promise<void> {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: p.provider,
      messages: p.messages,
      max_messages: p.maxMessages,
      max_chars: p.maxChars,
      temperature: p.temperature,
      anger: p.anger,
    }),
    signal: p.signal,
  });
  if (!r.ok || !r.body) throw new Error(`Backend answered ${r.status}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) p.onEvent(JSON.parse(line.slice(6)) as StreamEvent);
      }
    }
  }
}

export async function fetchVoice(): Promise<{ available: boolean; model: string }> {
  const r = await fetch("/api/voice");
  if (!r.ok) throw new Error(`Backend answered ${r.status}`);
  return r.json();
}

/** Returns an mp3 blob of Grandpa saying `text`. */
export async function fetchSpeech(text: string, anger: number): Promise<Blob> {
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, anger }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}
