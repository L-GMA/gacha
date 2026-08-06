import { useEffect, useRef, useState } from "react";
import { api, type Channel, type ChatMessage, type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";
import { ChatInput } from "./ChatInput.js";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function ChannelChat({
  channel,
  members,
  meId,
}: {
  channel: Channel;
  members: Member[];
  meId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setMessages((await api.channelMessages(channel.id)).messages);
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
  }, [channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (content: string, imageUrl: string | null) => {
    await api.sendChannelMessage(channel.id, content, imageUrl ?? undefined);
    await load();
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-head-info">
          <span
            className="chat-title"
            style={channel.color ? { color: channel.color } : undefined}
          >
            <span className="ch-icon">#</span> {channel.name}
          </span>
          <span className="chat-sub">Текстовый канал</span>
        </div>
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

      <ChatInput placeholder={`Сообщение в #${channel.name}…`} onSend={send} />
    </div>
  );
}
