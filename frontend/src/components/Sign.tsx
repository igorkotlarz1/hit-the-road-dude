interface Props {
  /** changes every time grandpa yells; restarts the jolt animation */
  joltKey: number;
  /** grandpas_anger 0..10, scales how hard the sign shakes */
  anger: number;
}

/** Hand-painted plywood sign nailed to a post. The one loud element on the page. */
export function Sign({ joltKey, anger }: Props) {
  return (
    <header className="sign-wrap">
      <div
        className="sign"
        key={joltKey}
        data-jolt={joltKey > 0}
        style={{ ["--shake" as string]: `${2 + anger}px` }}
      >
        <span className="nail nail-tl" aria-hidden />
        <span className="nail nail-tr" aria-hidden />
        <span className="nail nail-bl" aria-hidden />
        <span className="nail nail-br" aria-hidden />
        <h1 className="sign-title">
          Private
          <br />
          Property
        </h1>
        <p className="sign-sub">No feeshin'. No state. No exceptions.</p>
        <p className="sign-auth">By order of Trey Taylor, Crewe Tractor</p>
      </div>
      <div className="post" aria-hidden />
    </header>
  );
}
