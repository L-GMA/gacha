export type RolePermissions = {
  invite: boolean;
  manage_channels: boolean;
  manage_roles: boolean;
};

export type Role = {
  id: string;
  name: string;
  kind: "admin" | "default" | "custom";
  permissions: RolePermissions;
  color: string | null;
  position?: number;
  highlight: boolean;
};

export type User = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  banned: boolean;
  online?: boolean;
  roles: Role[];
};

export type Channel = { id: string; name: string; color: string | null; type: "text" | "voice" };

export type Category = { id: string; name: string; color: string | null; channels: Channel[] };

export type Member = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  banned: boolean;
  created_at: string;
  invited_by: string | null;
  online: boolean;
  roles: Role[];
};

export type Me = User;

export type ServerData = {
  categories: Category[];
  members: Member[];
  conversations: Conversation[];
  me: Me;
};

export type Invite = {
  id: string;
  code: string;
  used_at: string | null;
  created_at: string;
  used_by_login: string | null;
};

export type ChannelPerm = { role_id: string; can_view: boolean; can_send: boolean };

export type S3Settings = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

export type PassVoiceChannel = {
  id: string;
  name: string;
  owner: { id: string; login: string; nickname: string | null };
  has_password: boolean;
  max_participants: number | null;
  allowed_role_ids: string[];
  participant_count: number;
  joined: boolean;
  can_join: boolean;
  participants?: PassVoiceParticipant[];
};

export type PassVoiceParticipant = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
  online: boolean;
};

export type PassVoiceRole = { id: string; name: string; color: string | null };

export type VoiceJoin = { token: string; url: string; room: string };

export type VoicePresenceUser = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
};

export type VoicePresenceChannel = {
  id: string;
  participants: VoicePresenceUser[];
};

export type SettingsChannel = Channel & { permissions: ChannelPerm[] };

export type SettingsCategory = { id: string; name: string; color: string | null; channels: SettingsChannel[] };

export type SettingsData = {
  categories: SettingsCategory[];
  roles: Role[];
  members: Member[];
};

export type Conversation = {
  id: string;
  kind: "group" | "dm";
  created_at: string;
  member_count: number;
  last_message: {
    id: string;
    content: string;
    created_at: string;
    sender_id: string;
    sender_login: string;
    sender_nickname: string | null;
  } | null;
  member: {
    id: string;
    login: string;
    nickname: string | null;
    avatar: string | null;
    online: boolean;
  } | null;
};

export type ChatMessage = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  sender: {
    id: string;
    login: string;
    nickname: string | null;
    avatar: string | null;
  };
};

export type DmTarget = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
  online: boolean;
  has_dm: boolean;
};

const IS_WEB =
  typeof window !== "undefined" &&
  (window.location.protocol === "http:" || window.location.protocol === "https:");
const API = IS_WEB ? "/api" : "https://gachandra.ru/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.headers) Object.assign(headers, options.headers);

  const res = await fetch(API + path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Ошибка запроса");
  return body as T;
}

