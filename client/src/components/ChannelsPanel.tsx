import { type Category, type PassVoiceChannel, type VoicePresenceUser } from "../api.js";
import { PassVoicePanel } from "./PassVoicePanel.js";
import { Avatar } from "./Avatar.js";
import { DeafenOffMiniIcon, MicOffMiniIcon } from "./stateIcons.js";

export function ChannelsPanel({
  categories,
  activeId,
  onSelect,
  passVoice,
  activePassVoiceId,
  meId,
  onOpenPassVoice,
  onPassVoiceChanged,
  onPassVoiceDeleted,
  onCaptureMic,
  presence,
  speakingIds,
  voiceState,
}: {
  categories: Category[];
  activeId?: string;
  onSelect: (channelId: string) => void;
  passVoice: PassVoiceChannel[];
  activePassVoiceId?: string;
  meId: string;
  onOpenPassVoice: (id: string) => void;
  onPassVoiceChanged: () => void;
  onPassVoiceDeleted: (id: string) => void;
  onCaptureMic: () => void;
  presence: Record<string, VoicePresenceUser[]>;
  speakingIds?: string[];
  voiceState?: Record<string, { muted: boolean; deafened: boolean }>;
}) {
  return (
    <aside className="panel channels-panel">
      <div className="panel-head">
        <span className="panel-title">Каналы</span>
      </div>

      <div className="channel-tree">
        {categories.map((cat) => (
          <div className="category" key={cat.id}>
            <div className="category-head">
              <span className="category-name" style={cat.color ? { color: cat.color } : undefined}>
                {cat.name.toUpperCase()}
              </span>
            </div>

            {cat.channels.map((ch) => {
              const members = ch.type === "voice" ? presence[ch.id] : undefined;
              return (
                <div key={ch.id} className="channel-item">
                  <button
                    className={`channel-row ${activeId === ch.id ? "active" : ""}`}
                    onClick={() => onSelect(ch.id)}
                  >
                    <span className="channel-name" style={ch.color ? { color: ch.color } : undefined}>
                      <span className="ch-icon">{ch.type === "text" ? "#" : "◉"}</span>
                      <span>{ch.name}</span>
                    </span>
                  </button>
                  {members && members.length > 0 && (
                    <div className="channel-members">
                      {members.map((p) => (
                        <span
                          className={`channel-member ${speakingIds?.includes(p.id) ? "speaking" : ""}`}
                          key={p.id}
                          title={p.nickname ?? p.login}
                        >
                          <Avatar src={p.avatar} name={p.nickname ?? p.login} size={18} />
                          <span className="channel-member-name">{p.nickname ?? p.login}</span>
                          {voiceState?.[p.id]?.muted && (
                            <span className="channel-member-ico" title="Микрофон выключен">
                              <MicOffMiniIcon />
                            </span>
                          )}
                          {voiceState?.[p.id]?.deafened && (
                            <span className="channel-member-ico" title="Оглушён">
                              <DeafenOffMiniIcon />
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <PassVoicePanel
        channels={passVoice}
        activeId={activePassVoiceId}
        meId={meId}
        onOpen={onOpenPassVoice}
        onChanged={onPassVoiceChanged}
        onDeleted={onPassVoiceDeleted}
        onCaptureMic={onCaptureMic}
        speakingIds={speakingIds}
        voiceState={voiceState}
      />
    </aside>
  );
}
