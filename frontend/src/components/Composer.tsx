import { useState, type KeyboardEvent } from "react";

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** The dock with the message box. */
export function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState("");

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(text);
    }
  };

  return (
    <div className="dock">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="message" className="sr-only">
          Message to Grandpa
        </label>
        <textarea
          id="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Say somethin' to Grandpa…"
          rows={1}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        {busy ? (
          <button type="button" className="send stop" onClick={onStop}>
            Reel in
          </button>
        ) : (
          <button type="submit" className="send" disabled={!text.trim()}>
            Cast
          </button>
        )}
      </form>
    </div>
  );
}
