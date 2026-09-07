import { AnimatePresence, motion } from "framer-motion";
import { Bot, Camera, History, ImagePlus, LogIn, Mic, MicOff, RefreshCw, ScanSearch, Send, Sparkles, Trash2, User, Volume2, VolumeX, X } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Streamdown } from "streamdown";
import { localApi, streamLocalChat, type LocalUser, type ConversationSummary } from "@/lib/local-api";

type Message = { role: "user" | "assistant"; text: string; image?: string };
type SpeechRecognitionLike = { start: () => void; stop: () => void; abort: () => void; onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean };
type RecognitionConstructor = new () => SpeechRecognitionLike;

const prompts = ["Is my plant healthy?", "Why are my leaves turning yellow?", "How often should I water my plants?", "What is this plant?"];
const welcome = "Hi! I'm the GREENHAZE plant assistant. Attach a photo of your plant and ask me anything\u2014I can identify species, spot visible issues, and suggest calm, practical care steps.";

async function toDataUrl(file: File) {
  const raw = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  if (file.size < 2_000_000) return raw;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = raw; });
  const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function WelcomeCard({ onSend }: { onSend: (text: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gh-welcome">
      <span className="gh-welcome-icon"><Bot size={24} /></span>
      <p>{welcome}</p>
      <div className="gh-prompt-grid">
        {prompts.map(prompt => <button key={prompt} onClick={() => onSend(prompt)}>{prompt}</button>)}
      </div>
    </motion.div>
  );
}

function ChatMessage({ message, onSpeak }: { message: Message; onSpeak: (text: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} className={`gh-message gh-message--${message.role}`}>
      <span className="gh-message-avatar">{message.role === "user" ? <User size={14} /> : <img src="/logo.png" alt="GreenHaze" width="14" height="14" />}</span>
      <div>
        {message.image && <img src={message.image} alt="Plant provided for analysis" />}
        <Streamdown>{message.text}</Streamdown>
        {message.role === "assistant" && <button onClick={() => onSpeak(message.text)} title="Read this reply aloud"><Volume2 size={13} /></button>}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return <div className="gh-typing"><span /><span /><span /></div>;
}

function AnalysisCard({ report }: { report: { plant: string; issue: string; confidence: number; explanation: string; recommendation: string } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="gh-analysis-card">
      <div className="gh-analysis-head"><ScanSearch size={16} /><strong>Image Analysis</strong></div>
      <div className="gh-analysis-grid">
        <div><small>Plant</small><strong>{report.plant}</strong></div>
        <div><small>Issue</small><strong>{report.issue}</strong></div>
        <div><small>Confidence</small><strong>{report.confidence}%</strong></div>
      </div>
      <p>{report.explanation}</p>
      <p><strong>Recommendation:</strong> {report.recommendation}</p>
    </motion.div>
  );
}

function ImagePreview({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="gh-image-chip">
      <img src={src} alt="Selected plant" />
      <button onClick={onRemove} title="Remove image"><Trash2 size={13} /></button>
    </div>
  );
}

function LoadingSkeleton({ elapsed }: { elapsed: number }) {
  return (
    <div className="gh-message gh-message--assistant gh-msg-appear">
      <span className="gh-message-avatar"><img src="/logo.png" alt="GreenHaze" width="14" height="14" /></span>
      <div>
        <div className="gh-loading-row">
          <span className="gh-typing"><span /><span /><span /></span>
          <span className="gh-loading-text">Thinking{elapsed > 0 ? ` ${elapsed}s` : ''}...</span>
        </div>
      </div>
    </div>
  );
}

function TypewriterMessage({ text, elapsed, isStreaming, onSpeak }: { text: string; elapsed: number; isStreaming: boolean; onSpeak?: (text: string) => void }) {
  if (!text) return null;
  return (
    <div className="gh-message gh-message--assistant gh-msg-appear">
      <span className="gh-message-avatar"><img src="/logo.png" alt="GreenHaze" width="14" height="14" /></span>
      <div>
        <Streamdown>{text}</Streamdown>
        {isStreaming && <span className="gh-cursor" />}
        {isStreaming && <div className="gh-stream-meta"><span>{elapsed}s</span></div>}
        {!isStreaming && onSpeak && <button onClick={() => onSpeak(text)} title="Read this reply aloud"><Volume2 size={13} /></button>}
      </div>
    </div>
  );
}

function useSpeechRecognition(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const microphoneAvailable = useMemo(() => typeof window !== "undefined" && Boolean((window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition), []);

  const toggle = useCallback(() => {
    if (listening) { recognition.current?.stop(); return; }
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) return;
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = "en-US";
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = event => {
      let value = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) value += event.results[i][0].transcript;
      onResult(value);
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);
    setListening(true);
    instance.start();
  }, [listening, onResult]);

  const stop = useCallback(() => { recognition.current?.abort(); }, []);

  return { listening, microphoneAvailable, toggle, stop };
}

function useChatHistory(userId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) { setLoaded(true); return; }
    localApi.chatHistory().then(result => {
      setMessages(result.messages.map(m => ({ role: m.role as "user" | "assistant", text: m.text, image: m.image })));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [userId]);

  const addMessage = useCallback(async (message: Message) => {
    setMessages(current => [...current, message]);
    if (userId) {
      try { await localApi.saveChatMessage({ role: message.role, text: message.text, image: message.image }); } catch {}
    }
  }, [userId]);

  const reset = useCallback(async () => {
    setMessages([]);
    if (userId) {
      try { await localApi.clearChatHistory(); } catch {}
    }
  }, [userId]);

  return { messages, setMessages, addMessage, reset, loaded };
}

function ConversationSidebar({ open, onClose, conversations, activeId, onSelect, onNew, onDelete, loading }: {
  open: boolean; onClose: () => void; conversations: ConversationSummary[]; activeId: string | null;
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; loading: boolean;
}) {
  function formatTime(iso: string) {
    const d = new Date(iso); const now = new Date(); const diffMs = now.getTime() - d.getTime(); const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now"; if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60); if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24); if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="gh-history-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="gh-history-sidebar" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}>
            <div className="gh-history-header">
              <strong>Chat History</strong>
              <button onClick={onClose} title="Close history"><X size={16} /></button>
            </div>
            <button className="gh-history-new" onClick={onNew}><RefreshCw size={14} /> New conversation</button>
            <div className="gh-history-list">
              {loading && <p className="gh-history-empty">Loading...</p>}
              {!loading && conversations.length === 0 && <p className="gh-history-empty">No conversations yet.</p>}
              {conversations.map(c => (
                <div key={c.id} className={`gh-history-item ${c.id === activeId ? "gh-history-item--active" : ""}`} onClick={() => { onSelect(c.id); onClose(); }}>
                  <div className="gh-history-item-body">
                    <span className="gh-history-item-title">{c.title}</span>
                    <span className="gh-history-item-meta">{formatTime(c.updatedAt)} &middot; {c.messageCount} messages</span>
                  </div>
                  <button className="gh-history-item-delete" onClick={e => { e.stopPropagation(); onDelete(c.id); }} title="Delete conversation"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default function Scan() {
  const [config, setConfig] = useState({ configured: false, allowScans: true, model: "" });
  const [user, setUser] = useState<LocalUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => { void localApi.config().then(setConfig).catch(() => undefined); }, []);
  useEffect(() => { void localApi.me().then(result => { setUser(result.user); setAuthLoading(false); }).catch(() => setAuthLoading(false)); }, []);

  const { messages, setMessages, addMessage, reset: resetChat, loaded } = useChatHistory(user?.id || null);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [report, setReport] = useState<{ plant: string; issue: string; confidence: number; explanation: string; recommendation: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [convoLoading, setConvoLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef("");
  const streamDoneRef = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming, report, busy]);

  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, []);

  const { listening, microphoneAvailable, toggle: toggleMic, stop: stopMic } = useSpeechRecognition((text) => setInput(text));

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void toDataUrl(file).then(setImage).catch(() => setError("That image could not be read. Try another clear photo."));
    event.target.value = "";
  }

  async function send(text = input, selectedImage = image) {
    if (busy || (!text.trim() && !selectedImage)) return;
    const userMessage: Message = { role: "user", text: text.trim(), ...(selectedImage ? { image: selectedImage } : {}) };
    await addMessage(userMessage);
    setInput("");
    setImage(null);
    setStreaming("");
    setError("");
    setReport(null);
    setBusy(true);
    streamBufferRef.current = "";
    streamDoneRef.current = false;
    let output = "";
    try {
      const next: Message[] = [...messages, userMessage];
      await streamLocalChat(next, delta => {
        output += delta;
        streamBufferRef.current = output;
        setStreaming(output);
      });
      streamDoneRef.current = true;
      setStreaming("");
      const assistantMessage: Message = { role: "assistant", text: output };
      await addMessage(assistantMessage);
      if (readAloud && output) speak(output);
      if (activeConvoId) {
        try { await localApi.appendConversationMessage(activeConvoId, { role: "user", text: userMessage.text, image: userMessage.image }); } catch {}
        try { await localApi.appendConversationMessage(activeConvoId, { role: "assistant", text: output }); } catch {}
      } else if (messages.length === 0 || (messages.length === 1 && messages[0].role === "user")) {
        try {
          const title = userMessage.text.slice(0, 80) || "Plant question";
          const convo = await localApi.createConversation(title);
          setActiveConvoId(convo.id);
          await localApi.appendConversationMessage(convo.id, { role: "user", text: userMessage.text, image: userMessage.image });
          await localApi.appendConversationMessage(convo.id, { role: "assistant", text: output }, title);
          loadConversations();
        } catch {}
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "GreenHaze could not complete that request.");
    } finally {
      setBusy(false);
      setStreaming("");
    }
  }

  async function analyzeImage() {
    if (!image || busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await localApi.analyzeImage(image);
      if ("error" in result) throw new Error((result as { error: string }).error);
      setReport(result as { plant: string; issue: string; confidence: number; explanation: string; recommendation: string });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "GreenHaze could not analyze the image.");
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    stopMic();
    window.speechSynthesis?.cancel();
    await resetChat();
    setInput("");
    setImage(null);
    setStreaming("");
    setError("");
    setReport(null);
    setBusy(false);
    setActiveConvoId(null);
  }

  const loadConversations = useCallback(async () => {
    try { const result = await localApi.listConversations(); setConversations(result.conversations); } catch {}
  }, []);

  useEffect(() => { if (user) loadConversations(); }, [user, loadConversations]);

  const loadConversation = useCallback(async (id: string) => {
    setConvoLoading(true);
    try {
      const convo = await localApi.getConversation(id);
      const msgs: Message[] = convo.messages.map(m => ({ role: m.role as "user" | "assistant", text: m.text, image: m.image }));
      setMessages(msgs);
      setActiveConvoId(id);
    } catch {}
    setConvoLoading(false);
  }, [setMessages]);

  const startNewConversation = useCallback(() => {
    setActiveConvoId(null);
    resetAll();
  }, [resetAll]);

  const deleteConversation = useCallback(async (id: string) => {
    try { await localApi.deleteConversation(id); } catch {}
    if (activeConvoId === id) { setActiveConvoId(null); await resetChat(); }
    loadConversations();
  }, [activeConvoId, resetChat, loadConversations]);

  if (authLoading) return <section className="gh-scan-page"><div className="gh-scan-ambient" /><div className="gh-chat-wrap"><div className="gh-loader">Loading GreenHaze...</div></div></section>;

  if (!user) return (
    <section className="gh-scan-page">
      <div className="gh-scan-ambient" />
      <div className="gh-chat-wrap">
        <div className="gh-login-card">
          <span><img src="/logo.png" alt="GreenHaze logo" width="29" height="29" /></span>
          <h2>Sign in to start chatting</h2>
          <p>You need an account to use the plant-care chat and save your conversation history.</p>
          <div className="gh-login-buttons">
            <Link className="gh-btn gh-btn--primary" href="/auth"><LogIn size={16} /> Sign in with Google or Email</Link>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <section className="gh-scan-page">
      <div className="gh-scan-ambient" />
      <ConversationSidebar open={historyOpen} onClose={() => setHistoryOpen(false)} conversations={conversations} activeId={activeConvoId} onSelect={loadConversation} onNew={startNewConversation} onDelete={deleteConversation} loading={convoLoading} />
      <div className="gh-chat-wrap">
        <div className="gh-scan-intro">
          <span className="gh-kicker"><Sparkles size={14} /> GreenHaze plant-care chat</span>
          <h1>Ask what your<br /><em>plant is saying.</em></h1>
          <p>Start with a photo, camera capture, voice note, or a simple question. Your conversation is saved to your account.</p>
        </div>
        <div className="gh-chat-card">
          <header>
            <div className="gh-chat-title">
              <span><img src="/logo.png" alt="GreenHaze logo" width="18" height="18" /></span>
              <div>
                <strong>Plant Care Chat</strong>
                <small>{config.configured ? "Online \u00b7 plant-care mode" : "Awaiting secure AI setup"}</small>
              </div>
            </div>
            <div className="gh-chat-head-actions">
              <button onClick={() => setHistoryOpen(true)} title="Chat history"><History size={15} /> History</button>
              <button onClick={() => setReadAloud(!readAloud)} title="Read AI replies aloud">
                {readAloud ? <Volume2 size={15} /> : <VolumeX size={15} />}{readAloud ? "Voice on" : "Voice off"}
              </button>
              <button onClick={startNewConversation}><RefreshCw size={15} /> New chat</button>
            </div>
          </header>
          <div className="gh-chat-messages" role="log" aria-live="polite" aria-label="Chat conversation">
            <AnimatePresence initial={false}>
              {messages.length === 0 && !busy && !streaming && <WelcomeCard onSend={(text) => void send(text)} />}
              {messages.map((message, index) => {
                const isLastAssistant = message.role === "assistant" && index === messages.length - 1;
                if (isLastAssistant) {
                  return <TypewriterMessage key={`${message.role}-${index}`} text={message.text} elapsed={0} isStreaming={false} onSpeak={speak} />;
                }
                return <ChatMessage key={`${message.role}-${index}`} message={message} onSpeak={speak} />;
              })}
            </AnimatePresence>
            {busy && !streaming && <LoadingSkeleton elapsed={elapsed} />}
            {streaming && <TypewriterMessage text={streaming} elapsed={elapsed} isStreaming={true} />}
            <div ref={endRef} />
          </div>
          {error && <div className="gh-chat-error">{error}</div>}
          {report && <div style={{ padding: "0 19px" }}><AnalysisCard report={report} /></div>}
          <div className="gh-compose">
            {image && <ImagePreview src={image} onRemove={() => setImage(null)} />}
            <div className="gh-compose-actions">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseFile} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={chooseFile} />
              <button onClick={() => fileRef.current?.click()} title="Upload photo"><ImagePlus size={15} /></button>
              <button onClick={() => cameraRef.current?.click()} title="Take photo"><Camera size={15} /></button>
              {microphoneAvailable && <button onClick={toggleMic} className={listening ? "gh-compose-mic--active" : ""} title={listening ? "Stop voice" : "Start voice"}>{listening ? <MicOff size={15} /> : <Mic size={15} />}</button>}
            </div>
            <div className="gh-compose-input-row">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask about your plant..."
                rows={1}
              />
              <div className="gh-compose-buttons">
                {image && (
                  <button className="gh-compose-analyze" onClick={() => void analyzeImage()} disabled={busy} title="Analyze image">
                    <ScanSearch size={14} /> Analyze
                  </button>
                )}
                <button className="gh-compose-send" onClick={() => void send()} disabled={busy || (!input.trim() && !image)} title="Send message">
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() { return <span className="gh-mini-check">\u2713</span>; }
