import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Search, X, Trash2, ExternalLink, Pin, Download,
  RotateCcw, Clock, Globe, ArrowLeft, Loader2, CornerDownLeft,
  Lock, Unlock, Delete, KeyRound, ShieldCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Tokens — color encodes state, never decoration.
 * ------------------------------------------------------------------ */
const T = {
  ink: "#191621",
  slab: "#221E2C",
  slabUp: "#282234",
  edge: "#322C3F",
  paper: "#EDE9F2",
  ash: "#948CA5",
  ashDim: "#6B637C",
};

const STATUSES = [
  { id: "idea", label: "Idea", color: "#7C8CF8" },
  { id: "building", label: "Building", color: "#E5A03C" },
  { id: "live", label: "Live", color: "#4FC08D" },
  { id: "paused", label: "Paused", color: "#948CA5" },
  { id: "shelved", label: "Shelved", color: "#5C5468" },
];

const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[1];

const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const STORAGE_KEY = "dashboard:v1";
const LOCK_KEY = "dashboard:lock";

/* ------------------------------------------------------------------ *
 * PIN hashing — the PIN itself is never stored, only a salted digest.
 * ------------------------------------------------------------------ */
const PBKDF2_ITERATIONS = 150000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt() {
  const a = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(a);
  } else {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return bufToHex(a.buffer);
}

/* Only used where Web Crypto is unavailable, so the lock still functions. */
function weakHash(str) {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ c, 1597334677) >>> 0;
  }
  return "fb" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

async function derive(pin, saltHex) {
  const subtle = typeof window !== "undefined" && window.crypto && window.crypto.subtle;
  if (!subtle) return weakHash(pin + ":" + saltHex);
  try {
    const enc = new TextEncoder();
    const key = await subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      key,
      256
    );
    return bufToHex(bits);
  } catch {
    return weakHash(pin + ":" + saltHex);
  }
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const AUTO_LOCK_OPTIONS = [
  { ms: 0, label: "Never" },
  { ms: 60 * 1000, label: "1 min" },
  { ms: 5 * 60 * 1000, label: "5 min" },
  { ms: 15 * 60 * 1000, label: "15 min" },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 7) return d + "d ago";
  const w = Math.floor(d / 7);
  if (w < 5) return w + "w ago";
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + "mo ago";
  return Math.floor(d / 365) + "y ago";
}

function normalizeUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return "https://" + v;
}

