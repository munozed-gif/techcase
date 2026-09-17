import { useEffect, useState } from "react";

// ─── Nova Logo Mark ─────────────────────────────────────────────────────────
// Module-level injection so the keyframe is available even when LandingView isn't mounted
if (typeof document !== 'undefined') {
  let _kf = document.getElementById('nova-lmark-kf');
  if (!_kf) { _kf = document.createElement('style'); _kf.id = 'nova-lmark-kf'; document.head.appendChild(_kf); }
  _kf.textContent = `@keyframes nova-lmark {
  from { transform: rotate(var(--nls,0deg)) translateX(var(--nlr,10px)) rotate(calc(-1*var(--nls,0deg))); }
  to   { transform: rotate(calc(var(--nls,0deg)+360deg)) translateX(var(--nlr,10px)) rotate(calc(-1*(var(--nls,0deg)+360deg))); }
}`;
}

const _NOVA_ORBS = [
  { s:   0, r: 54, d:  9, z: 13, c: '#2563EB', gr: 7, gc: 'rgba(37,99,235,0.55)' },
  { s: 195, r: 54, d:  9, z: 10, c: '#60A5FA', gr: 5, gc: 'rgba(96,165,250,0.45)' },
  { s: 100, r: 74, d: 16, z: 11, c: '#3B82F6', gr: 6, gc: 'rgba(59,130,246,0.45)' },
  { s: 280, r: 74, d: 16, z:  8, c: '#93C5FD', gr: 4, gc: 'rgba(147,197,253,0.4)' },
];
export function NovaLandingMark({ size = 28 }) {
  const sc = size / 152;
  const orb = Math.round(52 * sc);
  const d1  = Math.round(108 * sc);
  const d2  = Math.round(148 * sc);
  const fs  = Math.max(8, Math.round(30 * sc));
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{ position:'absolute', top:'50%', left:'50%', width:d1, height:d1, marginTop:-d1/2, marginLeft:-d1/2, borderRadius:'50%', border:'1px solid rgba(79,110,247,0.35)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', width:d2, height:d2, marginTop:-d2/2, marginLeft:-d2/2, borderRadius:'50%', border:'1px solid rgba(79,110,247,0.18)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:orb, height:orb, borderRadius:'50%', background:'radial-gradient(circle at 36% 33%,#4F6EF7 0%,#0D1F3C 78%)', boxShadow:`0 2px 10px rgba(79,110,247,0.55)`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, color:'#fff', fontSize:fs, zIndex:10, userSelect:'none', letterSpacing:'-.04em' }}>A</div>
      {_NOVA_ORBS.slice(0, 3).map((o, i) => {
        const r = Math.max(4, Math.round(o.r * sc));
        const z = Math.max(3, Math.round(o.z * sc));
        const gr = Math.max(2, Math.round(o.gr * sc));
        return (
          <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0, animation:`nova-lmark ${o.d}s linear infinite`, '--nls':`${o.s}deg`, '--nlr':`${r}px`, zIndex:2 }}>
            <div style={{ position:'absolute', width:z, height:z, top:-z/2, left:-z/2, borderRadius:'50%', background:o.c, boxShadow:`0 0 ${gr}px ${o.gc}` }} />
          </div>
        );
      })}
    </div>
  );
}

