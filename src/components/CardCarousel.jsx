// Card carousel with the same look as Case detail / Project detail: one card per section, neighbours
// peeking and faded, a header strip per card, round arrows (left/right on desktop, up/down on phones),
// native scroll-snap (swipe / trackpad) and lazy mounting of each section's content.
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

const arrowStyle = { position: "absolute", zIndex: 10, width: 32, height: 32, borderRadius: "50%", border: "1.5px solid var(--t-arrow-border)",
  background: "var(--t-arrow-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)" };

/**
 * slides: [{ id, label, Icon, content, badge? }] · storageKey: remembers the last section
 * footer(id): optional node rendered at the bottom of that card · height: card height on desktop
 */
export function CardCarousel({ slides, storageKey, footer, height = 720, active: activeProp, onActiveChange }) {
  const [activeInner, setActiveInner] = useState(() => {
    try { const k = storageKey && localStorage.getItem(storageKey); return slides.some(s => s.id === k) ? k : slides[0]?.id; } catch { return slides[0]?.id; }
  });
  // Controlled (active + onActiveChange) or uncontrolled.
  const active = activeProp ?? activeInner;
  const setActive = id => { if (onActiveChange) onActiveChange(id); else setActiveInner(id); };
  const [mounted, setMounted] = useState(() => new Set([active]));
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const ref = useRef(null);
  const scrolling = useRef(false);
  const idx = Math.max(0, slides.findIndex(s => s.id === active));

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scroll the active card into the centre (or top on phones); mount its content.
  useEffect(() => {
    setMounted(prev => (prev.has(active) ? prev : new Set(prev).add(active)));
    try { storageKey && localStorage.setItem(storageKey, active); } catch {}
    const el = ref.current;
    const slide = el?.children[idx];
    if (!slide) return;
    scrolling.current = true;     // programmatic scroll: ignore it until it settles
    if (isMobile) el.scrollTo({ top: slide.offsetTop, behavior: "smooth" });
    else el.scrollTo({ left: slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2, behavior: "smooth" });
    const tid = setTimeout(() => { scrolling.current = false; }, 1500);   // fallback if no scroll happened
    return () => clearTimeout(tid);
  }, [active, idx, isMobile, storageKey]);

  const go = i => setActive(slides[Math.max(0, Math.min(i, slides.length - 1))]?.id ?? active);

  // Pick the centred card only once scrolling has stopped (smooth scrolls across many cards take a while).
  const settle = useRef(null);
  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(pickCentred, 140);
  }
  function pickCentred() {
    if (scrolling.current) { scrolling.current = false; return; }
    const el = ref.current;
    if (!el) return;
    let closest = 0, min = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const d = isMobile
        ? Math.abs(child.offsetTop + child.offsetHeight / 2 - (el.scrollTop + el.offsetHeight / 2))
        : Math.abs(child.offsetLeft + child.offsetWidth / 2 - (el.scrollLeft + el.offsetWidth / 2));
      if (d < min) { min = d; closest = i; }
    });
    const s = slides[closest];
    if (s && s.id !== active) setActive(s.id);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Section pills (quick jump) */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: isMobile ? "0 4px 10px" : "0 60px 12px" }}>
        {slides.map((s, i) => {
          const on = i === idx;
          return (
            <button key={s.id} onClick={() => go(i)}
              style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap",
                border: `1px solid ${on ? "var(--t-border-active)" : "var(--t-pill-inactive-bdr)"}`, background: on ? "var(--t-tab-active)" : "var(--t-tab-inactive)",
                color: on ? "var(--t-text-accent)" : "var(--t-text2)", transition: "all .15s" }}>
              <s.Icon size={11} />{s.label}
            </button>
          );
        })}
      </div>

      {isMobile ? (
        <>
          {idx > 0 && <button onClick={() => go(idx - 1)} aria-label="Previous" style={{ ...arrowStyle, top: 52, left: "50%", transform: "translateX(-50%)" }}><ChevronUp size={16} style={{ color: "var(--t-text2)" }} /></button>}
          {idx < slides.length - 1 && <button onClick={() => go(idx + 1)} aria-label="Next" style={{ ...arrowStyle, bottom: 8, left: "50%", transform: "translateX(-50%)" }}><ChevronDown size={16} style={{ color: "var(--t-text2)" }} /></button>}
        </>
      ) : (
        <>
          {idx > 0 && <button onClick={() => go(idx - 1)} aria-label="Previous" style={{ ...arrowStyle, left: 8, top: "50%", transform: "translateY(-50%)", marginTop: 20 }}><ChevronLeft size={16} style={{ color: "var(--t-text2)" }} /></button>}
          {idx < slides.length - 1 && <button onClick={() => go(idx + 1)} aria-label="Next" style={{ ...arrowStyle, right: 8, top: "50%", transform: "translateY(-50%)", marginTop: 20 }}><ChevronRight size={16} style={{ color: "var(--t-text2)" }} /></button>}
        </>
      )}

      <div ref={ref} onScroll={onScroll}
        style={isMobile
          ? { display: "flex", flexDirection: "column", overflowY: "scroll", overflowX: "hidden", scrollSnapType: "y mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", gap: 12, padding: "44px 0", maxHeight: "80vh" }
          : { display: "flex", overflowX: "scroll", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", gap: 10, padding: "0 60px" }}>
        {slides.map((s, i) => {
          const on = i === idx;
          return (
            <div key={s.id}
              style={isMobile
                ? { flex: "0 0 auto", width: "100%", minWidth: 0, overflow: "hidden", scrollSnapAlign: "start", scrollSnapStop: "always", opacity: on ? 1 : 0.85, transition: "opacity .25s" }
                : { flex: "0 0 calc(100% - 120px)", width: "calc(100% - 120px)", maxWidth: "calc(100% - 120px)", minWidth: 0, overflow: "hidden", scrollSnapAlign: "center", scrollSnapStop: "always",
                    opacity: on ? 1 : 0.5, transform: on ? "scale(1)" : "scale(0.97)", transition: "opacity .25s, transform .25s" }}>
              <div style={{ borderRadius: 12, border: `1px solid ${on ? "var(--t-border-active)" : "var(--t-border)"}`, background: "var(--t-card-bg)", overflow: "hidden", width: "100%",
                boxSizing: "border-box", height: isMobile ? undefined : height, minHeight: isMobile ? 400 : undefined, display: "flex", flexDirection: "column",
                boxShadow: on ? "0 4px 20px rgba(0,0,0,.12)" : "none", transition: "box-shadow .25s" }}>
                {/* Card header */}
                <div onClick={() => !on && go(i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--t-tab-border)", background: on ? "var(--t-tab-active)" : "var(--t-tab-inactive)", flexShrink: 0, cursor: on ? "default" : "pointer" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#3B82F6" : "var(--t-badge-inact-bg)", flexShrink: 0, marginRight: 2 }} />
                  <s.Icon size={13} style={{ color: on ? "var(--t-text-accent)" : "var(--t-text2)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: on ? "var(--t-text)" : "var(--t-text2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--t-text2)" }}>{i + 1}/{slides.length}</span>
                </div>
                {/* Content */}
                {mounted.has(s.id) ? (
                  <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", color: "var(--t-text)" }}>
                    {s.content}
                    {footer?.(s.id)}
                  </div>
                ) : <div style={{ flex: 1 }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