function domainOf(raw) {
  const v = normalizeUrl(raw);
  if (!v) return "";
  try {
    return new URL(v).hostname.replace(/^www\./, "");
  } catch {
    return v.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

function blankProject(name = "Untitled project") {
  const now = Date.now();
  return {
    id: uid(),
    name,
    url: "",
    summary: "",
    status: "idea",
    progress: 0,
    tags: [],
    notes: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

const SAMPLE = [
  {
    ...blankProject("Ridgeline"),
    url: "https://ridgeline.example.com",
    summary: "Trail-condition tracker for the Ardennes. Community reports plus weather.",
    status: "live",
    progress: 82,
    tags: ["nextjs", "maps"],
    notes: [
      { id: uid(), at: Date.now() - 1000 * 60 * 60 * 30, text: "Shipped the report form. Three real submissions overnight — people are actually using it." },
      { id: uid(), at: Date.now() - 1000 * 60 * 60 * 24 * 6, text: "Swapped the tile provider, map loads ~400ms faster on mobile." },
    ],
  },
  {
    ...blankProject("Kettle"),
    url: "kettle.example.dev",
    summary: "Tiny invoicing tool for freelancers. One page, no login.",
    status: "building",
    progress: 45,
    tags: ["stripe", "side project"],
    notes: [
      { id: uid(), at: Date.now() - 1000 * 60 * 60 * 5, text: "PDF export works but the line-item totals round wrong on multi-currency. Fix next." },
    ],
  },
  {
    ...blankProject("Field Notes"),
    url: "",
    summary: "A place to write down what I learn each week. Not started properly yet.",
    status: "idea",
    progress: 8,
    tags: ["writing"],
    notes: [
      { id: uid(), at: Date.now() - 1000 * 60 * 60 * 24 * 12, text: "Bought the domain. That's the whole progress so far." },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */
async function loadState() {
  if (typeof window === "undefined" || !window.storage) return null;
  try {
    const res = await window.storage.get(STORAGE_KEY);
    if (res && res.value) return JSON.parse(res.value);
  } catch {
    /* first run — key doesn't exist yet */
  }
  return null;
}

async function saveState(payload) {
  if (typeof window === "undefined" || !window.storage) return false;
  try {
    const res = await window.storage.set(STORAGE_KEY, JSON.stringify(payload));
    return !!res;
  } catch {
    return false;
  }
}

async function loadLock() {
  if (typeof window === "undefined" || !window.storage) return null;
  try {
    const res = await window.storage.get(LOCK_KEY);
    if (res && res.value) return JSON.parse(res.value);
  } catch {
    /* no lock configured yet */
  }
  return null;
}

async function saveLock(record) {
  if (typeof window === "undefined" || !window.storage) return false;
  try {
    const res = await window.storage.set(LOCK_KEY, JSON.stringify(record));
    return !!res;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */
function Eyebrow({ children, style }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: T.ashDim,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function StatusDot({ id, size = 7 }) {
  const s = statusOf(id);
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: s.color }}
    />
  );
}

/* The signature element: the card's left edge is the gauge. */
function Spine({ progress, color }) {
  const pct = Math.max(0, Math.min(100, progress || 0));
  return (
    <div
      className="absolute top-0 left-0 h-full overflow-hidden"
      style={{ width: 3, background: T.edge }}
      aria-hidden="true"
    >
      <div
        className="absolute bottom-0 left-0 w-full spine-fill"
        style={{ height: pct + "%", background: color }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Project card
 * ------------------------------------------------------------------ */
function ProjectCard({ project, onOpen, onTogglePin }) {
  const s = statusOf(project.status);
  const latest = project.notes && project.notes.length ? project.notes[0] : null;
  const domain = domainOf(project.url);

  return (
    <div
      className="relative rounded-lg overflow-hidden cursor-pointer card-hover"
      style={{ background: T.slab, border: "1px solid " + T.edge }}
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(project.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <Spine progress={project.progress} color={s.color} />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="truncate"
              style={{
                fontFamily: SANS,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: T.paper,
                lineHeight: 1.25,
              }}
            >
              {project.name || "Untitled project"}
            </h3>

            <div className="flex items-center gap-2 mt-1.5 min-w-0">
              <StatusDot id={project.status} />
              <Eyebrow style={{ color: s.color }}>{s.label}</Eyebrow>
              {domain && (
                <>
                  <span style={{ color: T.edge }}>·</span>
                  <span
                    className="truncate"
                    style={{ fontFamily: MONO, fontSize: 11, color: T.ash }}
                  >
                    {domain}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              title={project.pinned ? "Unpin project" : "Pin to top"}
              className="p-1.5 rounded icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(project.id);
              }}
            >
              <Pin
                size={13}
                style={{
                  color: project.pinned ? "#E5A03C" : T.ashDim,
                  fill: project.pinned ? "#E5A03C" : "transparent",
                }}
              />
            </button>
            {project.url && (
              <a
                href={normalizeUrl(project.url)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open site"
                className="p-1.5 rounded icon-btn"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} style={{ color: T.ashDim }} />
              </a>
            )}
          </div>
        </div>

        {project.summary && (
          <p
            className="mt-2.5 line-clamp-2"
            style={{ fontFamily: SANS, fontSize: 13, color: T.ash, lineHeight: 1.55 }}
          >
            {project.summary}
          </p>
        )}

        <div
          className="mt-3.5 pt-3 flex items-start gap-2"
          style={{ borderTop: "1px solid " + T.edge }}
        >
          {latest ? (
            <>
              <Clock size={12} style={{ color: T.ashDim, marginTop: 2 }} className="shrink-0" />
              <p
                className="line-clamp-1 flex-1 min-w-0"
                style={{ fontFamily: SANS, fontSize: 12.5, color: T.ash }}
              >
                {latest.text}
              </p>
              <span
                className="shrink-0"
                style={{ fontFamily: MONO, fontSize: 10, color: T.ashDim }}
              >
                {timeAgo(latest.at)}
              </span>
            </>
          ) : (
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: T.ashDim }}>
              No log entries yet
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {(project.tags || []).slice(0, 3).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: T.ash,
                  background: T.ink,
                  border: "1px solid " + T.edge,
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <span
            className="shrink-0 tabular-nums"
            style={{ fontFamily: MONO, fontSize: 11, color: s.color, letterSpacing: "0.04em" }}
          >
            {Math.round(project.progress || 0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Detail drawer
 * ------------------------------------------------------------------ */
function Drawer({ project, onClose, onPatch, onDelete, onAddNote, onDeleteNote, autoFocusName }) {
  const [noteText, setNoteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagDraft, setTagDraft] = useState((project.tags || []).join(", "));
  const nameRef = useRef(null);

  useEffect(() => {
    setTagDraft((project.tags || []).join(", "));
    setConfirmDelete(false);
    setNoteText("");
  }, [project.id]);

  useEffect(() => {
    if (autoFocusName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [autoFocusName, project.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = statusOf(project.status);

  const submitNote = () => {
    const t = noteText.trim();
    if (!t) return;
    onAddNote(project.id, t);
    setNoteText("");
  };

  const field = {
    fontFamily: SANS,
    fontSize: 14,
    color: T.paper,
    background: T.ink,
    border: "1px solid " + T.edge,
    borderRadius: 6,
    outline: "none",
    width: "100%",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 backdrop-in" style={{ background: "rgba(10,8,14,0.6)" }} onClick={onClose} />

      <aside
        className="relative h-full w-full overflow-y-auto drawer-in scroll-area"
        style={{
          maxWidth: 560,
          background: T.slab,
          borderLeft: "1px solid " + T.edge,
        }}
      >
        {/* header */}
        <div
          className="sticky top-0 z-10 px-5 py-3 flex items-center justify-between gap-3"
          style={{ background: T.slab, borderBottom: "1px solid " + T.edge }}
        >
          <button onClick={onClose} className="flex items-center gap-2 p-1 rounded icon-btn">
            <ArrowLeft size={16} style={{ color: T.ash }} />
            <Eyebrow>Back to all projects</Eyebrow>
          </button>
          <div className="flex items-center gap-2">
            {project.url && (
              <a
                href={normalizeUrl(project.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded icon-btn"
                style={{ border: "1px solid " + T.edge }}
              >
                <Globe size={12} style={{ color: T.ash }} />
                <Eyebrow style={{ color: T.ash }}>Visit site</Eyebrow>
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded icon-btn">
              <X size={16} style={{ color: T.ash }} />
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          {/* name */}
          <input
            ref={nameRef}
            value={project.name}
            onChange={(e) => onPatch(project.id, { name: e.target.value })}
            placeholder="Project name"
            className="w-full bg-transparent outline-none"
            style={{
              fontFamily: SANS,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: T.paper,
              border: "none",
            }}
          />

          {/* url */}
          <div className="mt-2 flex items-center gap-2">
            <Globe size={13} style={{ color: T.ashDim }} className="shrink-0" />
            <input
              value={project.url}
              onChange={(e) => onPatch(project.id, { url: e.target.value })}
              placeholder="add-your-site.com"
              className="flex-1 bg-transparent outline-none"
              style={{ fontFamily: MONO, fontSize: 12.5, color: T.ash, border: "none" }}
            />
          </div>

          {/* status */}
          <div className="mt-6">
            <Eyebrow>Status</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUSES.map((st) => {
                const active = st.id === project.status;
                return (
                  <button
                    key={st.id}
                    onClick={() => onPatch(project.id, { status: st.id })}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors"
                    style={{
                      background: active ? st.color + "22" : "transparent",
                      border: "1px solid " + (active ? st.color + "66" : T.edge),
                    }}
                  >
                    <StatusDot id={st.id} size={6} />
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: active ? st.color : T.ash,
                      }}
                    >
                      {st.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* progress */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <Eyebrow>Progress</Eyebrow>
              <span
                className="tabular-nums"
                style={{ fontFamily: MONO, fontSize: 13, color: s.color }}
              >
                {Math.round(project.progress || 0)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={project.progress || 0}
              onChange={(e) => onPatch(project.id, { progress: Number(e.target.value) })}
              className="w-full mt-2.5"
              style={{ accentColor: s.color }}
            />
          </div>

          {/* summary */}
          <div className="mt-6">
            <Eyebrow>What it is</Eyebrow>
            <textarea
              value={project.summary}
              onChange={(e) => onPatch(project.id, { summary: e.target.value })}
              placeholder="One or two lines on what this project does."
              rows={3}
              className="mt-2 px-3 py-2.5 resize-none"
              style={{ ...field, lineHeight: 1.55 }}
            />
          </div>

          {/* tags */}
          <div className="mt-5">
            <Eyebrow>Tags</Eyebrow>
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={() =>
                onPatch(project.id, {
                  tags: tagDraft.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
                })
              }
              placeholder="nextjs, client work, revenue"
              className="mt-2 px-3 py-2"
              style={{ ...field, fontFamily: MONO, fontSize: 12.5 }}
            />
          </div>

          {/* progress log */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Progress log</Eyebrow>
              <Eyebrow>
                {(project.notes || []).length} {(project.notes || []).length === 1 ? "entry" : "entries"}
              </Eyebrow>
            </div>

            <div className="mt-2.5 relative">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitNote();
                  }
                }}
                placeholder="What moved today?"
                rows={3}
                className="px-3 py-2.5 resize-none"
                style={{ ...field, lineHeight: 1.55 }}
              />
              <div className="flex items-center justify-between mt-2">
                <Eyebrow style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <CornerDownLeft size={11} /> Cmd + Enter to save
                </Eyebrow>
                <button
                  onClick={submitNote}
                  disabled={!noteText.trim()}
                  className="px-3 py-1.5 rounded transition-opacity"
                  style={{
                    background: noteText.trim() ? T.paper : T.edge,
                    color: noteText.trim() ? T.ink : T.ashDim,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: noteText.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Add entry
                </button>
              </div>
            </div>

            <div className="mt-5">
              {(project.notes || []).length === 0 && (
                <p style={{ fontFamily: SANS, fontSize: 13, color: T.ashDim }}>
                  Nothing logged yet. The first entry is usually "started."
                </p>
              )}

              {(project.notes || []).map((n, i) => (
                <div key={n.id} className="relative pl-5 pb-5 group">
                  {i !== project.notes.length - 1 && (
                    <div
                      className="absolute left-0 top-3"
                      style={{ width: 1, background: T.edge, bottom: 0, marginLeft: 2.5 }}
                    />
                  )}
                  <div
                    className="absolute left-0 rounded-full"
                    style={{ width: 6, height: 6, background: s.color, top: 6 }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <Eyebrow>
                      {new Date(n.at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {"  ·  "}
                      {timeAgo(n.at)}
                    </Eyebrow>
                    <button
                      onClick={() => onDeleteNote(project.id, n.id)}
                      className="p-1 rounded icon-btn opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete entry"
                    >
                      <X size={11} style={{ color: T.ashDim }} />
                    </button>
                  </div>
                  <p
                    className="mt-1"
                    style={{ fontFamily: SANS, fontSize: 13.5, color: T.paper, lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                  >
                    {n.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* danger */}
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid " + T.edge }}>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: SANS, fontSize: 13, color: T.ash }}>
                  Delete this project and its log?
                </span>
                <button
                  onClick={() => onDelete(project.id)}
                  className="px-2.5 py-1 rounded"
                  style={{
                    background: "#E0616B",
                    color: T.ink,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded icon-btn">
                  <Eyebrow style={{ color: T.ash }}>Keep</Eyebrow>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 p-1 rounded icon-btn"
              >
                <Trash2 size={12} style={{ color: T.ashDim }} />
                <Eyebrow>Delete project</Eyebrow>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shared styles
 * ------------------------------------------------------------------ */
function Styles() {
  return (
    <style>{`
      ::placeholder { color: ${T.ashDim}; opacity: 1; }
      .scroll-area::-webkit-scrollbar { width: 8px; }
      .scroll-area::-webkit-scrollbar-track { background: transparent; }
      .scroll-area::-webkit-scrollbar-thumb { background: ${T.edge}; border-radius: 4px; }
      .icon-btn { transition: background-color .15s ease; }
      .icon-btn:hover { background: ${T.slabUp}; }
      .card-hover { transition: border-color .18s ease, transform .18s ease; }
      .card-hover:hover { border-color: ${T.ashDim} !important; transform: translateY(-2px); }
      .spine-fill { transition: height .3s cubic-bezier(.22,1,.36,1); }
      .drawer-in { animation: slideIn .26s cubic-bezier(.22,1,.36,1); }
      .backdrop-in { animation: fadeIn .2s ease; }
      .lock-in { animation: lockIn .32s cubic-bezier(.22,1,.36,1); }
      .keypad-btn { transition: background-color .12s ease, transform .08s ease; }
      .keypad-btn:hover { background: ${T.slabUp}; }
      .keypad-btn:active { transform: scale(.95); }
      .shake { animation: shake .38s cubic-bezier(.36,.07,.19,.97); }
      .dot-fill { transition: background-color .12s ease, transform .12s ease; }
      @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes lockIn { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
      @keyframes shake {
        10%, 90% { transform: translateX(-2px) }
        20%, 80% { transform: translateX(4px) }
        30%, 50%, 70% { transform: translateX(-7px) }
        40%, 60% { transform: translateX(7px) }
      }
      :focus-visible { outline: 2px solid ${T.paper}; outline-offset: 2px; border-radius: 4px; }
      input[type=range] { height: 3px; background: ${T.edge}; border-radius: 3px; appearance: none; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
        .card-hover:hover { transform: none }
      }
    `}</style>
  );
}

/* ------------------------------------------------------------------ *
 * Lock screen — setup, confirm, and unlock
 * ------------------------------------------------------------------ */
const MIN_PIN = 4;
const MAX_PIN = 8;

function LockScreen({ mode, pinLength, lockedUntil, onSubmit, onSkip, onCancel, onForgot }) {
  const [stage, setStage] = useState(mode === "setup" ? "choose" : "unlock");
  const [entry, setEntry] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  const cooling = !!lockedUntil && lockedUntil > now;
  const secondsLeft = cooling ? Math.ceil((lockedUntil - now) / 1000) : 0;

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const maxLen = stage === "unlock" ? pinLength : MAX_PIN;

  const submit = useCallback(
    async (value) => {
      const v = value === undefined ? entry : value;
      if (busy || cooling) return;

      if (stage === "choose") {
        if (v.length < MIN_PIN) {
          setError("Use at least " + MIN_PIN + " digits.");
          setShakeKey((k) => k + 1);
          return;
        }
        setFirst(v);
        setEntry("");
        setError("");
        setStage("confirm");
        return;
      }

      if (stage === "confirm") {
        if (v !== first) {
          setError("Those didn't match. Choose a PIN again.");
          setEntry("");
          setFirst("");
          setStage("choose");
          setShakeKey((k) => k + 1);
          return;
        }
        setBusy(true);
        await onSubmit(v);
        setBusy(false);
        return;
      }

      setBusy(true);
      const ok = await onSubmit(v);
      setBusy(false);
      if (!ok) {
        setError("That PIN didn't work.");
        setEntry("");
        setShakeKey((k) => k + 1);
      }
    },
    [entry, busy, cooling, stage, first, onSubmit]
  );

  const push = useCallback(
    (d) => {
      if (busy || cooling) return;
      setError("");
      setEntry((prev) => {
        if (prev.length >= maxLen) return prev;
        const next = prev + d;
        if (stage === "unlock" && next.length === pinLength) {
          setTimeout(() => submit(next), 60);
        }
        return next;
      });
    },
    [busy, cooling, maxLen, stage, pinLength, submit]
  );

  const back = useCallback(() => {
    if (busy || cooling) return;
    setError("");
    setEntry((prev) => prev.slice(0, -1));
  }, [busy, cooling]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      } else if (e.key === "Enter" && stage !== "unlock") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape" && onCancel) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push, back, submit, stage, onCancel]);

  const copy = {
    choose: {
      title: "Choose a PIN",
      sub: MIN_PIN + " to " + MAX_PIN + " digits. You'll enter it each time you open the dashboard.",
    },
    confirm: { title: "Enter it again", sub: "Confirming makes sure the first one wasn't a typo." },
    unlock: { title: "Enter your PIN", sub: "Your projects stay hidden until you do." },
  }[stage];

  const slots = stage === "unlock" ? pinLength : MAX_PIN;
  const canContinue = stage !== "unlock" && entry.length >= MIN_PIN;

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-10"
      style={{ background: T.ink, fontFamily: SANS }}
    >
      <Styles />
      <div className="w-full lock-in" style={{ maxWidth: 300 }}>
        <div className="flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 38, height: 38, background: T.slab, border: "1px solid " + T.edge }}
          >
            {stage === "unlock" ? (
              <Lock size={16} style={{ color: T.ash }} />
            ) : (
              <KeyRound size={16} style={{ color: T.ash }} />
            )}
          </div>

          <div className="mt-4">
            <Eyebrow>Project dashboard</Eyebrow>
          </div>
          <h1
            className="mt-1.5"
            style={{
              fontFamily: SANS,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: T.paper,
              lineHeight: 1.2,
            }}
          >
            {copy.title}
          </h1>
          <p className="mt-2" style={{ fontSize: 12.5, color: T.ash, lineHeight: 1.55 }}>
            {copy.sub}
          </p>
        </div>

        {/* dots */}
        <div key={shakeKey} className={"mt-7 flex items-center justify-center gap-2.5 " + (error ? "shake" : "")}>
          {Array.from({ length: slots }).map((_, i) => {
            const filled = i < entry.length;
            const optional = stage !== "unlock" && i >= MIN_PIN;
            return (
              <span
                key={i}
                className="rounded-full dot-fill"
                style={{
                  width: filled ? 10 : 8,
                  height: filled ? 10 : 8,
                  background: filled ? (error ? "#E0616B" : T.paper) : "transparent",
                  border: filled
                    ? "none"
                    : (optional ? "1px dashed " + T.edge : "1px solid " + T.edge),
                }}
              />
            );
          })}
        </div>

        {/* message line */}
        <div className="mt-3 h-5 flex items-center justify-center">
          {cooling ? (
            <Eyebrow style={{ color: "#E0616B" }}>
              Too many tries — wait {secondsLeft}s
            </Eyebrow>
          ) : error ? (
            <Eyebrow style={{ color: "#E0616B" }}>{error}</Eyebrow>
          ) : busy ? (
            <Loader2 size={13} className="animate-spin" style={{ color: T.ashDim }} />
          ) : null}
        </div>

        {/* keypad */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => push(k)}
              disabled={busy || cooling}
              className="rounded-lg keypad-btn"
              style={{
                height: 52,
                background: T.slab,
                border: "1px solid " + T.edge,
                fontFamily: MONO,
                fontSize: 18,
                color: busy || cooling ? T.ashDim : T.paper,
                cursor: busy || cooling ? "not-allowed" : "pointer",
              }}
            >
              {k}
            </button>
          ))}

          <button
            onClick={() => setEntry("")}
            disabled={busy || cooling || !entry}
            className="rounded-lg keypad-btn flex items-center justify-center"
            style={{
              height: 52,
              background: "transparent",
              border: "1px solid " + T.edge,
              cursor: entry && !busy && !cooling ? "pointer" : "not-allowed",
            }}
            title="Clear"
          >
            <Eyebrow style={{ color: entry ? T.ash : T.ashDim }}>Clear</Eyebrow>
          </button>

          <button
            onClick={() => push("0")}
            disabled={busy || cooling}
            className="rounded-lg keypad-btn"
            style={{
              height: 52,
              background: T.slab,
              border: "1px solid " + T.edge,
              fontFamily: MONO,
              fontSize: 18,
              color: busy || cooling ? T.ashDim : T.paper,
              cursor: busy || cooling ? "not-allowed" : "pointer",
            }}
          >
            0
          </button>

          <button
            onClick={back}
            disabled={busy || cooling || !entry}
            className="rounded-lg keypad-btn flex items-center justify-center"
            style={{
              height: 52,
              background: "transparent",
              border: "1px solid " + T.edge,
              cursor: entry && !busy && !cooling ? "pointer" : "not-allowed",
            }}
            title="Delete last digit"
          >
            <Delete size={16} style={{ color: entry ? T.ash : T.ashDim }} />
          </button>
        </div>

        {/* continue */}
        {stage !== "unlock" && (
          <button
            onClick={() => submit()}
            disabled={!canContinue || busy}
            className="w-full mt-3 rounded-lg"
            style={{
              height: 44,
              background: canContinue ? T.paper : T.slab,
              border: "1px solid " + (canContinue ? T.paper : T.edge),
              color: canContinue ? T.ink : T.ashDim,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: canContinue && !busy ? "pointer" : "not-allowed",
            }}
          >
            {stage === "choose" ? "Continue" : "Set PIN"}
          </button>
        )}

        {/* footer links */}
        <div className="mt-5 flex items-center justify-center gap-4">
          {onSkip && stage === "choose" && (
            <button onClick={onSkip} className="px-2 py-1 rounded icon-btn">
              <Eyebrow style={{ color: T.ash }}>Skip for now</Eyebrow>
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="px-2 py-1 rounded icon-btn">
              <Eyebrow style={{ color: T.ash }}>Cancel</Eyebrow>
            </button>
          )}
          {onForgot && stage === "unlock" && (
            <button onClick={onForgot} className="px-2 py-1 rounded icon-btn">
              <Eyebrow style={{ color: T.ashDim }}>Forgot your PIN?</Eyebrow>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Lock settings
 * ------------------------------------------------------------------ */
function LockSettings({ lock, onClose, onLockNow, onChangePin, onSetPin, onRemovePin, onSetAutoLock }) {
  const [confirmOff, setConfirmOff] = useState(false);
  const enabled = !!(lock && lock.enabled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 backdrop-in" style={{ background: "rgba(10,8,14,0.6)" }} onClick={onClose} />
      <div
        className="relative rounded-lg px-5 py-5 w-full"
        style={{ background: T.slab, border: "1px solid " + T.edge, maxWidth: 380 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Access</Eyebrow>
            <h3
              className="mt-1"
              style={{ fontSize: 17, fontWeight: 700, color: T.paper, letterSpacing: "-0.02em" }}
            >
              {enabled ? "PIN is on" : "PIN is off"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded icon-btn">
            <X size={15} style={{ color: T.ash }} />
          </button>
        </div>

        {enabled ? (
          <>
            <p className="mt-2" style={{ fontSize: 13, color: T.ash, lineHeight: 1.55 }}>
              Your {lock.len}-digit PIN is required before any project loads.
            </p>

            <div className="mt-5">
              <Eyebrow>Lock automatically after</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AUTO_LOCK_OPTIONS.map((o) => {
                  const active = (lock.autoLockMs || 0) === o.ms;
                  return (
                    <button
                      key={o.ms}
                      onClick={() => onSetAutoLock(o.ms)}
                      className="px-2.5 py-1.5 rounded transition-colors"
                      style={{
                        background: active ? T.slabUp : "transparent",
                        border: "1px solid " + (active ? T.ashDim : T.edge),
                      }}
                    >
                      <Eyebrow style={{ color: active ? T.paper : T.ashDim }}>{o.label}</Eyebrow>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={onLockNow}
                className="w-full flex items-center justify-center gap-2 rounded"
                style={{ height: 40, background: T.paper, color: T.ink }}
              >
                <Lock size={13} />
                <Eyebrow style={{ color: T.ink, fontWeight: 600 }}>Lock now</Eyebrow>
              </button>
              <button
                onClick={onChangePin}
                className="w-full flex items-center justify-center gap-2 rounded icon-btn"
                style={{ height: 40, border: "1px solid " + T.edge }}
              >
                <KeyRound size={13} style={{ color: T.ash }} />
                <Eyebrow style={{ color: T.ash }}>Change PIN</Eyebrow>
              </button>

              {confirmOff ? (
                <div
                  className="flex items-center gap-2 justify-between rounded px-3 py-2.5"
                  style={{ border: "1px solid " + T.edge }}
                >
                  <span style={{ fontSize: 12.5, color: T.ash }}>Turn the PIN off?</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onRemovePin}
                      className="px-2.5 py-1 rounded"
                      style={{ background: "#E0616B", color: T.ink }}
                    >
                      <Eyebrow style={{ color: T.ink }}>Turn off</Eyebrow>
                    </button>
                    <button onClick={() => setConfirmOff(false)} className="px-2 py-1 rounded icon-btn">
                      <Eyebrow style={{ color: T.ash }}>Keep</Eyebrow>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmOff(true)}
                  className="w-full flex items-center justify-center gap-2 rounded icon-btn"
                  style={{ height: 40, border: "1px solid " + T.edge }}
                >
                  <Unlock size={13} style={{ color: T.ashDim }} />
                  <Eyebrow>Turn off PIN</Eyebrow>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2" style={{ fontSize: 13, color: T.ash, lineHeight: 1.55 }}>
              Anyone who opens this dashboard can read your projects and log entries. A PIN keeps
              them out of sight.
            </p>
            <button
              onClick={onSetPin}
              className="w-full mt-5 flex items-center justify-center gap-2 rounded"
              style={{ height: 40, background: T.paper, color: T.ink }}
            >
              <ShieldCheck size={13} />
              <Eyebrow style={{ color: T.ink, fontWeight: 600 }}>Set a PIN</Eyebrow>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */
export default function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [autoFocusName, setAutoFocusName] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [confirmReset, setConfirmReset] = useState(false);

  const [phase, setPhase] = useState("boot"); // boot | setup | locked | unlocked
  const [lock, setLock] = useState(null);
  const [changingPin, setChangingPin] = useState(false);
  const [showLockSettings, setShowLockSettings] = useState(false);
  const [confirmForgot, setConfirmForgot] = useState(false);

  const searchRef = useRef(null);
  const hydrated = useRef(false);
  const lastActivity = useRef(Date.now());

  /* boot: read the lock record before touching any project data */
  useEffect(() => {
    let alive = true;
    (async () => {
      const rec = await loadLock();
      if (!alive) return;
      setLock(rec);
      if (!rec) setPhase("setup");
      else if (rec.enabled) setPhase("locked");
      else setPhase("unlocked");
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* projects load only once unlocked */
  useEffect(() => {
    if (phase !== "unlocked" || hydrated.current) return;
    let alive = true;
    (async () => {
      const data = await loadState();
      if (!alive) return;
      if (data && Array.isArray(data.projects)) setProjects(data.projects);
      setLoading(false);
      hydrated.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [phase]);

  /* auto-lock after a stretch of no activity */
  useEffect(() => {
    if (phase !== "unlocked" || !lock || !lock.enabled || !lock.autoLockMs) return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > lock.autoLockMs) setPhase("locked");
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [phase, lock]);

  /* persist on change, debounced */
  useEffect(() => {
    if (!hydrated.current) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await saveState({ projects, savedAt: Date.now() });
      setSaving(false);
    }, 450);
    return () => clearTimeout(t);
  }, [projects]);

  /* "/" focuses search */
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current && searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touch = (p) => ({ ...p, updatedAt: Date.now() });

  const patch = useCallback((id, changes) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? touch({ ...p, ...changes }) : p)));
  }, []);

  const addProject = () => {
    const p = blankProject();
    setProjects((prev) => [p, ...prev]);
    setOpenId(p.id);
    setAutoFocusName(true);
  };

  const removeProject = (id) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setOpenId(null);
  };

  const togglePin = (id) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)));
  };

  const addNote = (id, text) => {
    const note = { id: uid(), at: Date.now(), text };
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? touch({ ...p, notes: [note, ...(p.notes || [])] }) : p))
    );
  };

  const deleteNote = (pid, nid) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === pid ? touch({ ...p, notes: p.notes.filter((n) => n.id !== nid) }) : p))
    );
  };

  const loadSample = () => setProjects(SAMPLE);

  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify({ projects }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "projects-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* download unavailable in this context */
    }
  };

  const resetAll = async () => {
    setProjects([]);
    setConfirmReset(false);
    try {
      if (window.storage) await window.storage.delete(STORAGE_KEY);
    } catch {
      /* nothing stored yet */
    }
  };

  /* ---- PIN ---- */
  const handleSetPin = async (pin) => {
    const salt = randomSalt();
    const hash = await derive(pin, salt);
    const rec = {
      enabled: true,
      salt,
      hash,
      len: pin.length,
      fails: 0,
      lockedUntil: 0,
      autoLockMs: (lock && lock.autoLockMs) || 0,
    };
    setLock(rec);
    await saveLock(rec);
    lastActivity.current = Date.now();
    setChangingPin(false);
    setShowLockSettings(false);
    setPhase("unlocked");
  };

  const handleSkipPin = async () => {
    const rec = { enabled: false, autoLockMs: 0 };
    setLock(rec);
    await saveLock(rec);
    setPhase("unlocked");
  };

  const handleUnlock = async (pin) => {
    if (!lock || !lock.enabled) return false;
    if (lock.lockedUntil && lock.lockedUntil > Date.now()) return false;

    const hash = await derive(pin, lock.salt);
    if (safeEqual(hash, lock.hash)) {
      const rec = { ...lock, fails: 0, lockedUntil: 0 };
      setLock(rec);
      await saveLock(rec);
      lastActivity.current = Date.now();
      setPhase("unlocked");
      return true;
    }

    const fails = (lock.fails || 0) + 1;
    const lockedUntil =
      fails >= 5 ? Date.now() + Math.min(300000, 30000 * Math.pow(2, fails - 5)) : 0;
    const rec = { ...lock, fails, lockedUntil };
    setLock(rec);
    await saveLock(rec);
    return false;
  };

  const handleRemovePin = async () => {
    const rec = { enabled: false, autoLockMs: 0 };
    setLock(rec);
    await saveLock(rec);
    setShowLockSettings(false);
  };

  const handleSetAutoLock = async (ms) => {
    const rec = { ...(lock || { enabled: false }), autoLockMs: ms };
    setLock(rec);
    await saveLock(rec);
  };

  const handleForgotPin = async () => {
    try {
      if (window.storage) {
        await window.storage.delete(LOCK_KEY);
        await window.storage.delete(STORAGE_KEY);
      }
    } catch {
      /* nothing stored */
    }
    setProjects([]);
    setLock(null);
    setConfirmForgot(false);
    hydrated.current = false;
    setLoading(true);
    setPhase("setup");
  };

  /* derived */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.url,
        p.summary,
        (p.tags || []).join(" "),
        (p.notes || []).map((n) => n.text).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      if (sort === "progress") return (b.progress || 0) - (a.progress || 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return list;
  }, [projects, query, filter, sort]);

  const stats = useMemo(() => {
    const live = projects.filter((p) => p.status === "live").length;
    const active = projects.filter((p) => p.status === "building").length;
    const notes = projects.reduce((n, p) => n + (p.notes || []).length, 0);
    const week = Date.now() - 1000 * 60 * 60 * 24 * 7;
    const recent = projects.reduce(
      (n, p) => n + (p.notes || []).filter((x) => x.at > week).length,
      0
    );
    return { total: projects.length, live, active, notes, recent };
  }, [projects]);

  const open = projects.find((p) => p.id === openId) || null;

  const counts = useMemo(() => {
    const c = { all: projects.length };
    STATUSES.forEach((s) => {
      c[s.id] = projects.filter((p) => p.status === s.id).length;
    });
    return c;
  }, [projects]);

  /* ---- gates: nothing below renders until the dashboard is unlocked ---- */
  if (phase === "boot") {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: T.ink, fontFamily: SANS }}
      >
        <Styles />
        <Loader2 size={16} className="animate-spin" style={{ color: T.ashDim }} />
      </div>
    );
  }

  if (phase === "setup" || changingPin) {
    return (
      <LockScreen
        mode="setup"
        onSubmit={handleSetPin}
        onSkip={phase === "setup" && !changingPin ? handleSkipPin : null}
        onCancel={changingPin ? () => setChangingPin(false) : null}
      />
    );
  }

  if (phase === "locked") {
    return (
      <>
        <LockScreen
          mode="unlock"
          pinLength={(lock && lock.len) || 4}
          lockedUntil={lock && lock.lockedUntil}
          onSubmit={handleUnlock}
          onForgot={() => setConfirmForgot(true)}
        />
        {confirmForgot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            <div
              className="absolute inset-0 backdrop-in"
              style={{ background: "rgba(10,8,14,0.6)" }}
              onClick={() => setConfirmForgot(false)}
            />
            <div
              className="relative rounded-lg px-5 py-5 w-full"
              style={{ background: T.slab, border: "1px solid " + T.edge, maxWidth: 380 }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: T.paper, letterSpacing: "-0.02em" }}>
                No way back in
              </h3>
              <p className="mt-2" style={{ fontSize: 13.5, color: T.ash, lineHeight: 1.55 }}>
                The PIN can't be recovered. The only way past this screen is to erase everything —
                every project and log entry — and start fresh.
              </p>
              <div className="mt-5 flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmForgot(false)}
                  className="px-3 py-1.5 rounded icon-btn"
                  style={{ border: "1px solid " + T.edge }}
                >
                  <Eyebrow style={{ color: T.ash }}>Try again</Eyebrow>
                </button>
                <button
                  onClick={handleForgotPin}
                  className="px-3 py-1.5 rounded"
                  style={{ background: "#E0616B", color: T.ink }}
                >
                  <Eyebrow style={{ color: T.ink }}>Erase and start over</Eyebrow>
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: T.ink, fontFamily: SANS }}>
      <Styles />

      <div className="mx-auto px-5 py-8" style={{ maxWidth: 1080 }}>
        {/* ---- header ---- */}
        <header>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <Eyebrow>Project dashboard</Eyebrow>
              <h1
                className="mt-1"
                style={{
                  fontFamily: SANS,
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  color: T.paper,
                  lineHeight: 1.1,
                }}
              >
                Everything I&rsquo;m building
              </h1>
            </div>

            <button
              onClick={addProject}
              className="flex items-center gap-2 px-3.5 py-2 rounded"
              style={{ background: T.paper, color: T.ink }}
            >
              <Plus size={14} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Add project
              </span>
            </button>
          </div>

          {/* ledger strip */}
          <div
            className="mt-5 flex items-center gap-5 flex-wrap px-4 py-3 rounded-lg"
            style={{ background: T.slab, border: "1px solid " + T.edge }}
          >
            {[
              { k: "Tracked", v: stats.total },
              { k: "Live", v: stats.live, c: statusOf("live").color },
              { k: "Building", v: stats.active, c: statusOf("building").color },
              { k: "Log entries", v: stats.notes },
              { k: "This week", v: stats.recent },
            ].map((item) => (
              <div key={item.k} className="flex items-baseline gap-2">
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    color: item.c || T.paper,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {String(item.v).padStart(2, "0")}
                </span>
                <Eyebrow>{item.k}</Eyebrow>
              </div>
            ))}

            <div className="flex items-center gap-1 ml-auto">
              {saving && <Loader2 size={12} className="animate-spin" style={{ color: T.ashDim }} />}
              <button onClick={exportJson} title="Export as JSON" className="p-1.5 rounded icon-btn">
                <Download size={13} style={{ color: T.ashDim }} />
              </button>
              <button
                onClick={() => setConfirmReset(true)}
                title="Clear all data"
                className="p-1.5 rounded icon-btn"
              >
                <RotateCcw size={13} style={{ color: T.ashDim }} />
              </button>
            </div>
          </div>
        </header>

        {/* ---- controls ---- */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded flex-1"
            style={{ background: T.slab, border: "1px solid " + T.edge, minWidth: 220 }}
          >
            <Search size={14} style={{ color: T.ashDim }} className="shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, tags, log entries…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontFamily: SANS, fontSize: 13.5, color: T.paper, border: "none" }}
            />
            {query ? (
              <button onClick={() => setQuery("")} className="p-0.5 rounded icon-btn">
                <X size={13} style={{ color: T.ashDim }} />
              </button>
            ) : (
              <kbd
                className="px-1.5 rounded"
                style={{ fontFamily: MONO, fontSize: 10, color: T.ashDim, border: "1px solid " + T.edge }}
              >
                /
              </kbd>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { id: "updated", label: "Recent" },
              { id: "progress", label: "Progress" },
              { id: "name", label: "A–Z" },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => setSort(o.id)}
                className="px-2.5 py-1.5 rounded transition-colors"
                style={{
                  border: "1px solid " + (sort === o.id ? T.ashDim : T.edge),
                  background: sort === o.id ? T.slabUp : "transparent",
                }}
              >
                <Eyebrow style={{ color: sort === o.id ? T.paper : T.ashDim }}>{o.label}</Eyebrow>
              </button>
            ))}
          </div>
        </div>

        {/* status filters */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {[{ id: "all", label: "All", color: T.paper }, ...STATUSES].map((f) => {
            const active = filter === f.id;
            const n = counts[f.id] || 0;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors"
                style={{
                  background: active ? f.color + "1F" : "transparent",
                  border: "1px solid " + (active ? f.color + "55" : T.edge),
                }}
              >
                {f.id !== "all" && <StatusDot id={f.id} size={6} />}
                <Eyebrow style={{ color: active ? f.color : T.ashDim }}>{f.label}</Eyebrow>
                <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 10, color: T.ashDim }}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- body ---- */}
        <main className="mt-5 pb-16">
          {loading ? (
            <div className="flex items-center gap-2 py-16 justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: T.ashDim }} />
              <Eyebrow>Loading your projects</Eyebrow>
            </div>
          ) : projects.length === 0 ? (
            <div
              className="rounded-lg px-6 py-14 text-center"
              style={{ background: T.slab, border: "1px dashed " + T.edge }}
            >
              <h2
                style={{
                  fontFamily: SANS,
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: T.paper,
                }}
              >
                Nothing tracked yet
              </h2>
              <p className="mt-2" style={{ fontSize: 13.5, color: T.ash, lineHeight: 1.6 }}>
                Add a project, paste its URL, then log a line every time something moves.
                <br />
                Your entries stay saved between visits.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={addProject}
                  className="flex items-center gap-2 px-3.5 py-2 rounded"
                  style={{ background: T.paper, color: T.ink }}
                >
                  <Plus size={14} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    Add your first project
                  </span>
                </button>
                <button
                  onClick={loadSample}
                  className="px-3.5 py-2 rounded icon-btn"
                  style={{ border: "1px solid " + T.edge }}
                >
                  <Eyebrow style={{ color: T.ash }}>See it with examples</Eyebrow>
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <p style={{ fontSize: 14, color: T.ash }}>No projects match that.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-3 px-3 py-1.5 rounded icon-btn"
                style={{ border: "1px solid " + T.edge }}
              >
                <Eyebrow style={{ color: T.ash }}>Clear filters</Eyebrow>
              </button>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={(id) => {
                    setOpenId(id);
                    setAutoFocusName(false);
                  }}
                  onTogglePin={togglePin}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {open && (
        <Drawer
          project={open}
          autoFocusName={autoFocusName}
          onClose={() => {
            setOpenId(null);
            setAutoFocusName(false);
          }}
          onPatch={patch}
          onDelete={removeProject}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
        />
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <div
            className="absolute inset-0 backdrop-in"
            style={{ background: "rgba(10,8,14,0.6)" }}
            onClick={() => setConfirmReset(false)}
          />
          <div
            className="relative rounded-lg px-5 py-5 w-full"
            style={{ background: T.slab, border: "1px solid " + T.edge, maxWidth: 380 }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: T.paper, letterSpacing: "-0.02em" }}>
              Clear all data?
            </h3>
            <p className="mt-2" style={{ fontSize: 13.5, color: T.ash, lineHeight: 1.55 }}>
              This removes every project and log entry. Export a copy first if you want to keep it.
            </p>
            <div className="mt-5 flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded icon-btn"
                style={{ border: "1px solid " + T.edge }}
              >
                <Eyebrow style={{ color: T.ash }}>Keep my data</Eyebrow>
              </button>
              <button
                onClick={resetAll}
                className="px-3 py-1.5 rounded"
                style={{ background: "#E0616B", color: T.ink }}
              >
                <Eyebrow style={{ color: T.ink }}>Clear everything</Eyebrow>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
