import { useEffect, useState } from "react";
import { api, type User } from "./api.js";
import { AuthForm } from "./components/AuthForm.js";
import { Server } from "./components/Server.js";

type View = "start" | "login" | "register";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  const [view, setView] = useState<View>("start");
  const [loading, setLoading] = useState(true);

  const loadUser = () =>
    api.me().then(({ user, invited_by }) => {
      setUser(user);
      setInvitedBy(invited_by);
    });

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    loadUser()
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="screen">Загрузка...</div>;

  if (user) {
    return (
      <Server
        invitedBy={invitedBy}
        onLogout={() => {
          localStorage.removeItem("token");
          setUser(null);
          setInvitedBy(null);
        }}
      />
    );
  }

  if (view === "login" || view === "register") {
    return (
      <AuthForm
        mode={view}
        onBack={() => setView("start")}
        onSuccess={loadUser}
      />
    );
  }

  return (
    <div className="screen">
      <h1 className="logo">GACHA</h1>
      <p className="subtitle">Закрытый чат вашей компании</p>
      <div className="buttons">
        <button className="btn primary" onClick={() => setView("login")}>
          Авторизация
        </button>
        <button className="btn ghost" onClick={() => setView("register")}>
          Регистрация
        </button>
      </div>
    </div>
  );
}
