import { AnimatePresence, motion } from "framer-motion";
import { Bot, Camera, ImagePlus, Leaf, Mic, MicOff, RefreshCw, ScanSearch, Send, Sparkles, Trash2, User, Volume2, VolumeX, X } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { localApi, streamLocalChat } from "@/lib/local-api";

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
      <span className="gh-message-avatar">{message.role === "user" ? <User size={14} /> : <Leaf size={14} />}</span>
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

function LoadingSkeleton() {
  return (
    <div className="gh-message gh-message--assistant" style={{ opacity: 0.6 }}>
      <span className="gh-message-avatar"><Leaf size={14} /></span>
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 0" }}>
          <span className="gh-typing"><span /><span /><span /></span>
          <small style={{ color: "var(--soft)", fontSize: 10 }}>GreenHaze is thinking...</small>
        </div>
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

function useChatHistory() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("greenhaze-chat") || "[]") as Message[]; } catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem("greenhaze-chat", JSON.stringify(messages)); }, [messages]);
  const reset = useCallback(() => setMessages([]), []);
  return { messages, setMessages, reset };
}

export default function Scan() {
  const [config, setConfig] = useState({ configured: false, allowScans: true, model: "" });
  useEffect(() => { void localApi.config().then(setConfig).catch(() => undefined); }, []);

  const { messages, setMessages, reset: resetChat } = useChatHistory();
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [report, setReport] = useState<{ plant: string; issue: string; confidence: number; explanation: string; recommendation: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming, report]);

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
    const next: Message[] = [...messages, { role: "user", text: text.trim(), ...(selectedImage ? { image: selectedImage } : {}) }];
    setMessages(next);
    setInput("");
    setImage(null);
    setStreaming("");
    setError("");
    setReport(null);
    setBusy(true);
    let output = "";
    try {
      await streamLocalChat(next, delta => { output += delta; setStreaming(output); });
      setMessages(current => [...current, { role: "assistant", text: output }]);
      if (readAloud && output) speak(output);
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

  function resetAll() {
    stopMic();
    window.speechSynthesis?.cancel();
    resetChat();
    setInput("");
    setImage(null);
    setStreaming("");
    setError("");
    setReport(null);
    setBusy(false);
  }

  return (
    <section className="gh-scan-page">
      <div className="gh-scan-ambient" />
      <div className="gh-chat-wrap">
        <div className="gh-scan-intro">
          <span className="gh-kicker"><Sparkles size={14} /> GreenHaze plant-care chat</span>
          <h1>Ask what your<br /><em>plant is saying.</em></h1>
          <p>Start with a photo, camera capture, voice note, or a simple question. Your conversation stays in this browser until you reset it.</p>
        </div>
        <div className="gh-chat-card">
          <header>
            <div className="gh-chat-title">
              <span><Leaf size={18} /></span>
              <div>
                <strong>Plant Care Chat</strong>
                <small>{config.configured ? "Online \u00b7 plant-care mode" : "Awaiting secure AI setup"}</small>
              </div>
            </div>
            <div className="gh-chat-head-actions">
              <button onClick={() => setReadAloud(!readAloud)} title="Read AI replies aloud">
                {readAloud ? <Volume2 size={15} /> : <VolumeX size={15} />}{readAloud ? "Voice on" : "Voice off"}
              </button>
              <button onClick={resetAll}><RefreshCw size={15} /> New chat</button>
            </div>
          </header>
          <div className="gh-chat-messages" role="log" aria-live="polite" aria-label="Chat conversation">
            <AnimatePresence initial={false}>
              {messages.length === 0 && !busy && <WelcomeCard onSend={(text) => void send(text)} />}
              {messages.map((message, index) => (
                <ChatMessage key={`${message.role}-${index}`} message={message} onSpeak={speak} />
              ))}
            </AnimatePresence>
            {busy && !streaming && <LoadingSkeleton />}
            {streaming && (
              <div className="gh-message gh-message--assistant">
                <span className="gh-message-avatar"><Leaf size={14} /></span>
                <div><Streamdown>{streaming}</Streamdown></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {error && <div className="gh-chat-error">{error}</div>}
          {report && <div style={{ padding: "0 19px" }}><AnalysisCard report={report} /></div>}
          <div className="gh-compose">
            {image && <ImagePreview src={image} onRemove={() => setImage(null)} />}
            <div className="gh-compose-row">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseFile} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={chooseFile} />
              <button onClick={() => fileRef.current?.click()} title="Upload photo"><ImagePlus size={16} /></button>
              <button onClick={() => cameraRef.current?.click()} title="Take photo"><Camera size={16} /></button>
              {microphoneAvailable && <button onClick={toggleMic} title={listening ? "Stop voice" : "Start voice"}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>}
              <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask about your plant..." />
              {image && <button className="gh-compose-analyze" onClick={() => void analyzeImage()} disabled={busy} title="Analyze image"><ScanSearch size={15} /> Analyze</button>}
              <button className="gh-compose-send" onClick={() => void send()} disabled={busy || (!input.trim() && !image)} title="Send"><Send size={15} /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() { return <span className="gh-mini-check">\u2713</span>; }
