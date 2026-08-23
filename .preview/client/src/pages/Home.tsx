import { motion } from "framer-motion";
import { ArrowRight, Check, Leaf, MessageCircleHeart, ScanSearch, ShieldCheck, Sparkles, Upload, Waves } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { localApi } from "@/lib/local-api";

const features = [
  { icon: Sparkles, title: "Instant AI analysis", text: "Turn a clear plant photo into a calm, useful next step in moments.", tone: "mint" },
  { icon: ScanSearch, title: "Leaf-level signals", text: "Explore likely disease, deficiency, watering, or pest signals without botanical jargon.", tone: "lime" },
  { icon: ShieldCheck, title: "Confidence, not certainty", text: "See how strongly the image supports an observation and when to ask an expert.", tone: "peach" },
  { icon: MessageCircleHeart, title: "Plant-care conversation", text: "Ask follow-up questions by text, voice, camera, or photo attachment.", tone: "sky" },
  { icon: Waves, title: "Gentle care rituals", text: "Save a simple watering cadence for the plants you already love.", tone: "sand" },
];

const steps = [
  { number: "01", icon: Upload, title: "Show us the signal", text: "Upload a well-lit photo, or begin with a question about what you are noticing." },
  { number: "02", icon: ScanSearch, title: "Read the pattern", text: "GreenHaze reviews visible details alongside the context you share." },
  { number: "03", icon: Sparkles, title: "Get a grounded report", text: "Receive a clear assessment, confidence level, and sensible next step." },
  { number: "04", icon: Check, title: "Care with intention", text: "Turn insight into a small action—and keep a gentle watering rhythm." },
];

const reveal = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.22 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } };

export default function Home() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [formState, setFormState] = useState<"idle" | "success" | "error">("idle");
  const [contactBusy, setContactBusy] = useState(false);

  useEffect(() => {
    const section = window.location.hash.replace("#", "");
    if (!section) return;
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormState("idle");
    try {
      setContactBusy(true);
      await localApi.contact(form);
      setForm({ name: "", email: "", message: "" });
      setFormState("success");
    } catch {
      setFormState("error");
    } finally {
      setContactBusy(false);
    }
  }

  return <div className="gh-home">
    <section className="gh-hero">
      <div className="gh-hero-glow gh-hero-glow--one" /><div className="gh-hero-glow gh-hero-glow--two" />
      <div className="gh-wrap gh-hero-grid">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }} className="gh-hero-copy">
          <span className="gh-kicker"><Leaf size={14} /> Plant care, with a clearer signal</span>
          <h1>Understand your plants.<br /><em>Protect their future.</em></h1>
          <p>GreenHaze makes thoughtful plant care feel more intuitive. Share a photo or question, then get a grounded, plain-language next step.</p>
          <div className="gh-action-row"><Link className="gh-btn gh-btn--primary" href="/scan">Scan your plant <ArrowRight size={17} /></Link><a className="gh-btn gh-btn--quiet" href="#how-it-works">See how it works <ArrowRight size={17} /></a></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.94, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.82, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} className="gh-hero-art" aria-label="Plant health signal illustration">
          <div className="gh-hero-plant"><div className="gh-orbit gh-orbit--one" /><div className="gh-orbit gh-orbit--two" /><span className="gh-stem" /><Leaf className="gh-leaf gh-leaf--one" fill="currentColor" /><Leaf className="gh-leaf gh-leaf--two" fill="currentColor" /><Leaf className="gh-leaf gh-leaf--three" fill="currentColor" /><span className="gh-scan-line" /><div className="gh-signal"><i /> Live plant signal <b>96% clear</b></div></div>
          <div className="gh-result-float"><span><Check size={16} /></span><div><small>Latest scan</small><strong>Monstera deliciosa</strong><b>Healthy · 96% confidence</b></div></div>
        </motion.div>
      </div>
    </section>

    <section id="how-it-works" className="gh-section gh-wrap"><motion.div {...reveal} className="gh-section-heading"><span className="gh-kicker">The quiet advantage</span><h2>Good care starts with<br /><em>a clearer signal.</em></h2><p>Most plant problems look alike at first. GreenHaze helps you notice the difference before a small symptom becomes a bigger setback.</p></motion.div><div className="gh-steps">{steps.map((step, index) => { const Icon = step.icon; return <motion.article key={step.number} {...reveal} transition={{ ...reveal.transition, delay: index * 0.07 }} className="gh-step"><span className="gh-step-no">{step.number}</span><div className="gh-step-icon"><Icon size={23} /></div><h3>{step.title}</h3><p>{step.text}</p></motion.article>; })}</div></section>

    <section id="features" className="gh-soft-section"><div className="gh-wrap"><motion.div {...reveal} className="gh-section-heading gh-section-heading--split"><div><span className="gh-kicker">Made for everyday care</span><h2>More observation.<br /><em>Less overwhelm.</em></h2></div><p>Small, useful insights that help you build a better relationship with the plants already around you.</p></motion.div><div className="gh-feature-grid">{features.map((feature, index) => { const Icon = feature.icon; return <motion.article key={feature.title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }} className={`gh-feature gh-feature--${feature.tone}`}><span>0{index + 1}</span><div><Icon size={24} /></div><h3>{feature.title}</h3><p>{feature.text}</p></motion.article>; })}</div></div></section>

    <section id="about" className="gh-section gh-wrap"><div className="gh-about"><motion.div {...reveal}><span className="gh-kicker">The idea behind GreenHaze</span><h2>Care should feel<br /><em>more intuitive.</em></h2><p>Our mission is simple: make it easier to notice plant problems early. A lack of specialist vocabulary should never keep someone from giving a plant the care it needs.</p><h3>The technology</h3><p>GreenHaze combines your photo or question with a plant-care-focused AI prompt. It offers useful hypotheses and recommended next steps, while being transparent about uncertainty.</p></motion.div><motion.div {...reveal} className="gh-about-art"><Leaf size={150} strokeWidth={1} /><div><Leaf size={17} /><strong>Grounded guidance</strong><span>Always show your work</span></div></motion.div></div></section>

    <section id="contact" className="gh-section gh-wrap gh-contact"><motion.div {...reveal}><span className="gh-kicker">Questions or partnerships</span><h2>Let's grow<br /><em>something better.</em></h2><p>Have a question about GreenHaze or want to work together? Send a note and it will reach the owner's admin inbox.</p></motion.div><motion.form {...reveal} onSubmit={submit} className="gh-contact-card"><label>Name<input required value={form.name} onChange={event => { setForm({ ...form, name: event.target.value }); setFormState("idle"); }} placeholder="Jane Doe" /></label><label>Email<input required type="email" value={form.email} onChange={event => { setForm({ ...form, email: event.target.value }); setFormState("idle"); }} placeholder="jane@example.com" /></label><label>Message<textarea required minLength={10} value={form.message} onChange={event => { setForm({ ...form, message: event.target.value }); setFormState("idle"); }} placeholder="How can we help?" /></label><button className="gh-btn gh-btn--primary" disabled={contactBusy}>{contactBusy ? "Sending…" : <>Send message <ArrowRight size={17} /></>}</button>{formState === "success" && <p className="gh-form-success">Thank you—your message is safely in the GreenHaze inbox.</p>}{formState === "error" && <p className="gh-form-error">We could not send your message. Please try again.</p>}</motion.form></section>
  </div>;
}
