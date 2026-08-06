import { useState, type ReactNode } from "react";

export function Avatar({
  src,
  name,
  size = 36,
  online,
}: {
  src: string | null;
  name: string;
  size?: number;
  online?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (name || "?").trim()[0]?.toUpperCase() ?? "?";

  let inner: ReactNode;
  if (src && !failed) {
    inner = (
      <img
        className="avatar avatar-img"
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  } else {
    inner = (
      <span
        className="avatar avatar-initial"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
      >
        {letter}
      </span>
    );
  }

  if (online === undefined) return inner;

  return (
    <span className={`avatar-box ${online ? "" : "offline"}`} style={{ width: size, height: size }}>
      {inner}
      {online && <span className="status-dot" />}
    </span>
  );
}