export const api = {
  register: (login: string, password: string, inviteCode: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ login, password, inviteCode }),
    }),
  login: (login: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  me: () => request<{ user: User; invited_by: string | null }>("/auth/me"),
  updateMe: (nickname: string | null, avatar: string | null, bio: string | null) =>
    request<{ ok: boolean }>("/me", {
      method: "PATCH",
      body: JSON.stringify({ nickname, avatar, bio }),
    }),
  createInvite: () =>
    request<{ id: string; code: string }>("/invites", { method: "POST" }),
  myInvites: () => request<{ invites: Invite[] }>("/invites"),
  deleteInvite: (id: string) =>
    request<{ ok: boolean }>(`/invites/${id}`, { method: "DELETE" }),

  server: () => request<ServerData>("/server"),

  conversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  conversationMessages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/conversations/${id}/messages`),
  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/conversations/${id}`, { method: "DELETE" }),
  sendMessage: (id: string, content: string, imageUrl?: string) =>
    request<{ message: ChatMessage }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, imageUrl }),
    }),
  startDm: (userId: string) =>
    request<{ conversation: Conversation | null }>("/dms", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  users: () => request<{ users: DmTarget[] }>("/users"),

  channelMessages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/channels/${id}/messages`),
  sendChannelMessage: (id: string, content: string, imageUrl?: string) =>
    request<{ message: ChatMessage }>(`/channels/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, imageUrl }),
    }),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string }>("/upload", { method: "POST", body: form });
  },

  settings: () => request<SettingsData>("/server/settings"),

  getS3Settings: () => request<{ s3: S3Settings | null }>("/settings/s3"),
  saveS3Settings: (s3: S3Settings) =>
    request<{ ok: boolean }>("/settings/s3", {
      method: "POST",
      body: JSON.stringify(s3),
    }),
  clearS3Settings: () =>
    request<{ ok: boolean }>("/settings/s3", { method: "DELETE" }),

  createCategory: (name: string, color: string | null) =>
    request<{ id: string }>("/categories", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  renameCategory: (id: string, name: string, color: string | null) =>
    request<{ ok: boolean }>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, color }),
    }),
  deleteCategory: (id: string) =>
    request<{ ok: boolean }>(`/categories/${id}`, { method: "DELETE" }),

  createChannel: (categoryId: string, name: string, type: "text" | "voice", color: string | null) =>
    request<{ id: string }>("/channels", {
      method: "POST",
      body: JSON.stringify({ categoryId, name, type, color }),
    }),
  renameChannel: (id: string, name: string, color: string | null) =>
    request<{ ok: boolean }>(`/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, color }),
    }),
  deleteChannel: (id: string) =>
    request<{ ok: boolean }>(`/channels/${id}`, { method: "DELETE" }),

  reorderCategories: (orderedIds: string[]) =>
    request<{ ok: boolean }>("/categories/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    }),
  reorderChannels: (categoryId: string, orderedIds: string[]) =>
    request<{ ok: boolean }>("/channels/reorder", {
      method: "PATCH",
      body: JSON.stringify({ categoryId, orderedIds }),
    }),

  setChannelPermission: (
    channelId: string,
    roleId: string,
    canView: boolean,
    canSend: boolean,
  ) =>
    request<{ ok: boolean }>(`/channels/${channelId}/permissions`, {
      method: "PATCH",
      body: JSON.stringify({ roleId, canView, canSend }),
    }),

  createRole: (name: string, color?: string | null) =>
    request<{ id: string }>("/roles", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  updateRole: (id: string, patch: { name?: string; permissions?: RolePermissions; highlight?: boolean; color?: string | null }) =>
    request<{ ok: boolean }>(`/roles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteRole: (id: string) =>
    request<{ ok: boolean }>(`/roles/${id}`, { method: "DELETE" }),
  reorderRoles: (orderedIds: string[]) =>
    request<{ ok: boolean }>("/roles/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    }),

  setUserRoles: (userId: string, roleIds: string[]) =>
    request<{ ok: boolean }>(`/users/${userId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({ roleIds }),
    }),
  setUserBan: (userId: string, banned: boolean) =>
    request<{ ok: boolean }>(`/users/${userId}/ban`, {
      method: "PATCH",
      body: JSON.stringify({ banned }),
    }),

  roles: () => request<{ roles: PassVoiceRole[] }>("/roles"),

  passVoice: () => request<{ channels: PassVoiceChannel[] }>("/pass-voice"),
  createPassVoice: (
    name: string,
    password: string,
    maxParticipants: number | null,
    roleIds: string[],
  ) =>
    request<{ channel: PassVoiceChannel }>("/pass-voice", {
      method: "POST",
      body: JSON.stringify({ name, password, maxParticipants, roleIds }),
    }),
  passVoiceRoom: (id: string) =>
    request<{ channel: PassVoiceChannel; participants: PassVoiceParticipant[] }>(
      `/pass-voice/${id}`,
    ),
  joinPassVoice: (id: string, password?: string) =>
    request<{ channel: PassVoiceChannel; participants: PassVoiceParticipant[] }>(
      `/pass-voice/${id}/join`,
      {
        method: "POST",
        body: JSON.stringify({ password: password ?? "" }),
      },
    ),
  leavePassVoice: (id: string) =>
    request<{ ok: boolean }>(`/pass-voice/${id}/leave`, { method: "POST" }),
  updatePassVoice: (
    id: string,
    opts: {
      name: string;
      password: string;
      clearPassword: boolean;
      maxParticipants: number | null;
      roleIds: string[];
    },
  ) =>
    request<{ channel: PassVoiceChannel; participants: PassVoiceParticipant[] }>(
      `/pass-voice/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(opts),
      },
    ),
  deletePassVoice: (id: string) =>
    request<{ ok: boolean }>(`/pass-voice/${id}`, { method: "DELETE" }),

  voiceJoin: (room: string) =>
    request<VoiceJoin>("/voice/join", {
      method: "POST",
      body: JSON.stringify({ room }),
    }),
  voicePresence: () =>
    request<{ channels: VoicePresenceChannel[] }>("/voice/presence"),
};

export function subscribeEvents(path: string, onChange: () => void): () => void {
  const ctrl = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(API + path, {
        signal: ctrl.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (stopped || !res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (chunk.includes("data: changed")) onChange();
        }
      }
    } catch {
      if (stopped) return;
    }
    if (!stopped) {
      timer = setTimeout(() => void connect(), 3000);
    }
  };

  void connect();

  return () => {
    stopped = true;
    ctrl.abort();
    if (timer) clearTimeout(timer);
  };
}

export const subscribePassVoiceEvents = (onChange: () => void) =>
  subscribeEvents("/pass-voice/events", onChange);

export const subscribeServerEvents = (onChange: () => void) =>
  subscribeEvents("/server/events", onChange);
