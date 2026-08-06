export function DmRail({
  mode,
  onSelectMode,
}: {
  mode: "home" | "friends";
  onSelectMode: (mode: "home" | "friends") => void;
}) {
  const NavCircle = ({
    active,
    title,
    onClick,
    children,
  }: {
    active: boolean;
    title: string;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      className={`rail-circle ${active ? "active" : ""}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <nav className="rail">
      <NavCircle active={mode === "home"} title="Главная" onClick={() => onSelectMode("home")}>
        <span className="rail-glyph">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </span>
      </NavCircle>

      <NavCircle active={mode === "friends"} title="Друзья" onClick={() => onSelectMode("friends")}>
        <span className="rail-glyph">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        </span>
      </NavCircle>
    </nav>
  );
}
