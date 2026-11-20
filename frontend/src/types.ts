export type Role = "user" | "assistant";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  tools?: ToolCall[];
  error?: string;
  pending?: boolean;
}

export interface Provider {
  id: string;
  label: string;
  model: string;
  available: boolean;
}

export interface MemoryInfo {
  start: number; // index of the first message the model saw
  kept: number;
  total: number;
  chars: number;
}

export type StreamEvent =
  | ({ type: "memory" } & MemoryInfo)
  | { type: "token"; text: string }
  | { type: "reset" }
  | { type: "tool_start"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; id: string; name: string; result: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };
