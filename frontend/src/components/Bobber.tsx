import { toolLabel } from "../tools";

interface Props {
  /** name of the tool that is running right now, if any */
  biting?: string;
}

/** Thinking indicator: a bobber floating on the water. It dips when a tool is running. */
export function Bobber({ biting }: Props) {
  return (
    <div className="bobber" data-bite={biting ? "true" : "false"} role="status">
      <svg viewBox="0 0 120 60" width="96" height="48" aria-hidden>
        <path className="bobber-water" d="M0 40 Q15 34 30 40 T60 40 T90 40 T120 40" />
        <g className="bobber-float">
          <line x1="60" y1="2" x2="60" y2="16" stroke="var(--ink)" strokeWidth="2" />
          <path d="M48 26 A12 12 0 0 1 72 26 Z" fill="var(--bobber)" />
          <path d="M48 26 A12 12 0 0 0 72 26 Z" fill="var(--bone)" stroke="var(--ink)" strokeWidth="1" />
          <rect x="46" y="24.5" width="28" height="3" fill="var(--ink)" />
        </g>
      </svg>
      <span className="bobber-text">
        {biting ? `Somethin' bit. ${toolLabel(biting)}…` : "Grandpa's grabbin' his shotgun…"}
      </span>
    </div>
  );
}
