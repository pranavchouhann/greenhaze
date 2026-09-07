export type LocalUser = { id: string; email: string; name: string | null; picture: string | null; role: string };
export type Reminder = { id: string; plantName: string; species?: string | null; frequencyDays: number; nextWateringAt: string; notes?: string | null };
export type ContactMessage = { id: number; name: string; email: string; message: string; createdAt: string };
export type AnalysisResult = { plant: string; issue: string; confidence: number; explanation: string; recommendation: string } | { error: string };
export type ConversationSummary = { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number };
export type ConversationDetail = { id: string; title: string; messages: Array<{ role: string; text: string; image?: string; timestamp: string }>; createdAt: string; updatedAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "GreenHaze could not complete that request.");
  return payload as T;
}

export const localApi = {
  register: (email: string, password: string) => request<{ user: LocalUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<{ user: LocalUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: LocalUser | null }>("/api/auth/me"),
  logout: () => request<{ success: true }>("/api/auth/logout", { method: "POST" }),
  config: () => request<{ configured: boolean; allowScans: boolean; model: string }>("/api/config"),
  contact: (input: { name: string; email: string; message: string }) => request<{ success: true }>("/api/contact", { method: "POST", body: JSON.stringify(input) }),
  listReminders: () => request<{ reminders: Reminder[] }>("/api/schedule"),
  createReminder: (input: Omit<Reminder, "id">) => request<{ reminders: Reminder[] }>("/api/schedule", { method: "POST", body: JSON.stringify(input) }),
  deleteReminder: (reminderId: string) => request<{ reminders: Reminder[] }>(`/api/schedule/${reminderId}`, { method: "DELETE" }),
  adminLogin: (password: string) => request<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminSettings: (token: string) => request<{ apiKeyConfigured: boolean; apiUrl: string; model: string; allowScans: boolean; adminPasswordConfigured: boolean }>("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } }),
  saveAdminSettings: (token: string, input: Record<string, unknown>) => request<{ apiUrl: string; model: string; allowScans: boolean }>("/api/admin/settings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) }),
  contacts: (token: string) => request<{ messages: ContactMessage[] }>("/api/admin/contacts", { headers: { Authorization: `Bearer ${token}` } }),
  adminUsers: (token: string) => request<{ users: Array<{ id: string; email: string; name: string | null; picture: string | null; role: string; createdAt: string; lastLogin: number | null; messageCount: number }> }>("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
  adminSessions: (token: string) => request<{ sessions: Array<{ token: string; userId: string; email: string; name: string | null; expiresAt: string }> }>("/api/admin/sessions", { headers: { Authorization: `Bearer ${token}` } }),
  adminChatHistory: (token: string, userId: string) => request<{ messages: Array<{ role: string; text: string; image?: string; timestamp: string }> }>(`/api/admin/chathistory/${userId}`, { headers: { Authorization: `Bearer ${token}` } }),
  chatHistory: () => request<{ messages: Array<{ role: string; text: string; image?: string; timestamp: string }> }>("/api/chat/history"),
  saveChatMessage: (input: { role: string; text: string; image?: string }) => request<{ success: true }>("/api/chat/history", { method: "POST", body: JSON.stringify(input) }),
  clearChatHistory: () => request<{ success: true }>("/api/chat/history", { method: "DELETE" }),
  listConversations: () => request<{ conversations: ConversationSummary[] }>("/api/chat/conversations"),
  createConversation: (title?: string, messages?: Array<{ role: string; text: string; image?: string }>) => request<{ id: string; title: string; createdAt: string; updatedAt: string }>("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title, messages }) }),
  getConversation: (id: string) => request<ConversationDetail>(`/api/chat/conversations/${id}`),
  appendConversationMessage: (id: string, message: { role: string; text: string; image?: string }, title?: string) => request<{ success: true; messageCount: number }>(`/api/chat/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ append: message, title }) }),
  deleteConversation: (id: string) => request<{ success: true }>(`/api/chat/conversations/${id}`, { method: "DELETE" }),
  analyzeImage: (image: string) => request<AnalysisResult>("/api/analyze", { method: "POST", body: JSON.stringify({ image }) }),
  googleConfig: () => request<{ enabled: boolean }>("/api/auth/google/config"),
};

export async function streamLocalChat(messages: Array<{ role: "user" | "assistant"; text: string; image?: string }>, onDelta: (delta: string) => void) {
  const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
  if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({ error: "GreenHaze could not start the conversation." }))).error);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); let marker = buffer.indexOf("\n\n");
    while (marker !== -1) {
      const event = buffer.slice(0, marker); buffer = buffer.slice(marker + 2);
      const data = event.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
      if (data && data !== "[DONE]") { const payload = JSON.parse(data) as { delta?: string; error?: string }; if (payload.error) throw new Error(payload.error); if (payload.delta) onDelta(payload.delta); }
      marker = buffer.indexOf("\n\n");
    }
  }
}
