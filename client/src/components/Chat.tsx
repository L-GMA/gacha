import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type Conversation, type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";
import { ChatInput } from "./ChatInput.js";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function Chat({
  conversation,
  members,
  meId,
  onChanged,
  onDeleted,
}: {
  conversation: Conversation;
  members: Member[];
  meId: string;
  onChanged: () => void;
  onDeleted: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setMessages((await api.conversationMessages(conversation.id)).messages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  useEffect(() => {
    setMessages([]);
    setError("");
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (content: string, imageUrl: string | null) => {
    await api.sendMessage(conversation.id, content, imageUrl ?? undefined);
    await load();
    onChanged();
  };

  const removeMessage = async (messageId: string) => {
    setDeletingMessageId(messageId);
    setError("");
    try {
      await api.deleteMessage(conversation.id, messageId);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const confirmRemove = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.deleteConversation(conversation.id);
      setConfirmDelete(false);
      onDeleted(conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setDeleting(false);
    }
  };

  const title = conversation.member?.nickname ?? conversation.member?.login ?? "Диалог";
  const dmMember = members.find((m) => m.id === conversation.member?.id);
  const titleColor = dmMember ? highestRoleColor(dmMember.roles) : undefined;

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-head-info">
          <span className="chat-title" style={titleColor ? { color: titleColor } : undefined}>
            {title}
          </span>
          <span className="chat-sub">
            {conversation.member?.online ? "В сети" : "Не в сети"}
          </span>
        </div>
        <button
          className="chat-delete"
          title="Удалить диалог"
          onClick={() => setConfirmDelete(true)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((m) => {
          const sender = members.find((x) => x.id === m.sender.id);
          const name = sender?.nickname ?? m.sender.nickname ?? sender?.login ?? m.sender.login;
          const color = sender ? highestRoleColor(sender.roles) : undefined;
          const mine = m.sender.id === meId;
          return (
            <div className={`message ${mine ? "mine" : ""}`} key={m.id}>
              <Avatar src={m.sender.avatar} name={name} size={36} />
              <div className="message-body">
                <div className="message-head">
                  <span className="message-author" style={color ? { color } : undefined}>
                    {name}
                  </span>
                  <span className="message-time">{fmtTime(m.created_at)}</span>
                  {mine && (
                    <button
                      className="message-delete"
                      title="Удалить сообщение"
                      disabled={deletingMessageId === m.id}
                      onClick={() => removeMessage(m.id)}
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </div>
                {m.image_url && (
                  <a className="message-image" href={m.image_url} target="_blank" rel="noreferrer">
                    <img src={m.image_url} alt="" loading="lazy" />
                  </a>
                )}
                {m.content && <div className="message-text">{m.content}</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error chat-error">{error}</p>}

      <ChatInput
        placeholder={`Сообщение ${title}…`}
        onSend={send}
      />

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Удалить диалог?</h2>
            </div>
            <p className="modal-note">
              Диалог с <strong>{title}</strong> будет удалён из вашего списка.
              Сообщения сохранятся у собеседника.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button
                className="btn ghost"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Отмена
              </button>
              <button className="btn danger" disabled={deleting} onClick={confirmRemove}>
                {deleting ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