// GALEA MANDALORIA — kept for reference / external use
// bg prop matches the surface the SVG sits on (T-visor fill must match background)
export function GaleaMark({ size = 22, bg = "#0B0F1A" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 82" fill="none" style={{overflow:"visible",flexShrink:0}}>
      {/* Helmet body — Corinthian proportions */}
      <path d="M14 66 L14 40 Q14 8 40 8 Q66 8 66 40 L66 66 Q66 75 57 76 L23 76 Q14 75 14 66 Z"
            fill="rgba(79,110,247,.12)" stroke="#4F6EF7" strokeWidth="2.2"/>
      {/* Crown top accent */}
      <path d="M30 8 Q40 3 50 8" stroke="#C9922A" strokeWidth="2.2" strokeLinecap="round"/>
      {/* Brow ridge — Roman gold */}
      <path d="M15 41 Q40 33 65 41" stroke="#C9922A" strokeWidth="2" strokeLinecap="round"/>
      {/* T-Visor horizontal eye bar — Mandalorian */}
      <path d="M15 43 L65 43 L65 53 L15 53 Z" fill={bg}/>
      {/* T-Visor vertical stem */}
      <path d="M36 53 L44 53 L44 69 L36 69 Z" fill={bg}/>
      {/* Visor gold outline — Mandalorian glow */}
      <line x1="15" y1="43" x2="65" y2="43" stroke="#C9922A" strokeWidth="1.4" opacity=".5"/>
      <path d="M15 53 L36 53 L36 69 L44 69 L44 53 L65 53" stroke="#C9922A" strokeWidth="1.4" fill="none" opacity=".5"/>
      {/* Amber inner glow hairlines */}
      <path d="M16 44 L64 44" stroke="#E8B84B" strokeWidth=".7" opacity=".4"/>
      <line x1="40" y1="54" x2="40" y2="68" stroke="#E8B84B" strokeWidth=".7" opacity=".3"/>
      {/* Cheek guard accent lines — Corinthian heritage */}
      <path d="M14 55 Q16 63 20 68" stroke="#C9922A" strokeWidth="1.4" strokeLinecap="round" opacity=".65"/>
      <path d="M66 55 Q64 63 60 68" stroke="#C9922A" strokeWidth="1.4" strokeLinecap="round" opacity=".65"/>
      {/* Inner dome depth lines */}
      <path d="M22 66 Q22 72 30 73" stroke="#4F6EF7" strokeWidth="1" opacity=".35" strokeLinecap="round"/>
      <path d="M58 66 Q58 72 50 73" stroke="#4F6EF7" strokeWidth="1" opacity=".35" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Landing-page bilingual strings (en / es) ───────────────────────────────
const LANDING_STRINGS = {
  en: {
    nav_arena:"Arena", nav_features:"Features", nav_lifecycle:"Lifecycle",
    nav_roles:"Roles", nav_pricing:"Pricing", nav_signin:"Sign in", nav_start:"Get started →",
    lang_btn:"ES",
    hero_badge:"Arena · Consultant Marketplace · 2026",
    hero_name:"Solutions Platform",
    hero_h1a:"Connect. Engage.", hero_h1b:"Deliver.",
    hero_sub:"Arena is the orbital marketplace at the heart of our platform — connecting clients with vetted SAP consultants through a visual, intelligent, team-based workflow. From first contact to final delivery.",
    hero_trial:"Start free trial →", hero_demo:"▶ Watch demo",
    hero_trust:"1,200+ consultants matched across 340+ companies",
    stats_cases:"Cases managed to date", stats_cos:"Companies onboarded", stats_sla:"% SLA compliance rate",
    feat_tag:"Platform Features",
    feat_h2a:"Everything a consulting team needs.", feat_h2b:"Nothing it doesn't.",
    feat_sub:"From the first support ticket to final delivery — Arena orchestrates every step with structured lifecycles, role-based access, and full auditability.",
    f1t:"Structured Case Lifecycles", f1d:"Every ticket follows a governed pipeline. Transition gates block premature moves; role permissions control who can advance each stage.",
    f2t:"Consultant Marketplace", f2d:"Browse verified SAP consultants by skill, rate, and availability. Apply, shortlist, compare, and assign — all in one place.",
    f3t:"Project Management", f3d:"Group cases under client projects with budgets, milestones, and inherited lifecycle templates. Full visibility from kickoff to closure.",
    f4t:"Time Logging & Approval", f4d:"Consultants log hours per case. Managers approve or query. Billing reports export instantly, reconciled with SLA thresholds.",
    f5t:"AI-Powered Specifications", f5d:"Claude generates functional specs from case context. Clients approve, consultants build to them. Full traceability from requirement to resolution.",
    f6t:"Transition Gates & SLA", f6d:"Block or warn on stage transitions until conditions are met. SLA timers run per lifecycle phase. Never miss a commitment again.",
    arena_tag:"Arena · Principal Feature",
    arena_h2:"Your orbital talent marketplace.",
    arena_sub:"Arena is the command center for connecting clients with the right SAP consultants — through an immersive, visual orbital interface that brings the entire talent network to life.",
    ab1t:"Galaxy Explorer", ab1d:"Navigate clients, cases, and consultants through an animated orbital system. Click any node to drill into their universe.",
    ab2t:"Team Applications", ab2d:"Form consulting teams, assign roles with skill validation, and apply to open cases as a unit — not just solo.",
    ab3t:"Smart Matching", ab3d:"Skill-to-role enforcement ensures only qualified consultants are assigned. AI auto-suggests the best fit from your team.",
    ab4t:"Live Discovery", ab4d:"Radar pulse animations signal active opportunity scanning. New cases surface in real time across your orbital network.",
    lc_tag:"Lifecycle Engine", lc_h2:"One platform, every kind of support.",
    lc_sub:"Pre-built lifecycle templates for SAP support and IT help desk — or build your own with custom stages, gates, and role rules.",
    roles_tag:"Role-Based Platform", roles_h2:"Built for every stakeholder.",
    roles_sub:"Each role gets exactly the right view, permissions, and tools.",
    r1n:"Manager",    r1d:"Full oversight of cases, projects, consultants, and billing. Approves time, transitions, and specs.",    r1p:["All cases","Approve time","Reports","Invoicing"],
    r2n:"Client",     r2d:"Creates cases, tracks project progress, approves specs, views reports, and manages invoices.",           r2p:["Create cases","Approve specs","Lifecycle view"],
    r3n:"Consultant", r3d:"Works on assigned cases, logs time, adds activities, uploads documents, and submits specs.",            r3p:["Log time","Activities","Docs upload"],
    r4n:"Internal Consultant", r4d:"Senior capacity: access to internal specs, dev plan generation, and advanced activity editing.", r4p:["Dev plans","Internal docs","All activities"],
    r5n:"Key User",   r5d:"Client-side power user who validates testing phases, approves specs, and manages team signups.",        r5p:["Testing stage","Approve specs","Team signup"],
    r6n:"Project Manager", r6d:"Cross-project visibility, time approval, lifecycle configuration, and full reporting access.",    r6p:["All projects","Approve time","Reports"],
    r7n:"Final User", r7d:"End users who submit tickets, track status, and view documentation relevant to their cases.",           r7p:["View docs","Lifecycle view","Comments"],
    r8n:"Headhunter", r8d:"Staffing specialists who can apply to open cases and match consultants to client requirements.",        r8p:["Apply to cases","Arena access"],
    video_tag:"See it in action", video_h2:"Watch the platform in 3 minutes.",
    video_sub:"From ticket creation to resolution — see how Arena guides every stakeholder through a structured, governed process.",
    video_lbl:"Arena Solutions Platform Demo · 3:24",
    testi_tag:"Customer Stories", testi_h2:"What teams are saying.",
    pricing_tag:"Pricing", pricing_h2:"Simple, honest pricing.",
    pricing_sub:"No hidden seats, no module add-ons. One plan, one price, full platform access per team size.",
    p1n:"Starter", p1period:"Up to 10 users · billed annually",
    p1f:["2 lifecycle templates","Unlimited cases & projects","Time logging & approval","Basic SLA tracking","Document management"],
    p2n:"Professional", p2period:"Up to 50 users · billed annually", p2badge:"Most popular",
    p2f:["Unlimited lifecycle templates","AI-powered specifications","Consultant marketplace (Arena)","Advanced SLA & transition gates","Full reporting & billing export","Role-based access control"],
    p3n:"Enterprise", p3period:"Unlimited users · dedicated support", p3custom:"Custom",
    p3f:["Everything in Professional","SAP BTP / S/4HANA integration","Custom lifecycle builder","SSO & advanced security","Dedicated customer success","SLA uptime guarantee"],
    btn_start:"Get started", btn_trial:"Start free trial", btn_contact:"Contact sales",
    cta_tag:"Get started today",
    cta_h2:"Ready to transform your SAP support operation?",
    cta_p:"14-day free trial. No credit card. Full platform access from day one.",
    trusted_by:"Trusted by",
    footer_tagline:"The operating system for SAP consulting teams. Structured support, every stage governed, every role in sync.",
    f_product:"Product", f_company:"Company", f_legal:"Legal",
    f_arena:"Arena Marketplace", f_features:"Features", f_lifecycle:"Lifecycle Engine", f_roles:"Roles", f_pricing:"Pricing",
    f_about:"About", f_blog:"Blog", f_careers:"Careers", f_contact:"Contact",
    f_privacy:"Privacy Policy", f_terms:"Terms of Service", f_security:"Security",
    copy1:"© 2026 Arena Solutions Platform. All rights reserved.",
    copy2:"Built for SAP consulting teams worldwide.",
  },
  es: {
    nav_arena:"Arena", nav_features:"Características", nav_lifecycle:"Ciclo de Vida",
    nav_roles:"Roles", nav_pricing:"Precios", nav_signin:"Iniciar sesión", nav_start:"Comenzar →",
    lang_btn:"EN",
    hero_badge:"Arena · Mercado de Consultores · 2026",
    hero_name:"Plataforma de Soluciones",
    hero_h1a:"Conecta. Involucra.", hero_h1b:"Entrega.",
    hero_sub:"Arena es el mercado orbital en el centro de nuestra plataforma — conectando clientes con consultores SAP verificados a través de un flujo de trabajo visual, inteligente y basado en equipos. Desde el primer contacto hasta la entrega final.",
    hero_trial:"Iniciar prueba gratuita →", hero_demo:"▶ Ver demo",
    hero_trust:"Más de 1,200 consultores asignados en más de 340 empresas",
    stats_cases:"Casos gestionados hasta la fecha", stats_cos:"Empresas registradas", stats_sla:"% tasa de cumplimiento SLA",
    feat_tag:"Características de la Plataforma",
    feat_h2a:"Todo lo que un equipo de consultoría necesita.", feat_h2b:"Nada más.",
    feat_sub:"Desde el primer ticket de soporte hasta la entrega final — Arena orquesta cada paso con ciclos de vida estructurados, acceso basado en roles y trazabilidad completa.",
    f1t:"Ciclos de Vida Estructurados", f1d:"Cada ticket sigue una cadena gobernada. Las puertas de transición bloquean movimientos prematuros; los permisos controlan quién puede avanzar cada etapa.",
    f2t:"Mercado de Consultores", f2d:"Explora consultores SAP verificados por habilidad, tarifa y disponibilidad. Aplica, preselecciona, compara y asigna — todo en un solo lugar.",
    f3t:"Gestión de Proyectos", f3d:"Agrupa casos bajo proyectos con presupuestos, hitos y plantillas heredadas. Visibilidad total desde el inicio hasta el cierre.",
    f4t:"Registro de Tiempo y Aprobación", f4d:"Los consultores registran horas por caso. Los gerentes aprueban. Los reportes se exportan al instante, conciliados con los umbrales SLA.",
    f5t:"Especificaciones con IA", f5d:"Claude genera especificaciones funcionales del contexto del caso. Los clientes aprueban, los consultores construyen. Trazabilidad completa.",
    f6t:"Puertas de Transición y SLA", f6d:"Bloquea o advierte en transiciones hasta que se cumplan las condiciones. Los temporizadores SLA corren por fase. Nunca pierdas un compromiso.",
    arena_tag:"Arena · Característica Principal",
    arena_h2:"Tu mercado de talento orbital.",
    arena_sub:"Arena es el centro de comando para conectar clientes con los consultores SAP adecuados — a través de una interfaz orbital visual e inmersiva que da vida a toda la red de talento.",
    ab1t:"Galaxy Explorer", ab1d:"Navega clientes, casos y consultores a través de un sistema orbital animado. Haz clic en cualquier nodo para explorar su universo.",
    ab2t:"Aplicaciones en Equipo", ab2d:"Forma equipos de consultoría, asigna roles con validación de habilidades y aplica a casos abiertos como unidad.",
    ab3t:"Asignación Inteligente", ab3d:"La aplicación de habilidades por rol garantiza que solo se asignen consultores calificados. La IA sugiere automáticamente el mejor candidato.",
    ab4t:"Descubrimiento en Vivo", ab4d:"Las animaciones de pulso radar señalan el escaneo activo de oportunidades. Nuevos casos emergen en tiempo real en tu red orbital.",
    lc_tag:"Motor de Ciclo de Vida", lc_h2:"Una plataforma, todo tipo de soporte.",
    lc_sub:"Plantillas de ciclo de vida preconfiguradas para soporte SAP y mesa de ayuda de TI — o crea las tuyas con etapas, puertas y reglas de rol personalizadas.",
    roles_tag:"Plataforma Basada en Roles", roles_h2:"Construida para cada parte interesada.",
    roles_sub:"Cada rol obtiene exactamente la vista, los permisos y las herramientas correctas.",
    r1n:"Gerente",    r1d:"Supervisión completa de casos, proyectos, consultores y facturación. Aprueba tiempo, transiciones y especificaciones.", r1p:["Todos los casos","Aprobar tiempo","Reportes","Facturación"],
    r2n:"Cliente",    r2d:"Crea casos, hace seguimiento del progreso, aprueba especificaciones, ve reportes y gestiona facturas.",               r2p:["Crear casos","Aprobar espec.","Vista de ciclo"],
    r3n:"Consultor",  r3d:"Trabaja en casos asignados, registra tiempo, agrega actividades, sube documentos y envía especificaciones.",         r3p:["Registrar tiempo","Actividades","Subir docs"],
    r4n:"Consultor Interno", r4d:"Capacidad senior: acceso a especificaciones internas, generación de planes de desarrollo y edición avanzada.", r4p:["Planes de dev","Docs internos","Todas las act."],
    r5n:"Usuario Clave", r5d:"Usuario avanzado del lado del cliente que valida fases de prueba, aprueba especificaciones y gestiona registros.", r5p:["Etapa de pruebas","Aprobar espec.","Registro de equipo"],
    r6n:"Gerente de Proyecto", r6d:"Visibilidad entre proyectos, aprobación de tiempo, configuración de ciclos de vida y acceso completo a reportes.", r6p:["Todos los proyectos","Aprobar tiempo","Reportes"],
    r7n:"Usuario Final", r7d:"Usuarios finales que envían tickets, rastrean el estado y ven documentación relevante para sus casos.",             r7p:["Ver docs","Vista de ciclo","Comentarios"],
    r8n:"Headhunter",  r8d:"Especialistas en personal que pueden aplicar a casos abiertos y asignar consultores a los requisitos del cliente.",  r8p:["Aplicar a casos","Acceso Arena"],
    video_tag:"Míralo en acción", video_h2:"Mira la plataforma en 3 minutos.",
    video_sub:"Desde la creación del ticket hasta la resolución — ve cómo Arena guía a cada parte interesada a través de un proceso estructurado y gobernado.",
    video_lbl:"Demo de Arena Solutions Platform · 3:24",
    testi_tag:"Historias de Clientes", testi_h2:"Lo que dicen los equipos.",
    pricing_tag:"Precios", pricing_h2:"Precios simples y honestos.",
    pricing_sub:"Sin asientos ocultos ni módulos adicionales. Un plan, un precio, acceso completo a la plataforma por tamaño de equipo.",
    p1n:"Básico", p1period:"Hasta 10 usuarios · facturado anualmente",
    p1f:["2 plantillas de ciclo de vida","Casos y proyectos ilimitados","Registro de tiempo y aprobación","Seguimiento básico de SLA","Gestión de documentos"],
    p2n:"Profesional", p2period:"Hasta 50 usuarios · facturado anualmente", p2badge:"Más popular",
    p2f:["Plantillas de ciclo de vida ilimitadas","Especificaciones con IA","Mercado de consultores (Arena)","SLA avanzado y puertas de transición","Exportación de reportes y facturación","Control de acceso basado en roles"],
    p3n:"Empresa", p3period:"Usuarios ilimitados · soporte dedicado", p3custom:"Personalizado",
    p3f:["Todo en Profesional","Integración SAP BTP / S/4HANA","Constructor de ciclo de vida personalizado","SSO y seguridad avanzada","Éxito del cliente dedicado","Garantía de disponibilidad SLA"],
    btn_start:"Comenzar", btn_trial:"Iniciar prueba gratuita", btn_contact:"Contactar ventas",
    cta_tag:"Comienza hoy",
    cta_h2:"¿Listo para transformar tu operación de soporte SAP?",
    cta_p:"14 días de prueba gratuita. Sin tarjeta de crédito. Acceso completo desde el primer día.",
    trusted_by:"Con la confianza de",
    footer_tagline:"El sistema operativo para equipos de consultoría SAP. Soporte estructurado, cada etapa gobernada, cada rol sincronizado.",
    f_product:"Producto", f_company:"Empresa", f_legal:"Legal",
    f_arena:"Mercado Arena", f_features:"Características", f_lifecycle:"Motor de Ciclo de Vida", f_roles:"Roles", f_pricing:"Precios",
    f_about:"Nosotros", f_blog:"Blog", f_careers:"Empleos", f_contact:"Contacto",
    f_privacy:"Política de Privacidad", f_terms:"Términos de Servicio", f_security:"Seguridad",
    copy1:"© 2026 Arena Solutions Platform. Todos los derechos reservados.",
    copy2:"Construido para equipos de consultoría SAP en todo el mundo.",
  },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes nova-lmark {
  from { transform: rotate(var(--nls,0deg)) translateX(var(--nlr,10px)) rotate(calc(-1*var(--nls,0deg))); }
  to   { transform: rotate(calc(var(--nls,0deg)+360deg)) translateX(var(--nlr,10px)) rotate(calc(-1*(var(--nls,0deg)+360deg))); }
}
@keyframes arena-orb {
  from { transform: rotate(var(--as,0deg)) translateX(var(--ar,60px)) rotate(calc(-1*var(--as,0deg))); }
  to   { transform: rotate(calc(var(--as,0deg)+360deg)) translateX(var(--ar,60px)) rotate(calc(-1*(var(--as,0deg)+360deg))); }
}
#arena-landing {position:fixed;inset:0;overflow-y:auto;z-index:9999;font-family:'Inter',system-ui,sans-serif;background:#F8FAFF;color:#0B0F1A;line-height:1.6;}
#arena-landing *,#arena-landing *::before,#arena-landing *::after{box-sizing:border-box;margin:0;padding:0;}
#arena-landing a{color:inherit;text-decoration:none;}
#arena-landing img{max-width:100%;}
:root{--accent:#4F6EF7;--accent-d:#3A56D4;--emerald:#10B981;--amber:#F59E0B;--rose:#EF4444;--muted:#64748B;--border:#E2E8F0;--surface:#fff;--surface2:#F1F5FE;--ink:#0B0F1A;--base:#F8FAFF;}
#arena-landing nav{position:sticky;top:0;left:0;right:0;z-index:100;padding:0 24px;background:rgba(11,15,26,.93);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;height:60px;transition:height .2s;}
#arena-landing .nav-logo{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;color:#fff;letter-spacing:-.02em;display:flex;align-items:center;gap:8px;}
#arena-landing .logo-arena{font-size:1.45rem;color:var(--accent);letter-spacing:-.04em;}
#arena-landing .logo-rest{font-size:.85rem;font-weight:600;color:rgba(255,255,255,.6);}
#arena-landing .nav-links{display:flex;align-items:center;gap:28px;}
#arena-landing .nav-links a{font-size:.85rem;font-weight:500;color:rgba(255,255,255,.7);transition:color .2s;}
#arena-landing .nav-links a:hover{color:#fff;}
#arena-landing .nav-cta{display:flex;align-items:center;gap:10px;}
#arena-landing .btn-ghost{font-size:.85rem;font-weight:600;color:rgba(255,255,255,.8);padding:7px 16px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:transparent;cursor:pointer;transition:all .2s;}
#arena-landing .btn-ghost:hover{background:rgba(255,255,255,.08);color:#fff;}
#arena-landing .btn-primary{font-size:.85rem;font-weight:700;color:#fff;background:var(--accent);padding:7px 18px;border-radius:8px;border:none;cursor:pointer;transition:all .2s;}
#arena-landing .btn-primary:hover{background:var(--accent-d);transform:translateY(-1px);}
@media(max-width:700px){#arena-landing .nav-links{display:none;}}

#arena-landing .hero{min-height:100vh;background:linear-gradient(135deg,#0B0F1A 0%,#111829 50%,#0D1630 100%);display:flex;align-items:center;padding:100px 24px 60px;position:relative;overflow:hidden;}
#arena-landing .hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(79,110,247,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.06) 1px,transparent 1px);background-size:48px 48px;}
#arena-landing .hero-glow{position:absolute;top:-200px;right:-200px;width:700px;height:700px;background:radial-gradient(circle,rgba(79,110,247,.15) 0%,transparent 70%);pointer-events:none;}
#arena-landing .hero-glow2{position:absolute;bottom:-100px;left:-100px;width:400px;height:400px;background:radial-gradient(circle,rgba(16,185,129,.08) 0%,transparent 70%);pointer-events:none;}
#arena-landing .hero-inner{max-width:1200px;margin:0 auto;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;position:relative;z-index:1;}
#arena-landing .hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(79,110,247,.12);border:1px solid rgba(79,110,247,.3);color:#A5B4FC;font-size:.75rem;font-weight:600;letter-spacing:.05em;padding:5px 12px;border-radius:20px;margin-bottom:24px;}
#arena-landing .hero-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);display:block;}
#arena-landing .hero-name{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(1rem,2vw,1.35rem);font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.02em;margin-bottom:4px;}
#arena-landing h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(2.4rem,5vw,3.8rem);font-weight:800;line-height:1.1;letter-spacing:-.04em;color:#fff;text-wrap:balance;margin-bottom:20px;}
#arena-landing h1 em{font-style:normal;color:var(--accent);}
#arena-landing .hero-sub{font-size:1.05rem;color:rgba(255,255,255,.6);line-height:1.7;max-width:440px;margin-bottom:36px;}
#arena-landing .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:40px;}
#arena-landing .btn-hero{font-family:'Plus Jakarta Sans',sans-serif;font-size:.95rem;font-weight:700;padding:13px 28px;border-radius:10px;display:inline-flex;align-items:center;gap:8px;transition:all .2s;border:none;cursor:pointer;}
#arena-landing .btn-hero-primary{background:var(--accent);color:#fff;}
#arena-landing .btn-hero-primary:hover{background:var(--accent-d);transform:translateY(-2px);box-shadow:0 8px 24px rgba(79,110,247,.35);}
#arena-landing .btn-hero-outline{background:transparent;color:rgba(255,255,255,.85);border:1.5px solid rgba(255,255,255,.2);}
#arena-landing .btn-hero-outline:hover{background:rgba(255,255,255,.06);}
#arena-landing .hero-trust{display:flex;align-items:center;gap:12px;font-size:.78rem;color:rgba(255,255,255,.4);}
#arena-landing .hero-trust-dots{display:flex;}
#arena-landing .avatar-dot{width:28px;height:28px;border-radius:50%;border:2px solid rgba(11,15,26,.8);background:linear-gradient(135deg,#4F6EF7,#818CF8);display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#fff;margin-left:-8px;}
#arena-landing .avatar-dot:first-child{margin-left:0;}
#arena-landing .browser-wrap{position:relative;}
#arena-landing .browser{background:#1a2035;border-radius:14px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);transform:perspective(1000px) rotateY(-5deg) rotateX(2deg);}
#arena-landing .browser-bar{background:#111625;padding:10px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.06);}
#arena-landing .browser-dots{display:flex;gap:5px;}
#arena-landing .browser-dots span{width:10px;height:10px;border-radius:50%;}
#arena-landing .browser-dots span:nth-child(1){background:#EF4444;}
#arena-landing .browser-dots span:nth-child(2){background:#F59E0B;}
#arena-landing .browser-dots span:nth-child(3){background:#10B981;}
#arena-landing .browser-url{flex:1;background:rgba(255,255,255,.05);border-radius:6px;padding:4px 10px;font-family:'JetBrains Mono',monospace;font-size:.7rem;color:rgba(255,255,255,.3);}
#arena-landing .browser-content{padding:16px;background:#0f1624;}
#arena-landing .mock-pipeline{display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none;}
#arena-landing .mock-stage{flex:0 0 auto;padding:6px 12px;border-radius:8px;font-size:.65rem;font-weight:600;border:1.5px solid;white-space:nowrap;}
#arena-landing .mock-stage.done{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3);color:#6EE7B7;}
#arena-landing .mock-stage.active{background:rgba(79,110,247,.15);border-color:rgba(79,110,247,.5);color:#A5B4FC;transform:scale(1.05);}
#arena-landing .mock-stage.future{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.3);}
#arena-landing .mock-card{background:#1a2237;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;}
#arena-landing .mock-card-title{font-size:.8rem;font-weight:600;color:#fff;margin-bottom:6px;}
#arena-landing .mock-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
#arena-landing .mock-chip{font-size:.6rem;font-weight:600;padding:2px 8px;border-radius:4px;}
#arena-landing .chip-blue{background:rgba(79,110,247,.15);color:#A5B4FC;}
#arena-landing .chip-green{background:rgba(16,185,129,.15);color:#6EE7B7;}
#arena-landing .chip-amber{background:rgba(245,158,11,.15);color:#FCD34D;}
#arena-landing .chip-red{background:rgba(239,68,68,.15);color:#FCA5A5;}
#arena-landing .mock-progress{height:4px;background:rgba(255,255,255,.07);border-radius:2px;margin-bottom:10px;}
#arena-landing .mock-progress-bar{height:100%;border-radius:2px;background:linear-gradient(90deg,#4F6EF7,#818CF8);}
#arena-landing .mock-row{display:flex;justify-content:space-between;align-items:center;font-size:.65rem;color:rgba(255,255,255,.4);}
#arena-landing .mock-avatar-row{display:flex;}
#arena-landing .mock-av{width:20px;height:20px;border-radius:50%;border:1.5px solid #0f1624;background:linear-gradient(135deg,#4F6EF7,#818CF8);display:flex;align-items:center;justify-content:center;font-size:.5rem;color:#fff;font-weight:700;margin-left:-4px;}
#arena-landing .mock-av:first-child{margin-left:0;}
#arena-landing .mock-sidebar{display:flex;gap:10px;margin-top:12px;}
#arena-landing .mock-sidebar-item{flex:1;background:#111625;border-radius:8px;padding:10px;border:1px solid rgba(255,255,255,.06);}
#arena-landing .mock-sidebar-label{font-size:.55rem;color:rgba(255,255,255,.3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em;}
#arena-landing .mock-sidebar-value{font-size:.75rem;font-weight:700;color:#fff;}
@media(max-width:900px){#arena-landing .hero-inner{grid-template-columns:1fr;}#arena-landing .browser-wrap{display:none;}}

#arena-landing .logo-strip{background:#0B0F1A;padding:24px 0;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);}
#arena-landing .logo-strip-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;padding:0 24px;}
#arena-landing .logo-strip-label{font-size:.72rem;font-weight:600;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.08em;margin-right:16px;}
#arena-landing .logo-company{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:.9rem;color:rgba(255,255,255,.35);padding:8px 18px;border:1px solid rgba(255,255,255,.08);border-radius:8px;transition:color .2s;}
#arena-landing .logo-company:hover{color:rgba(255,255,255,.7);}

#arena-landing .stats{background:var(--surface2);padding:64px 24px;border-bottom:1px solid var(--border);}
#arena-landing .stats-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:32px;}
#arena-landing .stat-item{text-align:center;}
#arena-landing .stat-num{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(2.8rem,5vw,4.5rem);font-weight:800;letter-spacing:-.04em;color:var(--accent);font-variant-numeric:tabular-nums;line-height:1;}
#arena-landing .stat-label{font-size:.85rem;color:var(--muted);margin-top:6px;font-weight:500;}
@media(max-width:600px){#arena-landing .stats-inner{grid-template-columns:1fr;}}

#arena-landing .section{padding:96px 24px;}
#arena-landing .section-inner{max-width:1200px;margin:0 auto;}
#arena-landing .section-tag{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:12px;}
#arena-landing h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(1.8rem,3.5vw,2.8rem);font-weight:800;letter-spacing:-.03em;line-height:1.15;text-wrap:balance;margin-bottom:16px;color:var(--ink);}
#arena-landing .section-sub{font-size:1.05rem;color:var(--muted);max-width:520px;line-height:1.7;margin-bottom:48px;}

#arena-landing .features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
#arena-landing .feat-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:transform .2s,box-shadow .2s;}
#arena-landing .feat-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.08);}
#arena-landing .feat-mockup{background:#0f1624;padding:16px;border-bottom:1px solid rgba(255,255,255,.06);min-height:130px;}
#arena-landing .feat-body{padding:18px;}
#arena-landing .feat-icon{width:36px;height:36px;border-radius:8px;background:rgba(79,110,247,.1);display:flex;align-items:center;justify-content:center;margin-bottom:10px;font-size:1.1rem;}
#arena-landing .feat-title{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1rem;margin-bottom:6px;color:var(--ink);}
#arena-landing .feat-desc{font-size:.83rem;color:var(--muted);line-height:1.6;}
@media(max-width:900px){#arena-landing .features-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:600px){#arena-landing .features-grid{grid-template-columns:1fr;}}

#arena-landing .lifecycle-section{background:#0B0F1A;padding:96px 24px;position:relative;overflow:hidden;}
#arena-landing .lifecycle-section::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(79,110,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.04) 1px,transparent 1px);background-size:48px 48px;}
#arena-landing .lifecycle-inner{max-width:1200px;margin:0 auto;position:relative;z-index:1;}
#arena-landing .lifecycle-inner h2{color:#fff;}
#arena-landing .lifecycle-inner .section-sub{color:rgba(255,255,255,.5);}
#arena-landing .pipeline-scroll{overflow-x:auto;scrollbar-width:none;padding-bottom:8px;}
#arena-landing .pipeline-track{display:flex;gap:0;min-width:max-content;}
#arena-landing .pipe-stage{display:flex;flex-direction:column;align-items:center;position:relative;}
#arena-landing .pipe-stage::after{content:'→';position:absolute;right:-18px;top:28px;color:rgba(255,255,255,.2);font-size:1rem;z-index:1;}
#arena-landing .pipe-stage:last-child::after{display:none;}
#arena-landing .pipe-dot{width:56px;height:56px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.75rem;margin-bottom:10px;margin-right:36px;position:relative;z-index:2;transition:transform .2s;}
#arena-landing .pipe-dot:hover{transform:scale(1.1);}
#arena-landing .pipe-label{font-size:.65rem;font-weight:600;color:rgba(255,255,255,.5);text-align:center;margin-right:36px;}
#arena-landing .lc-cards{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:48px;}
#arena-landing .lc-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:20px;}
#arena-landing .lc-card-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:.95rem;color:#fff;margin-bottom:4px;}
#arena-landing .lc-card-desc{font-size:.8rem;color:rgba(255,255,255,.4);}
#arena-landing .lc-card-stages{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px;}
#arena-landing .lc-chip{font-size:.6rem;font-weight:600;padding:3px 8px;border-radius:5px;border:1px solid;white-space:nowrap;}
@media(max-width:700px){#arena-landing .lc-cards{grid-template-columns:1fr;}}

#arena-landing .roles-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
#arena-landing .role-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;transition:transform .2s,box-shadow .2s;}
#arena-landing .role-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.07);}
#arena-landing .role-avatar{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:12px;}
#arena-landing .role-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:.9rem;margin-bottom:4px;color:var(--ink);}
#arena-landing .role-desc{font-size:.78rem;color:var(--muted);line-height:1.5;}
#arena-landing .role-perms{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;}
#arena-landing .role-perm{font-size:.58rem;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--muted);}
@media(max-width:900px){#arena-landing .roles-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:500px){#arena-landing .roles-grid{grid-template-columns:1fr;}}

#arena-landing .video-section{background:var(--surface2);padding:96px 24px;}
#arena-landing .video-wrap{max-width:900px;margin:0 auto;background:#0B0F1A;border-radius:20px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.2);aspect-ratio:16/9;position:relative;cursor:pointer;}
#arena-landing .video-inner{position:absolute;inset:0;background:linear-gradient(135deg,#0B0F1A,#1a2237);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;}
#arena-landing .video-grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(79,110,247,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.05) 1px,transparent 1px);background-size:40px 40px;}
#arena-landing .video-overlay-text{position:relative;z-index:1;text-align:center;}
#arena-landing .play-btn{width:72px;height:72px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 12px rgba(79,110,247,.15),0 0 0 24px rgba(79,110,247,.07);transition:transform .2s,box-shadow .2s;position:relative;z-index:1;}
#arena-landing .play-btn:hover{transform:scale(1.08);box-shadow:0 0 0 16px rgba(79,110,247,.2),0 0 0 32px rgba(79,110,247,.08);}
#arena-landing .video-label{color:rgba(255,255,255,.6);font-size:.85rem;margin-top:16px;position:relative;z-index:1;}

#arena-landing .testimonials-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
#arena-landing .testi-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;}
#arena-landing .testi-quote{font-size:.9rem;color:var(--ink);line-height:1.7;margin-bottom:20px;font-style:italic;}
#arena-landing .testi-author{display:flex;align-items:center;gap:12px;}
#arena-landing .testi-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4F6EF7,#818CF8);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;color:#fff;flex-shrink:0;}
#arena-landing .testi-name{font-weight:700;font-size:.85rem;color:var(--ink);}
#arena-landing .testi-role{font-size:.75rem;color:var(--muted);}
#arena-landing .testi-company{font-size:.72rem;color:var(--accent);font-weight:600;}
#arena-landing .stars{color:#F59E0B;font-size:.8rem;margin-bottom:12px;letter-spacing:1px;}
@media(max-width:900px){#arena-landing .testimonials-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:600px){#arena-landing .testimonials-grid{grid-template-columns:1fr;}}

#arena-landing .pricing-section{background:var(--surface2);padding:96px 24px;}
#arena-landing .pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto;}
#arena-landing .price-card{background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:28px;position:relative;transition:transform .2s,box-shadow .2s;}
#arena-landing .price-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.08);}
#arena-landing .price-card.featured{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}
#arena-landing .price-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:.7rem;font-weight:700;padding:3px 12px;border-radius:12px;}
#arena-landing .price-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1rem;color:var(--ink);margin-bottom:8px;}
#arena-landing .price-amount{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:2.4rem;letter-spacing:-.04em;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1;}
#arena-landing .price-amount small{font-size:1rem;font-weight:500;color:var(--muted);}
#arena-landing .price-period{font-size:.78rem;color:var(--muted);margin-bottom:20px;}
#arena-landing .price-features{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:24px;}
#arena-landing .price-features li{font-size:.83rem;color:var(--muted);display:flex;align-items:center;gap:8px;}
#arena-landing .price-features li::before{content:'✓';color:var(--emerald);font-weight:700;flex-shrink:0;}
#arena-landing .price-cta{display:block;text-align:center;padding:11px;border-radius:10px;font-weight:700;font-size:.9rem;transition:all .2s;border:none;cursor:pointer;width:100%;}
#arena-landing .price-cta-outline{border:1.5px solid var(--border) !important;color:var(--ink);background:transparent;}
#arena-landing .price-cta-outline:hover{background:var(--surface2);}
#arena-landing .price-cta-filled{background:var(--accent);color:#fff;}
#arena-landing .price-cta-filled:hover{background:var(--accent-d);transform:translateY(-1px);}
@media(max-width:800px){#arena-landing .pricing-grid{grid-template-columns:1fr;max-width:400px;}}

#arena-landing .arena-showcase{background:#060c16;padding:96px 24px;position:relative;overflow:hidden;}
#arena-landing .arena-showcase::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle at 65% 50%,rgba(37,99,235,.12) 0%,transparent 65%),linear-gradient(rgba(37,99,235,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.04) 1px,transparent 1px);background-size:100% 100%,48px 48px,48px 48px;}
#arena-landing .arena-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;position:relative;z-index:1;}
#arena-landing .arena-tag{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#60A5FA;margin-bottom:16px;}
#arena-landing .arena-inner h2{color:#fff;margin-bottom:16px;}
#arena-landing .arena-inner .section-sub{color:rgba(255,255,255,.5);margin-bottom:32px;}
#arena-landing .arena-bullets{display:flex;flex-direction:column;gap:14px;}
#arena-landing .arena-bullet{display:flex;align-items:flex-start;gap:12px;padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;transition:border-color .2s;}
#arena-landing .arena-bullet:hover{border-color:rgba(37,99,235,.35);}
#arena-landing .arena-bullet-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;}
#arena-landing .arena-bullet-text strong{display:block;font-size:.88rem;font-weight:700;color:#fff;margin-bottom:3px;}
#arena-landing .arena-bullet-text span{font-size:.78rem;color:rgba(255,255,255,.45);line-height:1.5;}
#arena-landing .arena-visual{display:flex;align-items:center;justify-content:center;}
#arena-landing .arena-system{position:relative;width:380px;height:380px;flex-shrink:0;}
#arena-landing .arena-ring{position:absolute;top:50%;left:50%;border-radius:50%;pointer-events:none;}
#arena-landing .arena-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 36% 33%,#4F6EF7 0%,#0D1F3C 78%);box-shadow:0 0 0 8px rgba(79,110,247,.12),0 6px 28px rgba(79,110,247,.5);display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;color:#fff;z-index:10;user-select:none;letter-spacing:-.03em;}
#arena-landing .arena-dot{position:absolute;top:50%;left:50%;width:0;height:0;}
#arena-landing .arena-dot-inner{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.5rem;font-weight:700;color:#fff;}
#arena-landing .arena-label{position:absolute;font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;}
@media(max-width:900px){#arena-landing .arena-inner{grid-template-columns:1fr;}#arena-landing .arena-visual{display:none;}}

#arena-landing .cta-section{background:linear-gradient(135deg,#0B0F1A,#111829);padding:100px 24px;text-align:center;position:relative;overflow:hidden;}
#arena-landing .cta-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:300px;background:radial-gradient(ellipse,rgba(79,110,247,.15) 0%,transparent 70%);pointer-events:none;}
#arena-landing .cta-section h2{color:#fff;max-width:560px;margin:0 auto 16px;position:relative;z-index:1;}
#arena-landing .cta-section p{color:rgba(255,255,255,.5);margin-bottom:36px;position:relative;z-index:1;}
#arena-landing .cta-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative;z-index:1;}

#arena-landing footer{background:#060910;padding:48px 24px 32px;border-top:1px solid rgba(255,255,255,.05);}
#arena-landing .footer-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;}
#arena-landing .footer-logo{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;color:#fff;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
#arena-landing .footer-logo .logo-arena{font-size:1.4rem;color:var(--accent);letter-spacing:-.04em;}
#arena-landing .footer-logo .logo-rest{font-size:.82rem;font-weight:600;color:rgba(255,255,255,.5);}
#arena-landing .footer-tagline{font-size:.82rem;color:rgba(255,255,255,.35);line-height:1.6;max-width:260px;}
#arena-landing .footer-col h4{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:14px;}
#arena-landing .footer-col a{display:block;font-size:.82rem;color:rgba(255,255,255,.4);margin-bottom:8px;transition:color .2s;}
#arena-landing .footer-col a:hover{color:rgba(255,255,255,.8);}
#arena-landing .footer-bottom{max-width:1200px;margin:32px auto 0;border-top:1px solid rgba(255,255,255,.06);padding-top:20px;display:flex;justify-content:space-between;align-items:center;}
#arena-landing .footer-copy{font-size:.75rem;color:rgba(255,255,255,.25);}
@media(max-width:900px){#arena-landing .footer-inner{grid-template-columns:1fr 1fr;}}
@media(max-width:500px){#arena-landing .footer-inner{grid-template-columns:1fr;}}

#arena-landing .fade-in{opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease;}
#arena-landing .fade-in.visible{opacity:1;transform:translateY(0);}
`;

export function LandingView({ onSignIn }) {
  const [lang, setLang] = useState(() => {
    try { const s = localStorage.getItem("tc_lang"); return s === "es" ? "es" : "en"; } catch { return "en"; }
  });
  function tl(k) { return LANDING_STRINGS[lang]?.[k] ?? LANDING_STRINGS.en[k] ?? k; }
  function toggleLang() {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    try { localStorage.setItem("tc_lang", next); } catch {}
  }

  useEffect(() => {
    const root = document.getElementById("arena-landing");

    const fadeObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1 });
    root.querySelectorAll(".fade-in").forEach(el => fadeObs.observe(el));

    function animateCounter(el, target) {
      const duration = 1800;
      const start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(ease * target).toLocaleString() + (el.dataset.suffix || "");
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    const counterObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target, parseInt(e.target.dataset.target));
          counterObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    root.querySelectorAll("[data-target]").forEach(el => counterObs.observe(el));

    const nav = root.querySelector("nav");
    const handleScroll = () => { if (nav) nav.style.height = root.scrollTop > 40 ? "52px" : "60px"; };
    root.addEventListener("scroll", handleScroll);

    return () => {
      fadeObs.disconnect();
      counterObs.disconnect();
      root.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div id="arena-landing">
      <style>{CSS}</style>

      {/* NAV */}
      <nav>
        <div className="nav-logo">
          <NovaLandingMark size={32} />
          <span className="logo-arena">Arena</span>
          <span className="logo-rest">{tl("hero_name")}</span>
        </div>
        <div className="nav-links">
          <a href="#arena">{tl("nav_arena")}</a>
          <a href="#features">{tl("nav_features")}</a>
          <a href="#lifecycle">{tl("nav_lifecycle")}</a>
          <a href="#roles">{tl("nav_roles")}</a>
          <a href="#pricing">{tl("nav_pricing")}</a>
        </div>
        <div className="nav-cta">
          <button className="btn-ghost" onClick={toggleLang} style={{minWidth:40,fontWeight:700,letterSpacing:".04em"}}>{tl("lang_btn")}</button>
          <button className="btn-ghost" onClick={onSignIn}>{tl("nav_signin")}</button>
          <button className="btn-primary" onClick={onSignIn}>{tl("nav_start")}</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="hero-glow2" />
        <div className="hero-inner">
          <div>
            <div className="hero-badge">{tl("hero_badge")}</div>
            <div className="hero-name">{tl("hero_name")}</div>
            <h1><em style={{fontSize:"1.2em",display:"block",lineHeight:1}}>Arena</em>{tl("hero_h1a")}<br />{tl("hero_h1b")}</h1>
            <p className="hero-sub">{tl("hero_sub")}</p>
            <div className="hero-actions">
              <button className="btn-hero btn-hero-primary" onClick={onSignIn}>{tl("hero_trial")}</button>
              <a href="#demo" className="btn-hero btn-hero-outline">{tl("hero_demo")}</a>
            </div>
            <div className="hero-trust">
              <div className="hero-trust-dots">
                <div className="avatar-dot">LM</div>
                <div className="avatar-dot">JW</div>
                <div className="avatar-dot">SC</div>
                <div className="avatar-dot">DK</div>
              </div>
              <span>{tl("hero_trust")}</span>
            </div>
          </div>
          <div className="browser-wrap fade-in">
            <div className="browser">
              <div className="browser-bar">
                <div className="browser-dots"><span /><span /><span /></div>
                <div className="browser-url">app.arenasolution.io/arena</div>
              </div>
              <div className="browser-content" style={{minHeight:260,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#07111F",gap:16,padding:"20px 16px"}}>
                {/* Mini Arena orbital demo */}
                <div style={{position:"relative",width:200,height:200,flexShrink:0}}>
                  {/* Rings */}
                  {[64,100,136].map((d,i) => (
                    <div key={d} style={{position:"absolute",top:"50%",left:"50%",width:d,height:d,marginTop:-d/2,marginLeft:-d/2,borderRadius:"50%",border:`1px ${i===0?"solid":"dashed"} rgba(79,110,247,${[0.3,0.2,0.12][i]})`,pointerEvents:"none"}} />
                  ))}
                  {/* Center */}
                  <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:38,height:38,borderRadius:"50%",background:"radial-gradient(circle at 36% 33%,#4F6EF7,#0D1F3C 78%)",boxShadow:"0 0 0 4px rgba(79,110,247,.15),0 4px 18px rgba(79,110,247,.5)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,color:"#fff",fontSize:14,zIndex:10}}>A</div>
                  {/* Inner orbiters — clients */}
                  {[{s:0,c:"#10B981",l:"AC"},{s:140,c:"#F59E0B",l:"MC"},{s:260,c:"#6366F1",l:"GI"}].map((o,i) => (
                    <div key={i} style={{position:"absolute",top:"50%",left:"50%",width:0,height:0,animation:`arena-orb ${9+i*2}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"32px",zIndex:2}}>
                      <div style={{position:"absolute",width:22,height:22,top:-11,left:-11,borderRadius:"50%",background:o.c,boxShadow:`0 0 6px ${o.c}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".45rem",fontWeight:700,color:"#fff"}}>{o.l}</div>
                    </div>
                  ))}
                  {/* Outer orbiters — consultants */}
                  {[{s:20,c:"#2563EB",l:"CR"},{s:100,c:"#60A5FA",l:"AJ"},{s:200,c:"#3B82F6",l:"ST"},{s:300,c:"#93C5FD",l:"MK"}].map((o,i) => (
                    <div key={i} style={{position:"absolute",top:"50%",left:"50%",width:0,height:0,animation:`arena-orb ${14+i*3}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"50px",zIndex:2}}>
                      <div style={{position:"absolute",width:18,height:18,top:-9,left:-9,borderRadius:"50%",background:o.c,boxShadow:`0 0 5px ${o.c}60`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".4rem",fontWeight:700,color:"#fff"}}>{o.l}</div>
                    </div>
                  ))}
                  {/* Outermost — cases */}
                  {[{s:45,c:"rgba(245,158,11,1)"},{s:165,c:"rgba(239,68,68,1)"},{s:285,c:"rgba(16,185,129,1)"}].map((o,i) => (
                    <div key={i} style={{position:"absolute",top:"50%",left:"50%",width:0,height:0,animation:`arena-orb ${20+i*2}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"68px",zIndex:2}}>
                      <div style={{position:"absolute",width:10,height:10,top:-5,left:-5,borderRadius:"50%",background:o.c,boxShadow:`0 0 4px ${o.c}`}} />
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
                  {[{l:"3 clients",c:"#10B981"},{l:"4 consultants",c:"#3B82F6"},{l:"3 open cases",c:"#F59E0B"}].map(t => (
                    <div key={t.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:".58rem",fontWeight:600,color:"rgba(255,255,255,.55)"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:t.c,boxShadow:`0 0 4px ${t.c}`}} />{t.l}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{fontSize:".6rem",fontWeight:600,padding:"3px 10px",borderRadius:6,background:"rgba(79,110,247,.15)",border:"1px solid rgba(79,110,247,.35)",color:"#A5B4FC"}}>Galaxy Explorer</div>
                  <div style={{fontSize:".6rem",fontWeight:600,padding:"3px 10px",borderRadius:6,background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.25)",color:"#6EE7B7"}}>Apply as Team →</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOGO STRIP */}
      <div className="logo-strip">
        <div className="logo-strip-inner">
          <span className="logo-strip-label">{tl("trusted_by")}</span>
          {["Acme Corporation","TechStart LLC","Global Industries","Meridian Consulting","NovaSAP GmbH","Apex Solutions"].map(c => (
            <span key={c} className="logo-company">{c}</span>
          ))}
        </div>
      </div>

      {/* STATS */}
      <section className="stats">
        <div className="stats-inner">
          <div className="stat-item fade-in"><div className="stat-num" data-target="12400">0</div><div className="stat-label">{tl("stats_cases")}</div></div>
          <div className="stat-item fade-in"><div className="stat-num" data-target="340">0</div><div className="stat-label">{tl("stats_cos")}</div></div>
          <div className="stat-item fade-in"><div className="stat-num" data-target="98">0</div><div className="stat-label">{tl("stats_sla")}</div></div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="section-inner">
          <div className="section-tag">{tl("feat_tag")}</div>
          <h2>{tl("feat_h2a")}<br />{tl("feat_h2b")}</h2>
          <p className="section-sub">{tl("feat_sub")}</p>
          <div className="features-grid">
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{display:"flex",gap:"4px",marginBottom:"8px",flexWrap:"wrap"}}>
                  <div style={{padding:"4px 8px",borderRadius:"6px",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",fontSize:".58rem",fontWeight:600,color:"#6EE7B7"}}>✓ Triage</div>
                  <div style={{padding:"4px 8px",borderRadius:"6px",background:"rgba(79,110,247,.15)",border:"1px solid rgba(79,110,247,.4)",fontSize:".58rem",fontWeight:600,color:"#A5B4FC"}}>◉ In Analysis</div>
                  <div style={{padding:"4px 8px",borderRadius:"6px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",fontSize:".58rem",fontWeight:600,color:"rgba(255,255,255,.3)"}}>In Progress</div>
                  <div style={{padding:"4px 8px",borderRadius:"6px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",fontSize:".58rem",fontWeight:600,color:"rgba(255,255,255,.3)"}}>Testing</div>
                </div>
                <div style={{background:"#1a2237",borderRadius:"8px",padding:"10px",border:"1px solid rgba(255,255,255,.07)"}}>
                  <div style={{fontSize:".68rem",fontWeight:600,color:"#fff",marginBottom:"4px"}}>Authorization Error · FB60</div>
                  <div style={{height:"3px",background:"rgba(255,255,255,.07)",borderRadius:"2px"}}><div style={{width:"30%",height:"100%",background:"#4F6EF7",borderRadius:"2px"}} /></div>
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">🔁</div>
                <div className="feat-title">{tl("f1t")}</div>
                <div className="feat-desc">{tl("f1d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                  {[{i:"CR",n:"Carlos Rivera · SAP FI/CO",s:"8 yrs · $120/h · ★ 4.7",a:"Available",ac:"#6EE7B7",ab:"rgba(16,185,129,.15)"},{i:"AJ",n:"Ana Johansson · SAP SD/MM",s:"6 yrs · $100/h · ★ 4.8",a:"Busy",ac:"#FCD34D",ab:"rgba(245,158,11,.15)"}].map(c => (
                    <div key={c.i} style={{background:"#1a2237",borderRadius:"8px",padding:"8px 10px",border:"1px solid rgba(255,255,255,.07)",display:"flex",alignItems:"center",gap:"8px"}}>
                      <div style={{width:"28px",height:"28px",borderRadius:"50%",background:"linear-gradient(135deg,#4F6EF7,#818CF8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".55rem",fontWeight:700,color:"#fff",flexShrink:0}}>{c.i}</div>
                      <div style={{flex:1}}><div style={{fontSize:".65rem",fontWeight:600,color:"#fff"}}>{c.n}</div><div style={{fontSize:".55rem",color:"rgba(255,255,255,.4)"}}>{c.s}</div></div>
                      <div style={{fontSize:".55rem",fontWeight:700,color:c.ac,background:c.ab,padding:"2px 6px",borderRadius:"4px"}}>{c.a}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">🏟</div>
                <div className="feat-title">{tl("f2t")}</div>
                <div className="feat-desc">{tl("f2d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                  {[{n:"SAP S/4HANA Migration",w:"58%",c:"#10B981",sc:"#6EE7B7",sb:"rgba(16,185,129,.2)",m:"7 cases · 4 active · $850k budget"},{n:"IT Infrastructure Modernization",w:"30%",c:"#4F6EF7",sc:"#A5B4FC",sb:"rgba(79,110,247,.2)",m:"3 cases · 2 active · $320k budget"}].map(p => (
                    <div key={p.n} style={{background:"#1a2237",borderRadius:"8px",padding:"10px",border:`1px solid ${p.sb}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                        <div style={{fontSize:".65rem",fontWeight:700,color:"#fff"}}>{p.n}</div>
                        <div style={{fontSize:".55rem",fontWeight:600,color:p.sc,background:`rgba(${p.c === "#10B981" ? "16,185,129" : "79,110,247"},.15)`,padding:"1px 6px",borderRadius:"4px"}}>Active</div>
                      </div>
                      <div style={{height:"3px",background:"rgba(255,255,255,.07)",borderRadius:"2px",marginBottom:"4px"}}><div style={{width:p.w,height:"100%",background:p.c,borderRadius:"2px"}} /></div>
                      <div style={{fontSize:".55rem",color:"rgba(255,255,255,.35)"}}>{p.m}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">📁</div>
                <div className="feat-title">{tl("f3t")}</div>
                <div className="feat-desc">{tl("f3d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup" style={{display:"flex",gap:"8px",alignItems:"flex-end"}}>
                <div style={{flex:1,background:"#1a2237",borderRadius:"8px",padding:"10px",border:"1px solid rgba(255,255,255,.07)"}}>
                  <div style={{fontSize:".58rem",color:"rgba(255,255,255,.35)",marginBottom:"6px",textTransform:"uppercase",letterSpacing:".05em"}}>This week</div>
                  <div style={{display:"flex",gap:"3px",alignItems:"flex-end",height:"50px"}}>
                    {[60,80,100,45,20].map((h,i) => (
                      <div key={i} style={{flex:1,background:i<4?"#4F6EF7":"rgba(79,110,247,.2)",borderRadius:"3px 3px 0 0",height:`${h}%`,border:i===4?"1px dashed rgba(79,110,247,.4)":undefined}} />
                    ))}
                  </div>
                  <div style={{fontSize:".7rem",fontWeight:700,color:"#fff",marginTop:"4px"}}>32.5h <span style={{fontSize:".55rem",color:"#6EE7B7"}}>/ 40h</span></div>
                </div>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:"5px"}}>
                  <div style={{background:"#1a2237",borderRadius:"6px",padding:"6px 8px",border:"1px solid rgba(255,255,255,.07)"}}><div style={{fontSize:".55rem",color:"rgba(255,255,255,.35)"}}>Pending approval</div><div style={{fontSize:".72rem",fontWeight:700,color:"#FCD34D"}}>8.5h</div></div>
                  <div style={{background:"#1a2237",borderRadius:"6px",padding:"6px 8px",border:"1px solid rgba(16,185,129,.2)"}}><div style={{fontSize:".55rem",color:"rgba(255,255,255,.35)"}}>Approved</div><div style={{fontSize:".72rem",fontWeight:700,color:"#6EE7B7"}}>24h</div></div>
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">⏱</div>
                <div className="feat-title">{tl("f4t")}</div>
                <div className="feat-desc">{tl("f4d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{background:"#1a2237",borderRadius:"8px",padding:"10px",border:"1px solid rgba(255,255,255,.07)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"8px"}}><div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4F6EF7"}} /><div style={{fontSize:".6rem",fontWeight:700,color:"#A5B4FC"}}>AI-generated specification</div></div>
                  <div style={{height:"4px",background:"rgba(79,110,247,.1)",borderRadius:"2px",overflow:"hidden",marginBottom:"8px"}}><div style={{width:"100%",height:"100%",background:"linear-gradient(90deg,#4F6EF7,#818CF8)"}} /></div>
                  <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                    {[90,75,85,60].map((w,i) => <div key={i} style={{height:"5px",background:"rgba(255,255,255,.08)",borderRadius:"2px",width:`${w}%`}} />)}
                  </div>
                  <div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                    <div style={{fontSize:".55rem",fontWeight:600,padding:"3px 8px",borderRadius:"4px",background:"rgba(16,185,129,.15)",color:"#6EE7B7",border:"1px solid rgba(16,185,129,.3)"}}>Approve spec</div>
                    <div style={{fontSize:".55rem",fontWeight:600,padding:"3px 8px",borderRadius:"4px",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.1)"}}>Regenerate</div>
                  </div>
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">📄</div>
                <div className="feat-title">{tl("f5t")}</div>
                <div className="feat-desc">{tl("f5d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                  {[{g:"→ In Analysis",s:"✓ Consultant assigned",c:"#6EE7B7",b:"rgba(16,185,129,.2)"},{g:"→ Testing",s:"⚠ Time not logged",c:"#FCD34D",b:"rgba(245,158,11,.2)"},{g:"Response time",label:"SLA status",s:"2h 14m left",c:"#A5B4FC",b:"rgba(79,110,247,.2)"}].map((r,i) => (
                    <div key={i} style={{background:"#1a2237",borderRadius:"7px",padding:"8px 10px",border:`1px solid ${r.b}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontSize:".58rem",color:"rgba(255,255,255,.4)"}}>{r.label || "Transition gate"}</div><div style={{fontSize:".65rem",fontWeight:600,color:"#fff"}}>{r.g}</div></div>
                      <div style={{fontSize:".58rem",fontWeight:700,color:r.c}}>{r.s}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">🔒</div>
                <div className="feat-title">{tl("f6t")}</div>
                <div className="feat-desc">{tl("f6d")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARENA SHOWCASE */}
      <section className="arena-showcase" id="arena">
        <div className="arena-inner">
          <div>
            <div className="arena-tag">{tl("arena_tag")}</div>
            <h2 style={{color:"#fff"}}>{tl("arena_h2")}</h2>
            <p className="section-sub" style={{color:"rgba(255,255,255,.5)",marginBottom:32}}>{tl("arena_sub")}</p>
            <div className="arena-bullets">
              {[
                {icon:"🌌",bg:"rgba(37,99,235,.15)",tk:"ab1t",dk:"ab1d"},
                {icon:"🤝",bg:"rgba(16,185,129,.12)",tk:"ab2t",dk:"ab2d"},
                {icon:"🎯",bg:"rgba(245,158,11,.12)",tk:"ab3t",dk:"ab3d"},
                {icon:"📡",bg:"rgba(139,92,246,.12)",tk:"ab4t",dk:"ab4d"},
              ].map(b => (
                <div key={b.tk} className="arena-bullet">
                  <div className="arena-bullet-icon" style={{background:b.bg}}>{b.icon}</div>
                  <div className="arena-bullet-text"><strong>{tl(b.tk)}</strong><span>{tl(b.dk)}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="arena-visual">
            {/* Large animated Arena orbital system */}
            <div className="arena-system">
              {/* Rings */}
              {[{d:90,style:"dashed",op:.28},{d:150,style:"dashed",op:.2},{d:220,style:"solid",op:.16},{d:310,style:"dashed",op:.1}].map((ring,i) => (
                <div key={i} className="arena-ring" style={{width:ring.d,height:ring.d,marginTop:-ring.d/2,marginLeft:-ring.d/2,border:`1.5px ${ring.style} rgba(37,99,235,${ring.op})`}} />
              ))}
              {/* Center */}
              <div className="arena-center" style={{width:64,height:64,fontSize:22}}>A</div>
              {/* Inner ring — clients */}
              {[{s:0,c:"#10B981",l:"Acme",initials:"AC",d:11},{s:120,c:"#F59E0B",l:"Meridian",initials:"MC",d:13},{s:240,c:"#6366F1",l:"Global",initials:"GI",d:15}].map((o,i) => (
                <div key={i} className="arena-dot" style={{animation:`arena-orb ${o.d}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"45px",zIndex:2}}>
                  <div className="arena-dot-inner" style={{width:28,height:28,top:-14,left:-14,background:o.c,boxShadow:`0 0 10px ${o.c}80`}}>{o.initials}</div>
                </div>
              ))}
              {/* Mid ring — consultants */}
              {[{s:15,c:"#2563EB",l:"CR",d:18},{s:85,c:"#60A5FA",l:"AJ",d:22},{s:160,c:"#3B82F6",l:"ST",d:20},{s:235,c:"#93C5FD",l:"MK",d:25},{s:310,c:"#2563EB",l:"PL",d:19}].map((o,i) => (
                <div key={i} className="arena-dot" style={{animation:`arena-orb ${o.d}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"75px",zIndex:2}}>
                  <div className="arena-dot-inner" style={{width:24,height:24,top:-12,left:-12,background:o.c,boxShadow:`0 0 7px ${o.c}60`}}>{o.l}</div>
                </div>
              ))}
              {/* Outer ring — cases/opportunities */}
              {[{s:30,c:"rgba(239,68,68,.9)"},{s:100,c:"rgba(245,158,11,.9)"},{s:180,c:"rgba(16,185,129,.9)"},{s:260,c:"rgba(99,102,241,.9)"},{s:330,c:"rgba(239,68,68,.7)"}].map((o,i) => (
                <div key={i} className="arena-dot" style={{animation:`arena-orb ${28+i*3}s linear infinite`,['--as']:`${o.s}deg`,['--ar']:"110px",zIndex:2}}>
                  <div style={{position:"absolute",width:10,height:10,top:-5,left:-5,borderRadius:"50%",background:o.c,boxShadow:`0 0 6px ${o.c}`}} />
                </div>
              ))}
              {/* Labels */}
              <div className="arena-label" style={{top:"16%",left:"50%",transform:"translateX(-50%)",color:"rgba(96,165,250,.7)"}}>Consultants</div>
              <div className="arena-label" style={{bottom:"12%",left:"50%",transform:"translateX(-50%)",color:"rgba(16,185,129,.7)"}}>Clients</div>
              <div className="arena-label" style={{top:"50%",right:"2%",transform:"translateY(-50%)",color:"rgba(245,158,11,.6)"}}>Cases</div>
            </div>
          </div>
        </div>
      </section>

      {/* LIFECYCLE */}
      <section className="lifecycle-section" id="lifecycle">
        <div className="lifecycle-inner">
          <div className="section-tag" style={{color:"#818CF8"}}>{tl("lc_tag")}</div>
          <h2>{tl("lc_h2")}</h2>
          <p className="section-sub">{tl("lc_sub")}</p>
          <div className="pipeline-scroll">
            <div className="pipeline-track">
              {[{n:1,l:"New\nRequest",c:"#6366F1",t:"#A5B4FC",bg:"rgba(99,102,241,.1)"},{n:2,l:"Triage",c:"#F59E0B",t:"#FCD34D",bg:"rgba(245,158,11,.1)"},{n:3,l:"In\nAnalysis",c:"#3B82F6",t:"#93C5FD",bg:"rgba(59,130,246,.1)"},{n:4,l:"In\nProgress",c:"#8B5CF6",t:"#C4B5FD",bg:"rgba(139,92,246,.1)"},{n:5,l:"Testing /\nValidation",c:"#06B6D4",t:"#67E8F9",bg:"rgba(6,182,212,.1)"},{n:6,l:"Resolved",c:"#10B981",t:"#6EE7B7",bg:"rgba(16,185,129,.1)"},{n:7,l:"Closed",c:"#6B7280",t:"#D1D5DB",bg:"rgba(107,114,128,.1)"}].map(s => (
                <div key={s.n} className="pipe-stage">
                  <div className="pipe-dot" style={{borderColor:s.c,color:s.t,background:s.bg}}>{s.n}</div>
                  <div className="pipe-label">{s.l.split("\n").map((ln,i)=><span key={i}>{ln}{i===0&&s.l.includes("\n")?<br/>:null}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="lc-cards">
            <div className="lc-card fade-in">
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#4F6EF7"}} /><div className="lc-card-name">SAP Support Center</div></div>
              <div className="lc-card-desc">Full SAP consulting support lifecycle — from ticket intake through analysis, delivery, testing, and formal closure.</div>
              <div className="lc-card-stages">
                {[{l:"New Request",c:"#6366F1",t:"#A5B4FC"},{l:"Triage",c:"#F59E0B",t:"#FCD34D"},{l:"In Analysis",c:"#3B82F6",t:"#93C5FD"},{l:"In Progress",c:"#8B5CF6",t:"#C4B5FD"},{l:"Pending Customer",c:"#F97316",t:"#FDBA74"},{l:"Pending SAP",c:"#EF4444",t:"#FCA5A5"},{l:"Testing",c:"#06B6D4",t:"#67E8F9"},{l:"Resolved",c:"#10B981",t:"#6EE7B7"},{l:"Closed",c:"#6B7280",t:"#D1D5DB"}].map(s => (
                  <span key={s.l} className="lc-chip" style={{borderColor:s.c,color:s.t}}>{s.l}</span>
                ))}
              </div>
            </div>
            <div className="lc-card fade-in">
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#10B981"}} /><div className="lc-card-name">Help Desk Support</div></div>
              <div className="lc-card-desc">IT help desk lifecycle — handles ticket assignment, escalation, vendor waits, and user-confirmation flows with full audit trail.</div>
              <div className="lc-card-stages">
                {[{l:"New Ticket",c:"#6366F1",t:"#A5B4FC"},{l:"Assigned",c:"#F59E0B",t:"#FCD34D"},{l:"In Progress",c:"#3B82F6",t:"#93C5FD"},{l:"Pending User",c:"#F97316",t:"#FDBA74"},{l:"Pending Vendor",c:"#EF4444",t:"#FCA5A5"},{l:"Escalated",c:"#EC4899",t:"#F9A8D4"},{l:"Resolved",c:"#10B981",t:"#6EE7B7"},{l:"Reopened",c:"#8B5CF6",t:"#C4B5FD"}].map(s => (
                  <span key={s.l} className="lc-chip" style={{borderColor:s.c,color:s.t}}>{s.l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section className="section" id="roles">
        <div className="section-inner">
          <div className="section-tag">{tl("roles_tag")}</div>
          <h2>{tl("roles_h2")}</h2>
          <p className="section-sub">{tl("roles_sub")}</p>
          <div className="roles-grid">
            {[
              {e:"👔",nk:"r1n",dk:"r1d",pk:"r1p",bg:"rgba(79,110,247,.1)"},
              {e:"🏢",nk:"r2n",dk:"r2d",pk:"r2p",bg:"rgba(16,185,129,.1)"},
              {e:"💼",nk:"r3n",dk:"r3d",pk:"r3p",bg:"rgba(139,92,246,.1)"},
              {e:"🔬",nk:"r4n",dk:"r4d",pk:"r4p",bg:"rgba(6,182,212,.1)"},
              {e:"🗝",nk:"r5n",dk:"r5d",pk:"r5p",bg:"rgba(245,158,11,.1)"},
              {e:"📊",nk:"r6n",dk:"r6d",pk:"r6p",bg:"rgba(239,68,68,.1)"},
              {e:"👤",nk:"r7n",dk:"r7d",pk:"r7p",bg:"rgba(107,114,128,.1)"},
              {e:"🎯",nk:"r8n",dk:"r8d",pk:"r8p",bg:"rgba(236,72,153,.1)"},
            ].map(r => (
              <div key={r.nk} className="role-card fade-in">
                <div className="role-avatar" style={{background:r.bg}}>{r.e}</div>
                <div className="role-name">{tl(r.nk)}</div>
                <div className="role-desc">{tl(r.dk)}</div>
                <div className="role-perms">{tl(r.pk).map(p => <span key={p} className="role-perm">{p}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VIDEO */}
      <section className="video-section" id="demo">
        <div className="section-inner" style={{textAlign:"center"}}>
          <div className="section-tag" style={{textAlign:"center"}}>{tl("video_tag")}</div>
          <h2 style={{margin:"0 auto 12px"}}>{tl("video_h2")}</h2>
          <p className="section-sub" style={{margin:"0 auto 36px"}}>{tl("video_sub")}</p>
          <div className="video-wrap">
            <div className="video-inner">
              <div className="video-grid-bg" />
              <div className="play-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
              <div className="video-overlay-text"><div className="video-label">{tl("video_lbl")}</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section">
        <div className="section-inner">
          <div className="section-tag">{tl("testi_tag")}</div>
          <h2>{tl("testi_h2")}</h2>
          <div className="testimonials-grid">
            {[
              {q:"Before Arena, our SAP support was chaotic — emails, spreadsheets, missed SLAs. Now every ticket has a clear owner, a governed lifecycle, and we know exactly where we stand at any moment.",n:"Laura Martinez",r:"Head of IT",c:"Acme Corporation",i:"LM",g:"linear-gradient(135deg,#4F6EF7,#818CF8)"},
              {q:"The consultant marketplace changed how we staff projects. I can find a vetted SAP FI specialist, review their ratings, and assign them to a case in under five minutes. That used to take days.",n:"David Kim",r:"Operations Manager",c:"Meridian Consulting",i:"DK",g:"linear-gradient(135deg,#10B981,#34D399)"},
              {q:"The transition gates are the hidden gem. Nobody can move a case to testing without logged hours and attached documents. Our QA pass rate improved 40% in the first quarter after onboarding.",n:"Sofia Chen",r:"Project Director",c:"Global Industries S.A.",i:"SC",g:"linear-gradient(135deg,#F59E0B,#FCD34D)",tc:"#1a1a1a"},
            ].map(t => (
              <div key={t.n} className="testi-card fade-in">
                <div className="stars">★★★★★</div>
                <div className="testi-quote">"{t.q}"</div>
                <div className="testi-author">
                  <div className="testi-av" style={{background:t.g,color:t.tc||"#fff"}}>{t.i}</div>
                  <div><div className="testi-name">{t.n}</div><div className="testi-role">{t.r} · <span className="testi-company">{t.c}</span></div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing-section" id="pricing">
        <div className="section-inner" style={{textAlign:"center"}}>
          <div className="section-tag" style={{textAlign:"center"}}>{tl("pricing_tag")}</div>
          <h2 style={{margin:"0 auto 12px"}}>{tl("pricing_h2")}</h2>
          <p className="section-sub" style={{margin:"0 auto 48px"}}>{tl("pricing_sub")}</p>
          <div className="pricing-grid">
            <div className="price-card fade-in">
              <div className="price-name">{tl("p1n")}</div>
              <div className="price-amount">$149<small>/mo</small></div>
              <div className="price-period">{tl("p1period")}</div>
              <ul className="price-features">{tl("p1f").map(f=><li key={f}>{f}</li>)}</ul>
              <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_start")}</button>
            </div>
            <div className="price-card featured fade-in">
              <div className="price-badge">{tl("p2badge")}</div>
              <div className="price-name">{tl("p2n")}</div>
              <div className="price-amount">$399<small>/mo</small></div>
              <div className="price-period">{tl("p2period")}</div>
              <ul className="price-features">{tl("p2f").map(f=><li key={f}>{f}</li>)}</ul>
              <button className="price-cta price-cta-filled" onClick={onSignIn}>{tl("btn_trial")}</button>
            </div>
            <div className="price-card fade-in">
              <div className="price-name">{tl("p3n")}</div>
              <div className="price-amount" style={{fontSize:"2rem"}}>{tl("p3custom")}</div>
              <div className="price-period">{tl("p3period")}</div>
              <ul className="price-features">{tl("p3f").map(f=><li key={f}>{f}</li>)}</ul>
              <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_contact")}</button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-glow" />
        <div className="section-tag" style={{color:"#818CF8",textAlign:"center"}}>{tl("cta_tag")}</div>
        <h2>{tl("cta_h2")}</h2>
        <p>{tl("cta_p")}</p>
        <div className="cta-actions">
          <button className="btn-hero btn-hero-primary" onClick={onSignIn}>{tl("hero_trial")}</button>
          <button className="btn-hero btn-hero-outline" onClick={onSignIn}>Schedule a demo</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-logo"><NovaLandingMark size={36} /><span className="logo-arena">Arena</span><span className="logo-rest">{tl("hero_name")}</span></div>
            <div className="footer-tagline">{tl("footer_tagline")}</div>
          </div>
          <div className="footer-col"><h4>{tl("f_product")}</h4><a href="#arena">{tl("f_arena")}</a><a href="#features">{tl("f_features")}</a><a href="#lifecycle">{tl("f_lifecycle")}</a><a href="#roles">{tl("f_roles")}</a><a href="#pricing">{tl("f_pricing")}</a></div>
          <div className="footer-col"><h4>{tl("f_company")}</h4><a href="#">{tl("f_about")}</a><a href="#">{tl("f_blog")}</a><a href="#">{tl("f_careers")}</a><a href="#">{tl("f_contact")}</a></div>
          <div className="footer-col"><h4>{tl("f_legal")}</h4><a href="#">{tl("f_privacy")}</a><a href="#">{tl("f_terms")}</a><a href="#">{tl("f_security")}</a></div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">{tl("copy1")}</div>
          <div className="footer-copy">{tl("copy2")}</div>
        </div>
      </footer>
    </div>
  );
}
