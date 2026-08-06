import { useState } from "react";
import { api } from "../api.js";

export function AuthForm({
  mode,
  onBack,
  onSuccess,
}: {
  mode: "login" | "register";
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token } =
        mode === "login"
          ? await api.login(login, password)
          : await api.register(login, password, inviteCode);
      localStorage.setItem("token", token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <button className="link back" onClick={onBack}>
        ← Назад
      </button>
      <h1 className="logo">{mode === "login" ? "Вход" : "Регистрация"}</h1>
      <form className="card" onSubmit={submit}>
        <label>
          Логин
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === "register" && (
          <label>
            Пригласительный код
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Код выдаёт сотрудник компании"
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary full" disabled={busy}>
          {busy ? "Подождите..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>
    </div>
  );
}
