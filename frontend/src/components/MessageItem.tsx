import type { ReactNode } from "react";
import type { ChatMessage } from "../types";
import { argsSummary, toolLabel } from "../tools";
import { Bobber } from "./Bobber";

/** Renders **bold** from model output without using innerHTML. */
function richText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

interface Props {
  msg: ChatMessage;
  forgotten: boolean;
  /** undefined when no voice is configured */
  voice?: { state: "idle" | "loading" | "playing"; onToggle: () => void };
}

export function MessageItem({ msg, forgotten, voice }: Props) {
  const isGrandpa = msg.role === "assistant";
  const runningTool = msg.tools?.find((t) => t.result === undefined);
  const showBobber = msg.pending && !msg.content;

  return (
    <li className={`msg msg-${msg.role}`} data-forgotten={forgotten}>
      <img
        className="avatar"
        src={isGrandpa ? "/grandpa.png" : "/fisher.png"}
        alt={isGrandpa ? "Grandpa" : "You"}
        width={44}
        height={44}
      />
      <div className="bubble">
        {msg.tools && msg.tools.length > 0 && (
          <ul className="bites" aria-label="Tools Grandpa used">
            {msg.tools.map((t) => (
              <li key={t.id} className="bite" data-done={t.result !== undefined}>
                <span className="bite-name">{toolLabel(t.name)}</span>
                <span className="bite-args">{t.name}({argsSummary(t.args)})</span>
                {t.result !== undefined && <span className="bite-result">{t.result}</span>}
              </li>
            ))}
          </ul>
        )}
        {showBobber && <Bobber biting={runningTool?.name} />}
        {msg.content && <p className="msg-text">{richText(msg.content)}</p>}
        {msg.error && (
          <p className="msg-error">
            The line snapped: {msg.error}. Check that the backend is running and the API key is in backend/.env.
          </p>
        )}
        {voice && isGrandpa && msg.content && !msg.pending && (
          <button type="button" className="listen" data-state={voice.state} onClick={voice.onToggle}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {voice.state === "playing" ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" />
              ) : (
                <path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="2" />
              )}
            </svg>
            {voice.state === "loading" ? "Clearin' his throat…" : voice.state === "playing" ? "Stop" : "Hear Grandpa"}
          </button>
        )}
        {forgotten && <span className="forgot-note">Grandpa forgot this one</span>}
      </div>
    </li>
  );
}
