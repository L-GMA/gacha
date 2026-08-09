import type { ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<>"')]+)/;

export function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        className="chat-link"
        href={part}
        target="_blank"
        rel="noreferrer noopener"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
