import { useEffect, useRef, useState } from "react";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";

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
    f7t:"Migration Hub", f7d:"SAP Activate-aligned migration management. Track phases from Discover to Run, assign deliverables, log fit-gap decisions, and gate transitions by readiness criteria.",
    f8t:"AI Document Generation", f8d:"Claude drafts functional specs, dev plans, and fit-gap reports directly from case context. Teams review, comment, and approve in-platform — no copy-paste.",
    f9t:"SAP Tooling Suite", f9d:"Manage transport requests, track fit-gap resolution, and schedule testing waves inside the governed lifecycle of each migration case.",
    arena_tag:"Arena · Principal Feature",
    arena_h2:"Your orbital talent marketplace.",
    arena_sub:"Arena is the command center for connecting clients with the right SAP consultants — through an immersive, visual orbital interface that brings the entire talent network to life.",
    ab1t:"Galaxy Explorer", ab1d:"Navigate clients, cases, and consultants through an animated orbital system. Click any node to drill into their universe.",
    ab2t:"Team Applications", ab2d:"Form consulting teams, assign roles with skill validation, and apply to open cases as a unit — not just solo.",
    ab3t:"Smart Matching", ab3d:"Skill-to-role enforcement ensures only qualified consultants are assigned. AI auto-suggests the best fit from your team.",
    ab4t:"Live Discovery", ab4d:"Radar pulse animations signal active opportunity scanning. New cases surface in real time across your orbital network.",
    lc_tag:"Lifecycle Engine", lc_h2:"Every stage governed. Every move gated.",
    lc_sub:"Pre-built SAP and IT help desk lifecycles — each stage defines its own gate conditions, available actions, and role permissions. Click any stage below to explore.",
    lc_detail_gates:"Gate conditions to advance",
    lc_detail_tabs:"Available tabs",
    lc_click_hint:"Click any stage to see its gates and available actions",
    lc_gate_noop:"Final stage — no outbound gates.",
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
    pricing_tag:"Pricing", pricing_h2:"Free to start. Grow when you're ready.",
    pricing_sub:"Consultants and clients join free. Upgrade only when you need more cases, more candidates, or more firepower.",
    ptab_consultant:"Consultant", ptab_client:"Client", ptab_headhunter:"Headhunter",
    // Consultant plans
    pc_free_name:"Free", pc_free_period:"Free forever",
    pc_free_f:["List your profile in Arena","Apply to 3 cases / month","1 active case at a time","Basic profile & portfolio","Community support"],
    pc_pro_name:"Pro", pc_pro_period:"per month · cancel any time", pc_pro_badge:"Most popular",
    pc_pro_f:["Unlimited case applications","Priority ranking in Arena","AI-powered profile matching","Full analytics dashboard","Email & chat support"],
    // Client plans
    cl_free_name:"Free", cl_free_period:"Free forever",
    cl_free_f:["3 active cases","2 team seats","Invite clients via link","Basic lifecycle tracking","Community support"],
    cl_growth_name:"Growth", cl_growth_period:"per month · cancel any time", cl_growth_badge:"Most popular",
    cl_growth_f:["5 active cases","10 team seats","AI-powered specifications","Full reporting & analytics","SLA management","Priority support"],
    cl_ent_name:"Enterprise", cl_ent_period:"Unlimited · dedicated support", cl_ent_custom:"$349",
    cl_ent_f:["Unlimited cases & team","Everything in Growth","SAP BTP / S/4HANA integration","Custom lifecycle builder","SSO & advanced security","Dedicated customer success"],
    // Headhunter plans
    hh_pro_name:"Pro", hh_pro_period:"per month · cancel any time",
    hh_pro_f:["Unlimited candidate profiles","Full talent pipeline","Placement tracking","AI candidate matching","Priority case visibility","Email & chat support"],
    hh_agency_name:"Agency", hh_agency_period:"per month · cancel any time", hh_agency_badge:"Best for teams",
    hh_agency_f:["Everything in Pro","5 recruiter seats","Dedicated account manager","White-label candidate reports","Custom SLA agreements","Priority candidates & cases"],
    btn_start:"Get started free", btn_trial:"Start free trial", btn_contact:"Contact sales", btn_upgrade:"Upgrade to Pro",
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
    // Demo carousel
    dc_s0_tag:"Command center", dc_s0_h:"Your full pipeline, live",
    dc_s0_p:"From open cases to assigned specialists — every SAP engagement tracked in one place, with real-time status.",
    dc_s1_tag:"Migration Hub", dc_s1_h:"SAP Activate phase control",
    dc_s1_p:"Track every migration phase from Discover to Run. Assign deliverables, gate transitions by readiness criteria, and surface Go-Live status at a glance.",
    dc_s2_tag:"Lifecycle governance", dc_s2_h:"Stage-gated case progression",
    dc_s2_p:"Transition gates enforce document upload and hour thresholds before any case moves forward. Full audit trail.",
    dc_s3_tag:"Arena marketplace", dc_s3_h:"The orbital talent marketplace",
    dc_s3_p:"Browse open cases, apply as a consultant or team. Real-time matching surfaces the best fits instantly.",
    dc_labels:["Dashboard","Migration","Lifecycle","Arena"],
    dc_f1:"Active cases", dc_f1v:"24 open", dc_f2:"Avg. SLA", dc_f2v:"98.4 %", dc_f3:"Hours logged", dc_f3v:"1,240 h",
    dc_s0_b1:"Real-time case status across all SAP modules",
    dc_s0_b2:"Team capacity and workload at a glance",
    dc_s0_b3:"Instant alerts when consultants apply",
    dc_s1_b1:"Pre-built SAP Activate phase templates with deliverable checklists",
    dc_s1_b2:"Fit-gap log with owner assignment and resolution status tracking",
    dc_s1_b3:"Transport request tracking linked to cases and phases",
    dc_s2_b1:"Custom stage flows per project type",
    dc_s2_b2:"Gate conditions: documents, approvals, key user sign-off",
    dc_s2_b3:"AI functional spec generation at key milestones",
    dc_s2_consultant:"Consultant", dc_s2_duedate:"Due date", dc_s2_spec:"Spec status", dc_s2_specval:"✓ Approved",
    dc_s3_b1:"Cases ranked by your personal skill match score",
    dc_s3_b2:"Confidential cases accessible after NDA acceptance",
    dc_s3_b3:"Form teams for large implementation projects",
    dc_s3_matches:"cases match your profile",
    // Slide 0 mockup stats
    dc_stat_cases:"Active Cases", dc_stat_cons:"Consultants", dc_stat_fill:"Fill Rate",
    dc_stat_cases_d:"↑ 3 this week", dc_stat_cons_d:"7 available now", dc_stat_fill_d:"↑ 2% vs last mo.",
    dc_c1:"SAP FICO — Q4 Close Migration", dc_c2:"MM/SD Integration — Logistics Hub",
    dc_c3:"S/4HANA Upgrade — Pilot Phase", dc_c4:"SAP Basis — Infrastructure Review",
    dc_b_inprogress:"In Progress", dc_b_estimated:"Estimated", dc_b_open:"Open",
    dc_b_assigned:"Assigned", dc_b_review:"Review", dc_b_done:"Done",
    dc_b_highpriority:"High Priority", dc_b_new:"New",
    // Slide 2 lifecycle stages
    dc_lc_open:"Open", dc_lc_estimated:"Estimated", dc_lc_assigned:"Assigned",
    dc_lc_inprogress:"In Progress", dc_lc_review:"Review", dc_lc_done:"Done",
    // Slide 3 arena cards
    dc_a_bestmatch:"Best match", dc_a_applynow:"Apply Now", dc_a_apply:"Apply",
    dc_a_c1title:"FICO Chart of Accounts Restructure",
    dc_a_c2title:"Tax Compliance Automation",
    dc_a_c3title:"ERP Migration Readiness Review",
    dc_a_more:"+11 more cases", dc_a_filter_all:"All",
    // Promo video
    ap_header_tag:"Platform Walkthrough", ap_header_h:"See Arena in Action",
    ap_header_p:"From orbital explorer to consultant marketplace — the full platform in 30 seconds.",
    ap_s0_tag:"Platform",         ap_s0_h:"Arena Solutions Platform",     ap_s0_p:"The only workspace built for SAP project governance — from open case to closed ticket.",
    ap_s1_tag:"Orbital Explorer", ap_s1_h:"See who works on what",        ap_s1_p:"Every active SAP case orbits the client hub. Click any node to drill into the engagement.",
    ap_s2_tag:"Drill-Down",       ap_s2_h:"Client → Case in one tap",     ap_s2_p:"From parent account to every live SAP module, with live status on each engagement.",
    ap_s3_tag:"Lifecycle",        ap_s3_h:"Governed open to close",       ap_s3_p:"Mandatory gates, attached evidence, logged hours. Every transition is audited.",
    ap_s4_tag:"Consultant Arena", ap_s4_h:"Find the right specialist",    ap_s4_p:"Ranked matches by skills, availability, and track record — hire in minutes.",
    ap_s5_tag:"Get Started",      ap_s5_h:"Ready when you are",           ap_s5_p:"Set up your org in minutes. Your first case can be live before end of day.",
    ap_cta_companies_title:"For Companies", ap_cta_companies_desc:"Govern SAP cases, track SLAs, manage consultants.", ap_cta_companies_btn:"Request Demo",
    ap_cta_consultants_title:"For Consultants", ap_cta_consultants_desc:"Build your profile, get ranked, find the right project.", ap_cta_consultants_btn:"Join Arena",
    ap_ready:"Ready?",
    ap_drill_hub:"4 active cases", ap_drill_r1:"FICO Q4 Implementation", ap_drill_r2:"MM/SD Rollout", ap_drill_r3:"S/4HANA Upgrade",
    ap_drill_r1s:"Module · In Progress", ap_drill_r2s:"Module · Spec Review", ap_drill_r3s:"Module · Planning",
    ap_case_module:"FICO Q4 · In Progress", ap_case_title:"ERP Finance Consolidation",
    ap_case_hours:"Hours", ap_case_stage:"Stage", ap_case_stage_val:"Development",
    ap_lc_open:"Open", ap_lc_spec:"Spec Review", ap_lc_dev:"Development", ap_lc_test:"Testing", ap_lc_close:"Closure",
    ap_badge_done:"Done", ap_badge_active:"Active", ap_badge_locked:"Locked",
    ap_ac_r1name:"Marcus R.", ap_ac_r1role:"SAP FI/CO Specialist · 8 yrs",
    ap_ac_r2name:"Sofia K.",  ap_ac_r2role:"SAP FICO Senior · 6 yrs",
    ap_ac_r3name:"James L.",  ap_ac_r3role:"SAP Finance Lead · 10 yrs",
    ap_pause:"Pause", ap_play:"Play", ap_scene_of:"of",
    // Migration Hub showcase
    mig_tag:"Migration Hub · New Feature",
    mig_h2:"SAP migrations, fully governed.",
    mig_sub:"A dedicated workspace for SAP migration projects — aligned to SAP Activate, with phase-level tracking, fit-gap management, and transport coordination built in.",
    mb1t:"SAP Activate Phases", mb1d:"Pre-built phase templates: Discover, Prepare, Explore, Realize, Deploy, Run. Each phase gates deliverables before the next opens.",
    mb2t:"Fit-Gap Management", mb2d:"Log every gap decision, assign owners, track resolution status, and link directly to the functional spec generated by AI.",
    mb3t:"Transport Requests", mb3d:"Track transports across system landscape — dev, QA, production. Link each transport to its case and phase for complete traceability.",
    mb4t:"Go-Live Readiness", mb4d:"A structured readiness checklist covers cutover tasks, open gaps, pending transports, and sign-off status — in real time.",
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
    f7t:"Hub de Migración", f7d:"Gestión de migración alineada a SAP Activate. Rastrea fases de Discover a Run, asigna entregables, registra decisiones fit-gap y controla transiciones de fase.",
    f8t:"Generación de Documentos con IA", f8d:"Claude redacta especificaciones, planes de desarrollo y reportes fit-gap del contexto del caso. Los equipos revisan, comentan y aprueban en plataforma.",
    f9t:"Suite de Herramientas SAP", f9d:"Gestiona órdenes de transporte, rastrea resolución de fit-gap y programa olas de prueba dentro del ciclo de vida gobernado de cada caso de migración.",
    arena_tag:"Arena · Característica Principal",
    arena_h2:"Tu mercado de talento orbital.",
    arena_sub:"Arena es el centro de comando para conectar clientes con los consultores SAP adecuados — a través de una interfaz orbital visual e inmersiva que da vida a toda la red de talento.",
    ab1t:"Galaxy Explorer", ab1d:"Navega clientes, casos y consultores a través de un sistema orbital animado. Haz clic en cualquier nodo para explorar su universo.",
    ab2t:"Aplicaciones en Equipo", ab2d:"Forma equipos de consultoría, asigna roles con validación de habilidades y aplica a casos abiertos como unidad.",
    ab3t:"Asignación Inteligente", ab3d:"La aplicación de habilidades por rol garantiza que solo se asignen consultores calificados. La IA sugiere automáticamente el mejor candidato.",
    ab4t:"Descubrimiento en Vivo", ab4d:"Las animaciones de pulso radar señalan el escaneo activo de oportunidades. Nuevos casos emergen en tiempo real en tu red orbital.",
    lc_tag:"Motor de Ciclo de Vida", lc_h2:"Cada etapa gobernada. Cada movimiento con reglas.",
    lc_sub:"Ciclos de vida predefinidos para SAP y mesa de ayuda — cada etapa define sus condiciones de avance, acciones disponibles y permisos por rol. Haz clic en cualquier etapa para explorar.",
    lc_detail_gates:"Condiciones de avance",
    lc_detail_tabs:"Pestañas disponibles",
    lc_click_hint:"Haz clic en cualquier etapa para ver sus reglas y acciones disponibles",
    lc_gate_noop:"Etapa final — sin puertas de salida.",
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
    pricing_tag:"Precios", pricing_h2:"Gratis para empezar. Crece cuando estés listo.",
    pricing_sub:"Consultores y clientes se unen gratis. Mejora de plan solo cuando necesites más casos, más candidatos o más potencia.",
    ptab_consultant:"Consultor", ptab_client:"Cliente", ptab_headhunter:"Headhunter",
    pc_free_name:"Gratis", pc_free_period:"Gratis para siempre",
    pc_free_f:["Perfil visible en Arena","Aplica a 3 casos / mes","1 caso activo a la vez","Portafolio básico","Soporte comunitario"],
    pc_pro_name:"Pro", pc_pro_period:"por mes · cancela cuando quieras", pc_pro_badge:"Más popular",
    pc_pro_f:["Aplicaciones ilimitadas","Prioridad en Arena","Coincidencia con IA","Dashboard de analítica","Soporte por correo y chat"],
    cl_free_name:"Gratis", cl_free_period:"Gratis para siempre",
    cl_free_f:["3 casos activos","2 asientos de equipo","Invita clientes por enlace","Seguimiento de ciclo de vida","Soporte comunitario"],
    cl_growth_name:"Crecimiento", cl_growth_period:"por mes · cancela cuando quieras", cl_growth_badge:"Más popular",
    cl_growth_f:["5 casos activos","10 asientos de equipo","Especificaciones con IA","Reportes y analítica","Gestión de SLA","Soporte prioritario"],
    cl_ent_name:"Empresa", cl_ent_period:"Ilimitado · soporte dedicado", cl_ent_custom:"$349",
    cl_ent_f:["Casos y equipo ilimitados","Todo en Crecimiento","Integración SAP BTP / S/4HANA","Constructor de ciclo personalizado","SSO y seguridad avanzada","Éxito del cliente dedicado"],
    hh_pro_name:"Pro", hh_pro_period:"por mes · cancela cuando quieras",
    hh_pro_f:["Perfiles de candidatos ilimitados","Pipeline completo de talento","Seguimiento de colocaciones","Coincidencia con IA","Visibilidad prioritaria en casos","Soporte por correo y chat"],
    hh_agency_name:"Agencia", hh_agency_period:"por mes · cancela cuando quieras", hh_agency_badge:"Mejor para equipos",
    hh_agency_f:["Todo en Pro","5 asientos de reclutador","Gestor de cuenta dedicado","Reportes de candidatos con marca","Acuerdos SLA personalizados","Candidatos y casos prioritarios"],
    btn_start:"Comenzar gratis", btn_trial:"Iniciar prueba gratuita", btn_contact:"Contactar ventas", btn_upgrade:"Mejorar a Pro",
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
    // Demo carousel
    dc_s0_tag:"Centro de mando", dc_s0_h:"Todo tu pipeline, en vivo",
    dc_s0_p:"Desde casos abiertos hasta especialistas asignados — cada compromiso SAP rastreado en un solo lugar, con estado en tiempo real.",
    dc_s1_tag:"Hub de Migración", dc_s1_h:"Control de fases SAP Activate",
    dc_s1_p:"Rastrea cada fase de migración de Discover a Run. Asigna entregables, cierra transiciones por criterios de preparación y monitorea el estado Go-Live de un vistazo.",
    dc_s2_tag:"Gobernanza de ciclo de vida", dc_s2_h:"Progresión de casos por etapas",
    dc_s2_p:"Las puertas de transición exigen carga de documentos y umbrales de horas antes de avanzar. Registro de auditoría completo.",
    dc_s3_tag:"Mercado Arena", dc_s3_h:"El mercado orbital de talento",
    dc_s3_p:"Explora casos abiertos, aplica como consultor o equipo. La asignación en tiempo real muestra las mejores opciones al instante.",
    dc_labels:["Dashboard","Migración","Ciclo de Vida","Arena"],
    dc_f1:"Casos activos", dc_f1v:"24 abiertos", dc_f2:"SLA prom.", dc_f2v:"98.4 %", dc_f3:"Horas registradas", dc_f3v:"1.240 h",
    dc_s0_b1:"Estado en tiempo real de casos en todos los módulos SAP",
    dc_s0_b2:"Capacidad del equipo y carga de trabajo de un vistazo",
    dc_s0_b3:"Alertas instantáneas cuando los consultores aplican",
    dc_s1_b1:"Plantillas de fase SAP Activate con listas de entregables",
    dc_s1_b2:"Registro fit-gap con asignación de responsables y seguimiento de resolución",
    dc_s1_b3:"Seguimiento de órdenes de transporte vinculado a casos y fases",
    dc_s2_b1:"Flujos de etapa personalizados por tipo de proyecto",
    dc_s2_b2:"Condiciones de puerta: documentos, aprobaciones, firma del usuario clave",
    dc_s2_b3:"Generación de especificaciones funcionales con IA en hitos clave",
    dc_s2_consultant:"Consultor", dc_s2_duedate:"Fecha límite", dc_s2_spec:"Estado de spec", dc_s2_specval:"✓ Aprobado",
    dc_s3_b1:"Casos clasificados por tu puntuación personal de afinidad",
    dc_s3_b2:"Casos confidenciales accesibles tras aceptar el NDA",
    dc_s3_b3:"Forma equipos para grandes proyectos de implementación",
    dc_s3_matches:"casos coinciden con tu perfil",
    // Slide 0 mockup stats
    dc_stat_cases:"Casos Activos", dc_stat_cons:"Consultores", dc_stat_fill:"Tasa de Ocupación",
    dc_stat_cases_d:"↑ 3 esta semana", dc_stat_cons_d:"7 disponibles ahora", dc_stat_fill_d:"↑ 2% vs mes anterior",
    dc_c1:"SAP FICO — Migración Cierre Q4", dc_c2:"Integración MM/SD — Hub Logístico",
    dc_c3:"Actualización S/4HANA — Fase Piloto", dc_c4:"SAP Basis — Revisión de Infraestructura",
    dc_b_inprogress:"En Progreso", dc_b_estimated:"Estimado", dc_b_open:"Abierto",
    dc_b_assigned:"Asignado", dc_b_review:"Revisión", dc_b_done:"Listo",
    dc_b_highpriority:"Alta Prioridad", dc_b_new:"Nuevo",
    // Slide 2 lifecycle stages
    dc_lc_open:"Abierto", dc_lc_estimated:"Estimado", dc_lc_assigned:"Asignado",
    dc_lc_inprogress:"En Progreso", dc_lc_review:"Revisión", dc_lc_done:"Listo",
    // Slide 3 arena cards
    dc_a_bestmatch:"Mejor coincidencia", dc_a_applynow:"Aplicar Ahora", dc_a_apply:"Aplicar",
    dc_a_c1title:"Restructuración del Plan de Cuentas FICO",
    dc_a_c2title:"Automatización de Cumplimiento Fiscal",
    dc_a_c3title:"Revisión de Preparación Migración ERP",
    dc_a_more:"+11 casos más", dc_a_filter_all:"Todos",
    // Promo video
    ap_header_tag:"Recorrido de la Plataforma", ap_header_h:"Arena en Acción",
    ap_header_p:"Del explorador orbital al mercado de consultores — la plataforma completa en 30 segundos.",
    ap_s0_tag:"Plataforma",          ap_s0_h:"Plataforma de Soluciones Arena", ap_s0_p:"El único workspace construido para la gobernanza de proyectos SAP — del caso abierto al ticket cerrado.",
    ap_s1_tag:"Explorador Orbital",  ap_s1_h:"Ve quién trabaja en qué",        ap_s1_p:"Cada caso SAP activo orbita el centro del cliente. Haz clic en cualquier nodo para entrar al compromiso.",
    ap_s2_tag:"Profundización",      ap_s2_h:"Cliente → Caso en un toque",     ap_s2_p:"Desde la cuenta principal hasta cada módulo SAP activo, con estado en vivo de cada compromiso.",
    ap_s3_tag:"Ciclo de Vida",       ap_s3_h:"Gobernado de inicio a cierre",   ap_s3_p:"Puertas obligatorias, evidencia adjunta, horas registradas. Cada transición queda auditada.",
    ap_s4_tag:"Arena de Consultores",ap_s4_h:"Encuentra al especialista ideal", ap_s4_p:"Coincidencias clasificadas por habilidades, disponibilidad y trayectoria — contrata en minutos.",
    ap_s5_tag:"Comenzar",            ap_s5_h:"Listo cuando tú lo estés",        ap_s5_p:"Configura tu organización en minutos. Tu primer caso puede estar activo antes de que termine el día.",
    ap_cta_companies_title:"Para Empresas",    ap_cta_companies_desc:"Gobierna casos SAP, controla SLAs, gestiona consultores.", ap_cta_companies_btn:"Solicitar Demo",
    ap_cta_consultants_title:"Para Consultores", ap_cta_consultants_desc:"Crea tu perfil, obtén ranking, encuentra el proyecto ideal.", ap_cta_consultants_btn:"Unirse a Arena",
    ap_ready:"¿Listo?",
    ap_drill_hub:"4 casos activos", ap_drill_r1:"Implementación FICO Q4", ap_drill_r2:"Despliegue MM/SD", ap_drill_r3:"Actualización S/4HANA",
    ap_drill_r1s:"Módulo · En Progreso", ap_drill_r2s:"Módulo · Revisión de Spec", ap_drill_r3s:"Módulo · Planificación",
    ap_case_module:"FICO Q4 · En Progreso", ap_case_title:"Consolidación Financiera ERP",
    ap_case_hours:"Horas", ap_case_stage:"Etapa", ap_case_stage_val:"Desarrollo",
    ap_lc_open:"Abierto", ap_lc_spec:"Revisión Spec", ap_lc_dev:"Desarrollo", ap_lc_test:"Pruebas", ap_lc_close:"Cierre",
    ap_badge_done:"Hecho", ap_badge_active:"Activo", ap_badge_locked:"Bloqueado",
    ap_ac_r1name:"Marco R.",  ap_ac_r1role:"Especialista SAP FI/CO · 8 años",
    ap_ac_r2name:"Sofía K.",  ap_ac_r2role:"SAP FICO Senior · 6 años",
    ap_ac_r3name:"Jaime L.",  ap_ac_r3role:"Líder SAP Finance · 10 años",
    ap_pause:"Pausar", ap_play:"Reproducir", ap_scene_of:"de",
    // Migration Hub showcase
    mig_tag:"Hub de Migración · Nueva Función",
    mig_h2:"Migraciones SAP, completamente gobernadas.",
    mig_sub:"Un espacio de trabajo dedicado a proyectos de migración SAP — alineado a SAP Activate, con seguimiento de fases, gestión fit-gap y coordinación de transportes integrados.",
    mb1t:"Fases SAP Activate", mb1d:"Plantillas de fase prediseñadas: Discover, Prepare, Explore, Realize, Deploy, Run. Cada fase cierra entregables antes de abrir la siguiente.",
    mb2t:"Gestión Fit-Gap", mb2d:"Registra cada decisión fit-gap, asigna responsables, rastrea el estado de resolución y vincula con la especificación generada por IA.",
    mb3t:"Órdenes de Transporte", mb3d:"Rastrea transportes en todo el landscape — dev, QA, producción. Vincula cada transporte a su caso y fase para trazabilidad completa.",
    mb4t:"Preparación Go-Live", mb4d:"Un checklist estructurado cubre tareas de corte, gaps pendientes, transportes en espera y estado de firmas — en tiempo real.",
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
#arena-landing .pipe-stage{display:flex;flex-direction:column;align-items:center;position:relative;cursor:pointer;}
#arena-landing .pipe-dot-svg{display:block;margin-bottom:12px;margin-right:32px;overflow:visible;}
#arena-landing .pipe-dot-svg circle{transition:stroke .2s,stroke-width .2s;}
#arena-landing .pipe-stage:hover .pipe-label{color:rgba(255,255,255,.85);}
#arena-landing .pipe-stage.active .pipe-label{color:#fff;font-weight:700;}
#arena-landing .lc-click-hint{font-size:.72rem;color:rgba(255,255,255,.25);text-align:center;margin-top:10px;letter-spacing:.03em;}
#arena-landing .lc-detail{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:24px;margin-top:28px;animation:lc-fade .25s ease;}
@keyframes lc-fade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
#arena-landing .lc-detail-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;}
#arena-landing .lc-detail-stage-chip{font-size:.75rem;font-weight:700;padding:5px 14px;border-radius:20px;letter-spacing:.02em;}
#arena-landing .lc-detail-body{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
#arena-landing .lc-detail-col-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.35);margin-bottom:12px;}
#arena-landing .lc-gate{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;margin-bottom:6px;border:1px solid transparent;}
#arena-landing .lc-gate-pass{background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.2);}
#arena-landing .lc-gate-warn{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.2);}
#arena-landing .lc-gate-fail{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);}
#arena-landing .lc-gate-icon{font-size:.72rem;font-weight:800;flex-shrink:0;padding-top:1px;min-width:14px;}
#arena-landing .lc-gate-pass .lc-gate-icon{color:#6EE7B7;}
#arena-landing .lc-gate-warn .lc-gate-icon{color:#FCD34D;}
#arena-landing .lc-gate-fail .lc-gate-icon{color:#FCA5A5;}
#arena-landing .lc-gate-label{font-size:.78rem;color:rgba(255,255,255,.7);line-height:1.5;}
#arena-landing .lc-gate-noop{font-size:.78rem;color:rgba(255,255,255,.3);padding:10px 0;font-style:italic;}
#arena-landing .lc-tab-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
#arena-landing .lc-tab-chip{font-size:.72rem;font-weight:600;padding:5px 11px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);cursor:pointer;transition:all .15s;}
#arena-landing .lc-tab-chip:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);}
#arena-landing .lc-tab-chip.on{color:#fff;font-weight:700;}
#arena-landing .lc-tab-desc{font-size:.82rem;color:rgba(255,255,255,.55);line-height:1.65;min-height:52px;padding:10px 12px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.06);}
@media(max-width:700px){#arena-landing .lc-detail-body{grid-template-columns:1fr;}}
#arena-landing .pipe-dot:hover{transform:scale(1.1);}
#arena-landing .pipe-label{font-size:.65rem;font-weight:600;color:rgba(255,255,255,.5);text-align:center;margin-right:28px;}
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
@media(max-width:800px){#arena-landing .pricing-grid{grid-template-columns:1fr !important;max-width:400px;}}

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

#arena-landing .mig-showcase{background:#04091a;padding:96px 24px;position:relative;overflow:hidden;}
#arena-landing .mig-showcase::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle at 30% 50%,rgba(16,185,129,.1) 0%,transparent 65%),linear-gradient(rgba(16,185,129,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,.03) 1px,transparent 1px);background-size:100% 100%,48px 48px,48px 48px;}
#arena-landing .mig-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;position:relative;z-index:1;}
#arena-landing .mig-tag{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6EE7B7;margin-bottom:16px;}
#arena-landing .mig-visual{display:flex;flex-direction:column;gap:8px;}
#arena-landing .mig-phase{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;transition:border-color .2s;}
#arena-landing .mig-phase:hover{border-color:rgba(16,185,129,.3);}
#arena-landing .mig-phase-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
#arena-landing .mig-phase-name{font-size:.82rem;font-weight:700;color:#fff;flex:1;}
#arena-landing .mig-phase-status{font-size:.65rem;font-weight:700;padding:3px 8px;border-radius:20px;}
#arena-landing .mig-phase-pct{font-size:.72rem;font-weight:600;color:rgba(255,255,255,.35);min-width:34px;text-align:right;}
@media(max-width:900px){#arena-landing .mig-inner{grid-template-columns:1fr;}#arena-landing .mig-visual{display:none;}}

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

/* ── DEMO CAROUSEL ───────────────────────────────────────────────────── */
#arena-landing .dc-section{padding:8px 24px 80px;}
#arena-landing .dc-dots{display:flex;justify-content:center;gap:7px;margin-bottom:32px;}
#arena-landing .dc-dot{height:6px;width:6px;border-radius:3px;border:none;padding:0;background:rgba(100,160,220,0.25);cursor:pointer;transition:all .25s;}
#arena-landing .dc-dot.on{width:28px;background:#2563EB;}
#arena-landing .dc-slides{max-width:1020px;margin:0 auto;}
#arena-landing .dc-slide{display:none;grid-template-columns:1fr 1fr;gap:52px;align-items:center;}
#arena-landing .dc-slide.on{display:grid;animation:dc-fadeUp .35s ease forwards;}
@keyframes dc-fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@media(max-width:660px){#arena-landing .dc-slide{grid-template-columns:1fr;gap:28px;}}
#arena-landing .dc-tag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#F59E0B;margin-bottom:10px;}
#arena-landing .dc-slide h2{font-family:'DM Serif Display',Georgia,serif;font-size:clamp(24px,3.5vw,36px);line-height:1.15;color:#DCE8F4;text-wrap:balance;letter-spacing:-0.01em;margin-bottom:14px;}
#arena-landing .dc-slide p{color:#7090B0;font-size:15px;line-height:1.7;margin-bottom:22px;}
#arena-landing .dc-flist{list-style:none;display:flex;flex-direction:column;gap:10px;}
#arena-landing .dc-flist li{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#7090B0;line-height:1.5;}
#arena-landing .dc-fdot{width:18px;height:18px;border-radius:50%;flex-shrink:0;background:rgba(34,211,238,0.08);border:1.5px solid rgba(34,211,238,0.4);display:flex;align-items:center;justify-content:center;}
#arena-landing .dc-prog-wrap{max-width:1020px;margin:18px auto 0;height:2px;background:rgba(100,160,220,0.1);border-radius:1px;overflow:hidden;}
#arena-landing .dc-prog-fill{height:100%;background:#2563EB;transition:width .08s linear;}
#arena-landing .dc-mockup{background:#0D1E30;border:1px solid rgba(100,160,220,0.12);border-radius:14px;overflow:hidden;box-shadow:0 2px 0 rgba(100,160,220,0.06),0 24px 64px rgba(0,0,0,.5);}
#arena-landing .dc-chrome{background:#132436;border-bottom:1px solid rgba(100,160,220,0.1);padding:9px 12px;display:flex;align-items:center;gap:7px;}
#arena-landing .dc-chrdot{width:8px;height:8px;border-radius:50%;}
#arena-landing .dc-urlbar{flex:1;height:20px;background:#1A2F44;border-radius:4px;margin:0 7px;display:flex;align-items:center;padding:0 8px;}
#arena-landing .dc-urlstr{font-size:9px;color:rgba(100,160,220,0.4);}
#arena-landing .dc-body{padding:14px;min-height:250px;}
#arena-landing .dc-badge{display:inline-flex;font-size:9px;font-weight:600;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;}
#arena-landing .dc-b-blue{background:rgba(37,99,235,0.18);color:#60A5FA;}
#arena-landing .dc-b-amber{background:rgba(245,158,11,0.15);color:#F59E0B;}
#arena-landing .dc-b-green{background:rgba(16,185,129,0.14);color:#10B981;}
#arena-landing .dc-b-purple{background:rgba(167,139,250,0.14);color:#A78BFA;}
#arena-landing .dc-b-gray{background:rgba(100,160,220,0.08);color:#7090B0;}
#arena-landing .dc-area{display:inline-flex;font-size:9px;color:#405870;background:#1A2F44;padding:2px 6px;border-radius:4px;}
#arena-landing .dc-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px;}
#arena-landing .dc-stat{background:#132436;border:1px solid rgba(100,160,220,0.1);border-radius:9px;padding:10px;}
#arena-landing .dc-stat-lbl{font-size:9px;color:#405870;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
#arena-landing .dc-stat-val{font-size:20px;font-weight:700;color:#DCE8F4;font-variant-numeric:tabular-nums;line-height:1;}
#arena-landing .dc-stat-delta{font-size:9px;color:#10B981;margin-top:3px;}
#arena-landing .dc-case-row{display:flex;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid rgba(100,160,220,0.07);}
#arena-landing .dc-case-row:last-child{border-bottom:none;}
#arena-landing .dc-case-title{flex:1;font-size:10px;font-weight:500;color:#DCE8F4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#arena-landing .dc-rank-item{display:flex;align-items:center;gap:9px;padding:9px 10px;background:#132436;border-radius:9px;margin-bottom:7px;border:1px solid rgba(100,160,220,0.08);}
#arena-landing .dc-rank-item.top{background:rgba(37,99,235,0.08);border-color:rgba(37,99,235,0.35);}
#arena-landing .dc-rank-n{font-size:10px;font-weight:700;color:#405870;width:14px;flex-shrink:0;}
#arena-landing .dc-rank-av{width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}
#arena-landing .dc-rank-info{flex:1;min-width:0;}
#arena-landing .dc-rank-name{font-size:10px;font-weight:600;color:#DCE8F4;}
#arena-landing .dc-skill-tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:3px;}
#arena-landing .dc-stag{font-size:8px;padding:1px 5px;border-radius:3px;background:#1A2F44;color:#7090B0;}
#arena-landing .dc-bar-wrap{height:2px;background:#1A2F44;border-radius:1px;overflow:hidden;margin-top:4px;}
#arena-landing .dc-bar{height:100%;background:#2563EB;border-radius:1px;transition:width .9s ease;}
#arena-landing .dc-rank-pts{font-size:17px;font-weight:800;color:#60A5FA;flex-shrink:0;}
#arena-landing .dc-rank-item:not(.top) .dc-rank-pts{font-size:14px;color:#7090B0;}
#arena-landing .dc-lc-track{position:relative;margin-bottom:14px;padding-top:6px;}
#arena-landing .dc-lc-line{position:absolute;top:20px;left:10%;right:10%;height:2px;background:rgba(100,160,220,0.1);}
#arena-landing .dc-lc-done{position:absolute;top:20px;left:10%;width:55%;height:2px;background:#2563EB;}
#arena-landing .dc-lc-stages{display:flex;justify-content:space-between;position:relative;z-index:1;}
#arena-landing .dc-lc-stage{display:flex;flex-direction:column;align-items:center;gap:5px;}
#arena-landing .dc-lc-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#arena-landing .dc-lc-dot.done{background:#2563EB;}
#arena-landing .dc-lc-dot.current{background:transparent;border:2px solid #2563EB;box-shadow:0 0 0 3px rgba(37,99,235,0.2);}
#arena-landing .dc-lc-dot.pending{background:#132436;border:2px solid rgba(100,160,220,0.15);}
#arena-landing .dc-lc-lbl{font-size:8px;color:#405870;white-space:nowrap;}
#arena-landing .dc-cc{background:#132436;border:1px solid rgba(37,99,235,0.3);border-radius:10px;padding:12px;}
#arena-landing .dc-cc-title{font-size:11px;font-weight:600;color:#DCE8F4;margin-bottom:8px;}
#arena-landing .dc-cc-meta{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;}
#arena-landing .dc-cc-fields{display:flex;gap:16px;}
#arena-landing .dc-cc-f-lbl{font-size:8px;color:#405870;margin-bottom:2px;}
#arena-landing .dc-cc-f-val{font-size:10px;font-weight:600;color:#DCE8F4;}
#arena-landing .dc-arena-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
#arena-landing .dc-arena-card{background:#132436;border:1px solid rgba(100,160,220,0.1);border-radius:10px;padding:10px;}
#arena-landing .dc-arena-card.ft{background:rgba(37,99,235,0.07);border-color:rgba(37,99,235,0.4);}
#arena-landing .dc-a-tag{font-size:8px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;}
#arena-landing .dc-a-title{font-size:10px;font-weight:600;color:#DCE8F4;line-height:1.35;margin-bottom:6px;}
#arena-landing .dc-a-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px;}
#arena-landing .dc-a-match{font-size:12px;font-weight:700;color:#10B981;}
#arena-landing .dc-a-apply{font-size:9px;font-weight:600;padding:3px 9px;background:#2563EB;color:#fff;border:none;border-radius:5px;cursor:pointer;font-family:inherit;}
#arena-landing .dc-a-apply.ghost{background:#1A2F44;color:#7090B0;}
#arena-landing .dc-a-more{display:flex;align-items:center;justify-content:center;border:1px dashed rgba(100,160,220,0.15);border-radius:10px;padding:10px;font-size:9px;color:#405870;}
@media(prefers-reduced-motion:reduce){#arena-landing .dc-slide.on{animation:none;}#arena-landing .dc-bar{transition:none;}}
/* ── ARENA PROMO ─────────────────── */
#arena-landing .ap-section{position:relative;overflow:hidden;padding:60px 24px 80px;background:linear-gradient(180deg,#05080F 0%,#080E1A 100%);}
#arena-landing .ap-bg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
#arena-landing .ap-inner{position:relative;z-index:1;max-width:900px;margin:0 auto;}
#arena-landing .ap-header{text-align:center;margin-bottom:36px;}
#arena-landing .ap-tag{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4F6EF7;margin-bottom:10px;}
#arena-landing .ap-title{font-size:clamp(22px,4vw,38px);font-weight:800;color:#DCE8F4;line-height:1.15;margin-bottom:8px;}
#arena-landing .ap-sub{font-size:15px;color:#7090B0;}
#arena-landing .ap-player{background:#0C1522;border:1px solid rgba(100,160,220,0.12);border-radius:16px;overflow:hidden;}
#arena-landing .ap-stage{position:relative;height:320px;overflow:hidden;}
#arena-landing .ap-scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .5s;}
#arena-landing .ap-scene.on{opacity:1;}
#arena-landing .ap-content{position:relative;z-index:1;display:flex;gap:36px;align-items:center;padding:28px 32px;width:100%;box-sizing:border-box;}
#arena-landing .ap-copy{flex:1;min-width:0;}
#arena-landing .ap-s-tag{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#F59E0B;margin-bottom:8px;}
#arena-landing .ap-s-h{font-size:clamp(17px,2.5vw,23px);font-weight:800;color:#DCE8F4;margin-bottom:10px;line-height:1.2;}
#arena-landing .ap-s-p{font-size:13px;color:#7090B0;line-height:1.6;}
#arena-landing .ap-visual{width:240px;flex-shrink:0;}
#arena-landing .ap-controls{padding:12px 20px;border-top:1px solid rgba(100,160,220,0.08);display:flex;flex-direction:column;gap:10px;}
#arena-landing .ap-scrubber{position:relative;height:3px;background:rgba(100,160,220,0.12);border-radius:2px;cursor:pointer;}
#arena-landing .ap-prog{height:100%;border-radius:2px;background:#4F6EF7;transition:width .1s linear;}
#arena-landing .ap-btns{display:flex;align-items:center;gap:10px;}
#arena-landing .ap-btn{background:none;border:none;color:#7090B0;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:color .2s;}
#arena-landing .ap-btn:hover{color:#DCE8F4;}
#arena-landing .ap-chaps{display:flex;gap:6px;margin-left:auto;}
#arena-landing .ap-chap{width:7px;height:7px;border-radius:50%;background:rgba(100,160,220,0.2);border:none;cursor:pointer;transition:background .2s,transform .2s;padding:0;}
#arena-landing .ap-chap.on{background:#4F6EF7;transform:scale(1.3);}
#arena-landing .ap-orb-wrap{position:relative;width:220px;height:220px;flex-shrink:0;}
#arena-landing .ap-orb-cv{width:100%;height:100%;}
#arena-landing .ap-tree{display:flex;flex-direction:column;gap:7px;}
#arena-landing .ap-tree-row{display:flex;align-items:center;gap:8px;opacity:0;transform:translateX(10px);transition:opacity .4s,transform .4s;}
#arena-landing .ap-tree-row.show{opacity:1;transform:none;}
#arena-landing .ap-tree-icon{width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;}
#arena-landing .ap-tree-name{font-size:11px;font-weight:600;color:#DCE8F4;}
#arena-landing .ap-tree-sub{font-size:9px;color:#405870;}
#arena-landing .ap-case-card{background:#132436;border:1px solid rgba(37,99,235,0.4);border-radius:10px;padding:11px;opacity:0;transform:translateY(6px);transition:opacity .4s .2s,transform .4s .2s;}
#arena-landing .ap-case-card.show{opacity:1;transform:none;}
#arena-landing .ap-lc{display:flex;flex-direction:column;gap:5px;}
#arena-landing .ap-lc-node{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:8px;background:#132436;border:1px solid rgba(100,160,220,0.1);opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;}
#arena-landing .ap-lc-node.show{opacity:1;transform:none;}
#arena-landing .ap-lc-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
#arena-landing .ap-lc-label{font-size:11px;font-weight:600;color:#DCE8F4;}
#arena-landing .ap-lc-badge{margin-left:auto;font-size:9px;font-weight:700;padding:2px 7px;border-radius:12px;}
#arena-landing .ap-ac-grid{display:flex;flex-direction:column;gap:6px;}
#arena-landing .ap-ac-card{background:#132436;border:1px solid rgba(100,160,220,0.1);border-radius:9px;padding:9px;display:flex;align-items:center;gap:9px;opacity:0;transform:translateX(10px);transition:opacity .35s,transform .35s;}
#arena-landing .ap-ac-card.show{opacity:1;transform:none;}
#arena-landing .ap-ac-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;}
#arena-landing .ap-ac-name{font-size:11px;font-weight:600;color:#DCE8F4;}
#arena-landing .ap-ac-role{font-size:9px;color:#405870;}
#arena-landing .ap-ac-match{margin-left:auto;font-size:14px;font-weight:800;color:#10B981;font-variant-numeric:tabular-nums;}
#arena-landing .ap-cta-grid{display:flex;gap:12px;width:100%;}
#arena-landing .ap-cta-card{flex:1;background:#132436;border-radius:12px;padding:18px;text-align:center;border:1px solid rgba(100,160,220,0.12);}
#arena-landing .ap-cta-card.blue{border-color:rgba(37,99,235,0.5);}
#arena-landing .ap-cta-icon{font-size:22px;margin-bottom:7px;}
#arena-landing .ap-cta-title{font-size:13px;font-weight:700;color:#DCE8F4;margin-bottom:4px;}
#arena-landing .ap-cta-desc{font-size:10px;color:#7090B0;margin-bottom:11px;}
#arena-landing .ap-cta-btn{font-size:11px;font-weight:700;padding:6px 14px;border-radius:7px;border:none;cursor:pointer;font-family:inherit;}
#arena-landing .ap-cta-btn.primary{background:#2563EB;color:#fff;}
#arena-landing .ap-cta-btn.ghost{background:#1A2F44;color:#7090B0;}
@media(max-width:640px){#arena-landing .ap-content{flex-direction:column;}#arena-landing .ap-visual,#arena-landing .ap-orb-wrap{width:100%;}}
@media(prefers-reduced-motion:reduce){#arena-landing .ap-scene{transition:none;}#arena-landing .ap-prog{transition:none;}}
`;

function ArenaPromoVideo({ tl }) {
  const SCENES = [
    {tag:tl('ap_s0_tag'), h:tl('ap_s0_h'), p:tl('ap_s0_p'), dur:4500},
    {tag:tl('ap_s1_tag'), h:tl('ap_s1_h'), p:tl('ap_s1_p'), dur:5800},
    {tag:tl('ap_s2_tag'), h:tl('ap_s2_h'), p:tl('ap_s2_p'), dur:5200},
    {tag:tl('ap_s3_tag'), h:tl('ap_s3_h'), p:tl('ap_s3_p'), dur:5100},
    {tag:tl('ap_s4_tag'), h:tl('ap_s4_h'), p:tl('ap_s4_p'), dur:4800},
    {tag:tl('ap_s5_tag'), h:tl('ap_s5_h'), p:tl('ap_s5_p'), dur:4500},
  ];
  const TOTAL = SCENES.length;
  const TICK = 80;

  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [drillShow, setDrillShow] = useState([false,false,false,false]);
  const [drillCase, setDrillCase] = useState(false);
  const [lcShow, setLcShow] = useState([false,false,false,false,false]);
  const [acShow, setAcShow] = useState([false,false,false]);
  const [acPct, setAcPct] = useState([0,0,0]);
  const [ctaShow, setCtaShow] = useState([false,false]);

  const elapsedRef = useRef(0);
  const playingRef = useRef(true);
  const bgCvRef    = useRef(null);
  const orbCvRef   = useRef(null);
  const orbAngles  = useRef([0, 2.1, 1.0, 3.2]);
  const orbSel     = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    const cv = bgCvRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const pts = Array.from({length:50}, () => ({
      x:Math.random()*800, y:Math.random()*340,
      vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.3,
      r:Math.random()*1.5+.5, a:Math.random()*.4+.1
    }));
    let raf;
    function draw() {
      const W = cv.offsetWidth||800, H = cv.offsetHeight||340;
      if (cv.width!==W||cv.height!==H) { cv.width=W; cv.height=H; }
      ctx.clearRect(0,0,W,H);
      pts.forEach(p => {
        p.x=(p.x+p.vx+W)%W; p.y=(p.y+p.vy+H)%H;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(79,110,247,${p.a})`; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (cur !== 1) return;
    const cv = orbCvRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const ORBS = [
      {label:'FICO Q4', color:'#4F6EF7', r:72,  speed:.45},
      {label:'MM/SD',   color:'#F59E0B', r:100, speed:.28},
      {label:'S/4HANA', color:'#A78BFA', r:126, speed:.19},
      {label:'Basis',   color:'#10B981', r:150, speed:.13},
    ];
    orbSel.current = false;
    const selTimer = setTimeout(() => { orbSel.current = true; }, 2800);
    let raf, last = performance.now();
    function draw(now) {
      const dt = (now - last)/1000; last = now;
      const W = cv.offsetWidth||220, H = cv.offsetHeight||220;
      if (cv.width!==W||cv.height!==H) { cv.width=W; cv.height=H; }
      ctx.clearRect(0,0,W,H);
      const cx=W/2, cy=H/2;
      orbAngles.current = orbAngles.current.map((a,i) => a + ORBS[i].speed*dt);
      ORBS.forEach(o => {
        ctx.beginPath(); ctx.ellipse(cx,cy,o.r,o.r*.38,0,0,Math.PI*2);
        ctx.strokeStyle='rgba(100,160,220,0.08)'; ctx.lineWidth=1; ctx.stroke();
      });
      const hg = ctx.createRadialGradient(cx,cy,0,cx,cy,22);
      hg.addColorStop(0,'rgba(37,99,235,0.9)'); hg.addColorStop(1,'rgba(37,99,235,0.2)');
      ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill();
      ctx.font='bold 13px sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('A',cx,cy);
      ORBS.forEach((o,i) => {
        const a=orbAngles.current[i];
        const nx=cx+o.r*Math.cos(a), ny=cy+o.r*.38*Math.sin(a);
        const sel=i===0&&orbSel.current;
        if (sel) {
          ctx.beginPath(); ctx.arc(nx,ny,22,0,Math.PI*2);
          ctx.strokeStyle='rgba(79,110,247,0.4)'; ctx.lineWidth=2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny);
          ctx.strokeStyle='rgba(79,110,247,0.3)'; ctx.lineWidth=1; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(nx,ny,sel?12:9,0,Math.PI*2);
        ctx.fillStyle=o.color; ctx.fill();
        ctx.font=`${sel?'bold ':''} 8px sans-serif`; ctx.fillStyle='#DCE8F4';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText(o.label,nx,ny+14);
      });
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); clearTimeout(selTimer); };
  }, [cur]);

  useEffect(() => {
    const ts = [];
    setDrillShow([false,false,false,false]); setDrillCase(false);
    setLcShow([false,false,false,false,false]);
    setAcShow([false,false,false]); setAcPct([0,0,0]);
    setCtaShow([false,false]);
    if (cur===2) {
      [0,1,2,3].forEach(i => ts.push(setTimeout(() => setDrillShow(p=>{const n=[...p];n[i]=true;return n;}),200+i*200)));
      ts.push(setTimeout(()=>setDrillCase(true),1100));
    }
    if (cur===3) {
      [0,1,2,3,4].forEach(i => ts.push(setTimeout(()=>setLcShow(p=>{const n=[...p];n[i]=true;return n;}),200+i*250)));
    }
    if (cur===4) {
      const tgts=[97,89,84];
      [0,1,2].forEach(i => {
        ts.push(setTimeout(()=>setAcShow(p=>{const n=[...p];n[i]=true;return n;}),300+i*300));
        ts.push(setTimeout(()=>{
          let v=0; const iv=setInterval(()=>{
            v=Math.min(v+3,tgts[i]);
            setAcPct(p=>{const n=[...p];n[i]=v;return n;});
            if(v>=tgts[i])clearInterval(iv);
          },30);
        },600+i*300));
      });
    }
    if (cur===5) {
      [0,1].forEach(i=>ts.push(setTimeout(()=>setCtaShow(p=>{const n=[...p];n[i]=true;return n;}),300+i*250)));
    }
    return ()=>ts.forEach(clearTimeout);
  }, [cur]);

  useEffect(() => {
    if (!playing) return;
    elapsedRef.current=0; setProgress(0);
    const dur=SCENES[cur].dur;
    const pg=setInterval(()=>{
      if(!playingRef.current)return;
      elapsedRef.current+=TICK;
      setProgress(Math.min((elapsedRef.current/dur)*100,100));
    },TICK);
    const adv=setTimeout(()=>{
      if(!playingRef.current)return;
      setCur(c=>(c+1)%TOTAL);
    },dur);
    return ()=>{clearInterval(pg);clearTimeout(adv);};
  }, [playing, cur]);

  function goTo(n){setCur(n);setProgress(0);}
  function toggle(){setPlaying(p=>!p);}

  const drillRows=[
    {icon:'🏢',bg:'#1A2F44',                    name:'Meridian Holdings',       sub:tl('ap_drill_hub')},
    {icon:'⚙️',bg:'rgba(37,99,235,0.15)',        name:tl('ap_drill_r1'),         sub:tl('ap_drill_r1s')},
    {icon:'📦',bg:'rgba(245,158,11,0.15)',       name:tl('ap_drill_r2'),         sub:tl('ap_drill_r2s')},
    {icon:'🔧',bg:'rgba(167,139,250,0.15)',      name:tl('ap_drill_r3'),         sub:tl('ap_drill_r3s')},
  ];
  const lcNodes=[
    {color:'#10B981',label:tl('ap_lc_open'), badge:tl('ap_badge_done'),   bc:'rgba(16,185,129,0.15)',  tc:'#10B981'},
    {color:'#4F6EF7',label:tl('ap_lc_spec'), badge:tl('ap_badge_done'),   bc:'rgba(79,110,247,0.15)',  tc:'#4F6EF7'},
    {color:'#F59E0B',label:tl('ap_lc_dev'),  badge:tl('ap_badge_active'), bc:'rgba(245,158,11,0.15)', tc:'#F59E0B'},
    {color:'#405870',label:tl('ap_lc_test'), badge:tl('ap_badge_locked'), bc:'rgba(64,88,112,0.15)',  tc:'#7090B0'},
    {color:'#405870',label:tl('ap_lc_close'),badge:tl('ap_badge_locked'), bc:'rgba(64,88,112,0.15)',  tc:'#7090B0'},
  ];
  const acCards=[
    {av:'MR',bg:'linear-gradient(135deg,#4F6EF7,#818CF8)',name:tl('ap_ac_r1name'),role:tl('ap_ac_r1role')},
    {av:'SK',bg:'linear-gradient(135deg,#10B981,#34D399)', name:tl('ap_ac_r2name'),role:tl('ap_ac_r2role')},
    {av:'JL',bg:'linear-gradient(135deg,#F59E0B,#FCD34D)', name:tl('ap_ac_r3name'),role:tl('ap_ac_r3role')},
  ];

  return (
    <section className="ap-section" id="promo">
      <canvas ref={bgCvRef} className="ap-bg" />
      <div className="ap-inner">
        <div className="ap-header">
          <div className="ap-tag">{tl('ap_header_tag')}</div>
          <h2 className="ap-title">{tl('ap_header_h')}</h2>
          <p className="ap-sub">{tl('ap_header_p')}</p>
        </div>
        <div className="ap-player">
          <div className="ap-stage">
            {/* Scene 0 — Brand */}
            <div className={`ap-scene${cur===0?' on':''}`}>
              <div className="ap-content">
                <div className="ap-copy">
                  <div className="ap-s-tag">{SCENES[0].tag}</div>
                  <h3 className="ap-s-h">{SCENES[0].h}</h3>
                  <p className="ap-s-p">{SCENES[0].p}</p>
                </div>
                <div className="ap-visual" style={{display:'flex',alignItems:'center',justifyContent:'center',height:200}}>
                  <div style={{position:'relative',width:80,height:80}}>
                    <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'linear-gradient(135deg,#2563EB,#4F6EF7)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,fontWeight:900,color:'#fff'}}>A</div>
                    {[{r:52,spd:18,sz:8,c:'#4F6EF7',d:0},{r:72,spd:28,sz:6,c:'#F59E0B',d:-8},{r:90,spd:38,sz:5,c:'#22D3EE',d:-15}].map((o,i)=>(
                      <div key={i} style={{position:'absolute',width:o.sz,height:o.sz,borderRadius:'50%',background:o.c,
                        top:'50%',left:'50%',marginTop:-o.sz/2,marginLeft:-o.sz/2,
                        animation:`nova-lmark ${o.spd}s linear infinite`,
                        '--nls':`${o.d}deg`,'--nlr':`${o.r}px`,transformOrigin:'0 0'}} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scene 1 — Orbital */}
            <div className={`ap-scene${cur===1?' on':''}`}>
              <div className="ap-content">
                <div className="ap-copy">
                  <div className="ap-s-tag">{SCENES[1].tag}</div>
                  <h3 className="ap-s-h">{SCENES[1].h}</h3>
                  <p className="ap-s-p">{SCENES[1].p}</p>
                </div>
                <div className="ap-orb-wrap">
                  <canvas ref={orbCvRef} className="ap-orb-cv" />
                </div>
              </div>
            </div>

            {/* Scene 2 — Drill-down */}
            <div className={`ap-scene${cur===2?' on':''}`}>
              <div className="ap-content">
                <div className="ap-copy">
                  <div className="ap-s-tag">{SCENES[2].tag}</div>
                  <h3 className="ap-s-h">{SCENES[2].h}</h3>
                  <p className="ap-s-p">{SCENES[2].p}</p>
                </div>
                <div className="ap-visual">
                  <div className="ap-tree">
                    {drillRows.map((r,i)=>(
                      <div key={i} className={`ap-tree-row${drillShow[i]?' show':''}`} style={{paddingLeft:i>0?14:0}}>
                        <div className="ap-tree-icon" style={{background:r.bg}}>{r.icon}</div>
                        <div><div className="ap-tree-name">{r.name}</div><div className="ap-tree-sub">{r.sub}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className={`ap-case-card${drillCase?' show':''}`} style={{marginTop:9}}>
                    <div style={{fontSize:9,color:'#F59E0B',fontWeight:700,marginBottom:4}}>{tl('ap_case_module')}</div>
                    <div style={{fontSize:11,color:'#DCE8F4',marginBottom:6}}>{tl('ap_case_title')}</div>
                    <div style={{display:'flex',gap:16}}>
                      <div><div style={{fontSize:8,color:'#405870'}}>{tl('ap_case_hours')}</div><div style={{fontSize:11,fontWeight:700,color:'#DCE8F4'}}>142 / 200</div></div>
                      <div><div style={{fontSize:8,color:'#405870'}}>{tl('ap_case_stage')}</div><div style={{fontSize:11,fontWeight:700,color:'#4F6EF7'}}>{tl('ap_case_stage_val')}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scene 3 — Lifecycle */}
            <div className={`ap-scene${cur===3?' on':''}`}>
              <div className="ap-content">
                <div className="ap-copy">
                  <div className="ap-s-tag">{SCENES[3].tag}</div>
                  <h3 className="ap-s-h">{SCENES[3].h}</h3>
                  <p className="ap-s-p">{SCENES[3].p}</p>
                </div>
                <div className="ap-visual">
                  <div className="ap-lc">
                    {lcNodes.map((n,i)=>(
                      <div key={i} className={`ap-lc-node${lcShow[i]?' show':''}`} style={{transitionDelay:`${i*40}ms`}}>
                        <div className="ap-lc-dot" style={{background:n.color}} />
                        <span className="ap-lc-label">{n.label}</span>
                        <span className="ap-lc-badge" style={{background:n.bc,color:n.tc}}>{n.badge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scene 4 — Arena */}
            <div className={`ap-scene${cur===4?' on':''}`}>
              <div className="ap-content">
                <div className="ap-copy">
                  <div className="ap-s-tag">{SCENES[4].tag}</div>
                  <h3 className="ap-s-h">{SCENES[4].h}</h3>
                  <p className="ap-s-p">{SCENES[4].p}</p>
                </div>
                <div className="ap-visual">
                  <div className="ap-ac-grid">
                    {acCards.map((c,i)=>(
                      <div key={i} className={`ap-ac-card${acShow[i]?' show':''}`} style={{transitionDelay:`${i*40}ms`}}>
                        <div className="ap-ac-av" style={{background:c.bg}}>{c.av}</div>
                        <div><div className="ap-ac-name">{c.name}</div><div className="ap-ac-role">{c.role}</div></div>
                        <div className="ap-ac-match">{acPct[i]}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scene 5 — CTA */}
            <div className={`ap-scene${cur===5?' on':''}`}>
              <div className="ap-content" style={{flexDirection:'column',gap:20,justifyContent:'center'}}>
                <div className="ap-copy" style={{textAlign:'center'}}>
                  <div className="ap-s-tag">{tl('ap_ready')}</div>
                  <h3 className="ap-s-h">{tl('ap_s5_h')}</h3>
                  <p className="ap-s-p">{tl('ap_s5_p')}</p>
                </div>
                <div className="ap-cta-grid">
                  {[
                    {icon:'🏢',title:tl('ap_cta_companies_title'),  desc:tl('ap_cta_companies_desc'),    btn:tl('ap_cta_companies_btn'),   primary:true,  show:ctaShow[0]},
                    {icon:'👤',title:tl('ap_cta_consultants_title'),desc:tl('ap_cta_consultants_desc'),  btn:tl('ap_cta_consultants_btn'), primary:false, show:ctaShow[1]},
                  ].map((c,i)=>(
                    <div key={i} className={`ap-cta-card${c.primary?' blue':''}`}
                      style={{opacity:c.show?1:0,transform:c.show?'none':'translateY(8px)',transition:'opacity .4s,transform .4s'}}>
                      <div className="ap-cta-icon">{c.icon}</div>
                      <div className="ap-cta-title">{c.title}</div>
                      <div className="ap-cta-desc">{c.desc}</div>
                      <button className={`ap-cta-btn ${c.primary?'primary':'ghost'}`}>{c.btn}</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ap-controls">
            <div className="ap-scrubber" onClick={e=>{
              const rect=e.currentTarget.getBoundingClientRect();
              goTo(Math.min(TOTAL-1,Math.floor((e.clientX-rect.left)/rect.width*TOTAL)));
            }}>
              <div className="ap-prog" style={{width:`${(cur/TOTAL)*100 + progress/TOTAL}%`}} />
            </div>
            <div className="ap-btns">
              <button className="ap-btn" onClick={toggle} aria-label={playing?tl('ap_pause'):tl('ap_play')}>
                {playing
                  ? <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg>}
              </button>
              <span style={{fontSize:11,color:'#405870',marginLeft:4}}>{SCENES[cur].tag} · {cur+1} {tl('ap_scene_of')} {TOTAL}</span>
              <div className="ap-chaps">
                {SCENES.map((_,i)=>(
                  <button key={i} className={`ap-chap${cur===i?' on':''}`} onClick={()=>goTo(i)} aria-label={`Scene ${i+1}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CHECK_SVG = (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
    <path d="M1.5 4l1.8 1.8L6.5 2" stroke="#22D3EE" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const DONE_SVG = (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
    <path d="M1.5 4.5l2 2L7.5 2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LC_STAGES = [
  { n:1, l:"New\nRequest",      c:"#6366F1", t:"#A5B4FC", bg:"rgba(99,102,241,.1)", abg:"rgba(99,102,241,.28)",
    gates:[
      {l:"Case description completed",s:"pass"},
      {l:"SAP module assigned",s:"pass"},
    ],
    tabs:{"Details":"Case title, description, module, priority, and client — the full context in one view.","Comments":"Internal thread for the team before assignment."}
  },
  { n:2, l:"Triage",            c:"#F59E0B", t:"#FCD34D", bg:"rgba(245,158,11,.1)", abg:"rgba(245,158,11,.28)",
    gates:[
      {l:"Priority level set",s:"pass"},
      {l:"Consultant shortlisted",s:"pass"},
      {l:"Initial estimate logged",s:"warn"},
    ],
    tabs:{"Details":"Priority, SLA timer start, category, and assignment status.","Documents":"Attach initial scope documents or RFI files.","Comments":"Triage notes and internal discussion."}
  },
  { n:3, l:"In\nAnalysis",      c:"#3B82F6", t:"#93C5FD", bg:"rgba(59,130,246,.1)", abg:"rgba(59,130,246,.28)",
    gates:[
      {l:"AI spec generated or manual spec attached",s:"pass"},
      {l:"Estimated hours entered",s:"pass"},
      {l:"Client notified of analysis start",s:"warn"},
    ],
    tabs:{"Details":"Analysis summary, effort estimate, risk flags.","AI Spec":"Claude-generated functional specification — review, edit, and send for client approval.","Time Log":"Log analysis hours against the case.","Documents":"Attach specs, diagrams, or discovery outputs.","Comments":"Analysis notes and client updates."}
  },
  { n:4, l:"In\nProgress",      c:"#8B5CF6", t:"#C4B5FD", bg:"rgba(139,92,246,.1)", abg:"rgba(139,92,246,.28)",
    gates:[
      {l:"Logged hours ≥ minimum threshold",s:"pass"},
      {l:"Functional spec approved by client",s:"warn"},
      {l:"Key user sign-off obtained",s:"fail"},
    ],
    tabs:{"Details":"Progress status, consultant, SLA countdown.","Activities":"Log work activities, sub-tasks, and delivery updates.","AI Spec":"View, regenerate, or request client approval on spec.","Time Log":"Track all billable hours — manager approval required.","Documents":"Dev artifacts, evidence files, and change logs.","Comments":"Team discussion and client-facing updates."}
  },
  { n:5, l:"Testing /\nValidation", c:"#06B6D4", t:"#67E8F9", bg:"rgba(6,182,212,.1)", abg:"rgba(6,182,212,.28)",
    gates:[
      {l:"Test results document uploaded",s:"pass"},
      {l:"Zero open critical fit-gaps",s:"warn"},
      {l:"Key user signed off on testing",s:"fail"},
    ],
    tabs:{"Details":"Test scope, assigned validator, sign-off status.","Activities":"Log test sessions, findings, and retest cycles.","AI Spec":"Testing spec and validation checklist.","Time Log":"Log testing hours separately from delivery.","Documents":"Test scripts, results, UAT evidence.","Comments":"QA notes and client sign-off thread."}
  },
  { n:6, l:"Resolved",          c:"#10B981", t:"#6EE7B7", bg:"rgba(16,185,129,.1)", abg:"rgba(16,185,129,.28)",
    gates:[
      {l:"Client confirmation received",s:"pass"},
      {l:"Invoice generated",s:"warn"},
    ],
    tabs:{"Details":"Resolution summary, total hours, and SLA outcome.","Documents":"Final deliverables, invoice, and closure report.","Comments":"Closure notes and client feedback."}
  },
  { n:7, l:"Closed",            c:"#6B7280", t:"#D1D5DB", bg:"rgba(107,114,128,.1)", abg:"rgba(107,114,128,.28)",
    gates:[],
    tabs:{"Details":"Archived case record — read-only after closure.","Documents":"All attached files — read-only, downloadable."}
  },
];

function DemoCarousel({ tl }) {
  const TOTAL = 4;
  const DURATION = 5200;
  const TICK = 80;
  const [cur, setCur] = useState(0);
  const [barsOn, setBarsOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (cur === 1) { setBarsOn(false); const t = setTimeout(() => setBarsOn(true), 300); return () => clearTimeout(t); }
    setBarsOn(false);
  }, [cur]);

  useEffect(() => {
    if (paused) return;
    elapsedRef.current = 0;
    setProgress(0);
    const progTimer = setInterval(() => {
      elapsedRef.current += TICK;
      setProgress(Math.min((elapsedRef.current / DURATION) * 100, 100));
    }, TICK);
    const slideTimer = setTimeout(() => {
      setCur(c => (c + 1) % TOTAL);
    }, DURATION);
    return () => { clearInterval(progTimer); clearTimeout(slideTimer); };
  }, [paused, cur]);

  function goTo(n) { setCur(n); }

  return (
    <section className="dc-section" id="demo" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <nav className="dc-dots" aria-label="Product tour navigation">
        {tl('dc_labels').map((lbl, i) => (
          <button key={i} className={`dc-dot${cur===i?" on":""}`} aria-label={lbl} onClick={() => goTo(i)} />
        ))}
      </nav>

      <div className="dc-slides">

        {/* Slide 0 — Dashboard */}
        <div className={`dc-slide${cur===0?" on":""}`}>
          <div>
            <div className="dc-tag">{tl('dc_s0_tag')}</div>
            <h2>{tl('dc_s0_h')}</h2>
            <p>{tl('dc_s0_p')}</p>
            <ul className="dc-flist">
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s0_b1')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s0_b2')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s0_b3')}</li>
            </ul>
          </div>
          <div className="dc-mockup">
            <div className="dc-chrome">
              <div className="dc-chrdot" style={{background:"#FF5F57"}} /><div className="dc-chrdot" style={{background:"#FFBD2E"}} /><div className="dc-chrdot" style={{background:"#28C940"}} />
              <div className="dc-urlbar"><span className="dc-urlstr">techcase.app/dashboard</span></div>
            </div>
            <div className="dc-body">
              <div className="dc-stat-grid">
                <div className="dc-stat"><div className="dc-stat-lbl">{tl('dc_stat_cases')}</div><div className="dc-stat-val">12</div><div className="dc-stat-delta">{tl('dc_stat_cases_d')}</div></div>
                <div className="dc-stat"><div className="dc-stat-lbl">{tl('dc_stat_cons')}</div><div className="dc-stat-val">48</div><div className="dc-stat-delta">{tl('dc_stat_cons_d')}</div></div>
                <div className="dc-stat"><div className="dc-stat-lbl">{tl('dc_stat_fill')}</div><div className="dc-stat-val">94%</div><div className="dc-stat-delta">{tl('dc_stat_fill_d')}</div></div>
              </div>
              <div>
                <div className="dc-case-row"><div className="dc-case-title">{tl('dc_c1')}</div><span className="dc-area">FICO</span><span className="dc-badge dc-b-blue">{tl('dc_b_inprogress')}</span></div>
                <div className="dc-case-row"><div className="dc-case-title">{tl('dc_c2')}</div><span className="dc-area">MM/SD</span><span className="dc-badge dc-b-amber">{tl('dc_b_estimated')}</span></div>
                <div className="dc-case-row"><div className="dc-case-title">{tl('dc_c3')}</div><span className="dc-area">S/4HANA</span><span className="dc-badge dc-b-purple">{tl('dc_b_open')}</span></div>
                <div className="dc-case-row"><div className="dc-case-title">{tl('dc_c4')}</div><span className="dc-area">Basis</span><span className="dc-badge dc-b-green">{tl('dc_b_assigned')}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 1 — Migration Hub */}
        <div className={`dc-slide${cur===1?" on":""}`}>
          <div>
            <div className="dc-tag">{tl('dc_s1_tag')}</div>
            <h2>{tl('dc_s1_h')}</h2>
            <p>{tl('dc_s1_p')}</p>
            <ul className="dc-flist">
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s1_b1')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s1_b2')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s1_b3')}</li>
            </ul>
          </div>
          <div className="dc-mockup">
            <div className="dc-chrome">
              <div className="dc-chrdot" style={{background:"#FF5F57"}} /><div className="dc-chrdot" style={{background:"#FFBD2E"}} /><div className="dc-chrdot" style={{background:"#28C940"}} />
              <div className="dc-urlbar"><span className="dc-urlstr">techcase.app/migration/s4hana-q4</span></div>
            </div>
            <div className="dc-body">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:9,fontWeight:700,color:"#6EE7B7",letterSpacing:".05em",textTransform:"uppercase"}}>S/4HANA Q4 Migration</span>
                <span style={{fontSize:9,padding:"2px 8px",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",borderRadius:4,color:"#6EE7B7",fontWeight:600}}>Explore · Active</span>
              </div>
              {[
                {ph:"Discover",c:"#60A5FA",bg:"rgba(96,165,250,.12)",s:"✓ Done",w:100,top:false},
                {ph:"Prepare",c:"#60A5FA",bg:"rgba(96,165,250,.12)",s:"✓ Done",w:100,top:false},
                {ph:"Explore",c:"#6EE7B7",bg:"rgba(16,185,129,.15)",s:"Active",w: barsOn?68:0,top:true},
                {ph:"Realize",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.05)",s:"Locked",w:0,top:false},
                {ph:"Deploy",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.05)",s:"Locked",w:0,top:false},
                {ph:"Run",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.05)",s:"Locked",w:0,top:false},
              ].map(p => (
                <div key={p.ph} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:p.bg,border:`1px solid ${p.c}30`,borderRadius:6,marginBottom:4}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:p.c,flexShrink:0}} />
                  <div style={{fontSize:".62rem",fontWeight:700,color:p.c,flex:1}}>{p.ph}</div>
                  <div style={{flex:2,background:"rgba(255,255,255,.06)",borderRadius:3,height:4,overflow:"hidden"}}>
                    <div style={{width:p.w+"%",height:"100%",background:p.c,transition:"width .6s ease",borderRadius:3}} />
                  </div>
                  <div style={{fontSize:".55rem",color:p.c,minWidth:36,textAlign:"right",fontWeight:600}}>{p.s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Slide 2 — Lifecycle */}
        <div className={`dc-slide${cur===2?" on":""}`}>
          <div>
            <div className="dc-tag">{tl('dc_s2_tag')}</div>
            <h2>{tl('dc_s2_h')}</h2>
            <p>{tl('dc_s2_p')}</p>
            <ul className="dc-flist">
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s2_b1')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s2_b2')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s2_b3')}</li>
            </ul>
          </div>
          <div className="dc-mockup">
            <div className="dc-chrome">
              <div className="dc-chrdot" style={{background:"#FF5F57"}} /><div className="dc-chrdot" style={{background:"#FFBD2E"}} /><div className="dc-chrdot" style={{background:"#28C940"}} />
              <div className="dc-urlbar"><span className="dc-urlstr">techcase.app/cases/fico-q4</span></div>
            </div>
            <div className="dc-body">
              <div className="dc-lc-track">
                <div className="dc-lc-line" /><div className="dc-lc-done" />
                <div className="dc-lc-stages">
                  {[
                    {lbl:tl('dc_lc_open'),state:"done"},{lbl:tl('dc_lc_estimated'),state:"done"},{lbl:tl('dc_lc_assigned'),state:"done"},
                    {lbl:tl('dc_lc_inprogress'),state:"current"},{lbl:tl('dc_lc_review'),state:"pending"},{lbl:tl('dc_lc_done'),state:"pending"},
                  ].map(s => (
                    <div key={s.lbl} className="dc-lc-stage">
                      <div className={`dc-lc-dot ${s.state}`}>
                        {s.state==="done" && DONE_SVG}
                        {s.state==="current" && <div style={{width:8,height:8,borderRadius:"50%",background:"#2563EB"}} />}
                      </div>
                      <div className="dc-lc-lbl" style={s.state!=="pending"?{color:"#60A5FA"}:{}}>{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="dc-cc">
                <div className="dc-cc-title">{tl('dc_c1')}</div>
                <div className="dc-cc-meta">
                  <span className="dc-badge dc-b-blue">{tl('dc_b_inprogress')}</span>
                  <span className="dc-badge dc-b-amber">{tl('dc_b_highpriority')}</span>
                  <span className="dc-area">SAP FICO</span>
                </div>
                <div className="dc-cc-fields">
                  <div><div className="dc-cc-f-lbl">{tl('dc_s2_consultant')}</div><div className="dc-cc-f-val">María Rodríguez</div></div>
                  <div><div className="dc-cc-f-lbl">{tl('dc_s2_duedate')}</div><div className="dc-cc-f-val">Oct 31, 2026</div></div>
                  <div><div className="dc-cc-f-lbl">{tl('dc_s2_spec')}</div><div className="dc-cc-f-val" style={{color:"#22D3EE"}}>{tl('dc_s2_specval')}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 3 — Arena */}
        <div className={`dc-slide${cur===3?" on":""}`}>
          <div>
            <div className="dc-tag">{tl('dc_s3_tag')}</div>
            <h2>{tl('dc_s3_h')}</h2>
            <p>{tl('dc_s3_p')}</p>
            <ul className="dc-flist">
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s3_b1')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s3_b2')}</li>
              <li><span className="dc-fdot">{CHECK_SVG}</span>{tl('dc_s3_b3')}</li>
            </ul>
          </div>
          <div className="dc-mockup">
            <div className="dc-chrome">
              <div className="dc-chrdot" style={{background:"#FF5F57"}} /><div className="dc-chrdot" style={{background:"#FFBD2E"}} /><div className="dc-chrdot" style={{background:"#28C940"}} />
              <div className="dc-urlbar"><span className="dc-urlstr">techcase.app/arena</span></div>
            </div>
            <div className="dc-body">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:10,color:"#7090B0"}}>14 {tl('dc_s3_matches')}</span>
                <div style={{display:"flex",gap:4}}>
                  <span className="dc-badge dc-b-blue" style={{cursor:"pointer"}}>{tl('dc_a_filter_all')}</span>
                  <span className="dc-badge dc-b-gray" style={{cursor:"pointer"}}>FICO</span>
                  <span className="dc-badge dc-b-gray" style={{cursor:"pointer"}}>S/4HANA</span>
                </div>
              </div>
              <div className="dc-arena-grid">
                <div className="dc-arena-card ft">
                  <div className="dc-a-tag">{tl('dc_a_bestmatch')}</div>
                  <div className="dc-a-title">{tl('dc_a_c1title')}</div>
                  <span className="dc-badge dc-b-amber" style={{fontSize:8}}>{tl('dc_b_highpriority')}</span>
                  <div className="dc-a-foot"><span className="dc-a-match">97% match</span><button className="dc-a-apply">{tl('dc_a_applynow')}</button></div>
                </div>
                <div className="dc-arena-card">
                  <div className="dc-a-tag" style={{color:"#7090B0"}}>SAP FICO</div>
                  <div className="dc-a-title">{tl('dc_a_c2title')}</div>
                  <span className="dc-badge dc-b-blue" style={{fontSize:8}}>{tl('dc_b_open')}</span>
                  <div className="dc-a-foot"><span className="dc-a-match" style={{color:"#60A5FA"}}>89%</span><button className="dc-a-apply ghost">{tl('dc_a_apply')}</button></div>
                </div>
                <div className="dc-arena-card">
                  <div className="dc-a-tag" style={{color:"#7090B0"}}>S/4HANA</div>
                  <div className="dc-a-title">{tl('dc_a_c3title')}</div>
                  <span className="dc-badge dc-b-purple" style={{fontSize:8}}>{tl('dc_b_new')}</span>
                  <div className="dc-a-foot"><span className="dc-a-match" style={{color:"#60A5FA"}}>84%</span><button className="dc-a-apply ghost">{tl('dc_a_apply')}</button></div>
                </div>
                <div className="dc-a-more">{tl('dc_a_more')}</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="dc-prog-wrap"><div className="dc-prog-fill" style={{width: progress+"%"}} /></div>
    </section>
  );
}

export function LandingView({ onSignIn }) {
  const [lang, setLang] = useState(() => {
    try { const s = localStorage.getItem("tc_lang"); return s === "es" ? "es" : "en"; } catch { return "en"; }
  });
  const [pricingTab, setPricingTab] = useState("consultant");
  const [activeLcStage, setActiveLcStage] = useState(3);
  const [activeLcTab, setActiveLcTab] = useState("Details");
  const { settings: landingSettings } = useSystemSettings();
  const showPricing = landingSettings["show_pricing_section"] ?? true;
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
          {showPricing && <a href="#pricing">{tl("nav_pricing")}</a>}
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
                <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                  {[{ph:"Discover",c:"#6EE7B7",bg:"rgba(16,185,129,.2)",s:"Done"},{ph:"Prepare",c:"#6EE7B7",bg:"rgba(16,185,129,.2)",s:"Done"},{ph:"Explore",c:"#60A5FA",bg:"rgba(79,110,247,.2)",s:"Active"},{ph:"Realize",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.04)",s:"Locked"},{ph:"Deploy",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.04)",s:"Locked"},{ph:"Run",c:"rgba(255,255,255,.25)",bg:"rgba(255,255,255,.04)",s:"Locked"}].map(p => (
                    <div key={p.ph} style={{display:"flex",alignItems:"center",gap:"6px",padding:"5px 8px",background:p.bg,border:`1px solid ${p.c}30`,borderRadius:"6px"}}>
                      <div style={{width:"5px",height:"5px",borderRadius:"50%",background:p.c,flexShrink:0}} />
                      <div style={{fontSize:".62rem",fontWeight:700,color:p.c,flex:1}}>{p.ph}</div>
                      <div style={{fontSize:".55rem",color:p.c,opacity:.7}}>{p.s}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">🗺</div>
                <div className="feat-title">{tl("f7t")}</div>
                <div className="feat-desc">{tl("f7d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{background:"#1a2237",borderRadius:"8px",padding:"10px",border:"1px solid rgba(255,255,255,.07)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"8px"}}><div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#A78BFA"}} /><div style={{fontSize:".6rem",fontWeight:700,color:"#A78BFA"}}>AI · Generating fit-gap report…</div></div>
                  <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                    {["· Gap: Invoice posting field missing in S/4HANA target","· Owner: Carlos R. · Status: In Progress","· Linked spec: FI-001 · AI-drafted · ✓ Approved"].map((l,i) => (
                      <div key={i} style={{fontSize:".58rem",color:"rgba(255,255,255,.55)",fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5}}>{l}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">🤖</div>
                <div className="feat-title">{tl("f8t")}</div>
                <div className="feat-desc">{tl("f8d")}</div>
              </div>
            </div>
            <div className="feat-card fade-in">
              <div className="feat-mockup">
                <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                  {[{tr:"DEVK9A0123",mod:"FICO",st:"Released",c:"#6EE7B7",b:"rgba(16,185,129,.2)"},{tr:"DEVK9A0124",mod:"MM/SD",st:"Imported",c:"#FCD34D",b:"rgba(245,158,11,.2)"},{tr:"DEVK9A0125",mod:"Basis",st:"Pending QA",c:"#A5B4FC",b:"rgba(79,110,247,.2)"}].map(t => (
                    <div key={t.tr} style={{display:"flex",alignItems:"center",gap:"6px",padding:"6px 8px",background:t.b,border:`1px solid ${t.c}40`,borderRadius:"6px"}}>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:".58rem",color:t.c,flex:1}}>{t.tr}</div>
                      <div style={{fontSize:".58rem",color:"rgba(255,255,255,.4)"}}>{t.mod}</div>
                      <div style={{fontSize:".58rem",fontWeight:700,color:t.c}}>{t.st}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="feat-body">
                <div className="feat-icon">📦</div>
                <div className="feat-title">{tl("f9t")}</div>
                <div className="feat-desc">{tl("f9d")}</div>
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

      {/* MIGRATION HUB */}
      <section className="mig-showcase">
        <div className="mig-inner">
          <div>
            <div className="mig-tag">{tl("mig_tag")}</div>
            <h2 style={{color:"#fff"}}>{tl("mig_h2")}</h2>
            <p className="section-sub" style={{color:"rgba(255,255,255,.5)",marginBottom:32}}>{tl("mig_sub")}</p>
            <div className="arena-bullets">
              {[
                {icon:"🗺",bg:"rgba(79,110,247,.15)",tk:"mb1t",dk:"mb1d"},
                {icon:"🔬",bg:"rgba(16,185,129,.12)",tk:"mb2t",dk:"mb2d"},
                {icon:"📦",bg:"rgba(245,158,11,.12)",tk:"mb3t",dk:"mb3d"},
                {icon:"🚀",bg:"rgba(139,92,246,.12)",tk:"mb4t",dk:"mb4d"},
              ].map(b => (
                <div key={b.tk} className="arena-bullet">
                  <div className="arena-bullet-icon" style={{background:b.bg}}>{b.icon}</div>
                  <div className="arena-bullet-text"><strong>{tl(b.tk)}</strong><span>{tl(b.dk)}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="mig-visual">
            {[
              {ph:"Discover",dot:"#60A5FA",status:"✓ Done",pct:"100%",sc:"rgba(96,165,250,.2)",bc:"rgba(96,165,250,.3)"},
              {ph:"Prepare",dot:"#60A5FA",status:"✓ Done",pct:"100%",sc:"rgba(96,165,250,.2)",bc:"rgba(96,165,250,.3)"},
              {ph:"Explore",dot:"#6EE7B7",status:"Active",pct:"68%",sc:"rgba(16,185,129,.18)",bc:"rgba(16,185,129,.35)"},
              {ph:"Realize",dot:"rgba(255,255,255,.3)",status:"Locked",pct:"0%",sc:"rgba(255,255,255,.04)",bc:"rgba(255,255,255,.1)"},
              {ph:"Deploy",dot:"rgba(255,255,255,.3)",status:"Locked",pct:"0%",sc:"rgba(255,255,255,.04)",bc:"rgba(255,255,255,.1)"},
              {ph:"Run",dot:"rgba(255,255,255,.3)",status:"Locked",pct:"0%",sc:"rgba(255,255,255,.04)",bc:"rgba(255,255,255,.1)"},
            ].map(p => (
              <div key={p.ph} className="mig-phase" style={{background:p.sc,borderColor:p.bc}}>
                <div className="mig-phase-dot" style={{background:p.dot}} />
                <div className="mig-phase-name">{p.ph}</div>
                <div className="mig-phase-status" style={{background:p.sc,color:p.dot,border:`1px solid ${p.bc}`}}>{p.status}</div>
                <div className="mig-phase-pct">{p.pct}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIFECYCLE */}
      <section className="lifecycle-section" id="lifecycle">
        <div className="lifecycle-inner">
          <div className="section-tag" style={{color:"#818CF8"}}>{tl("lc_tag")}</div>
          <h2>{tl("lc_h2")}</h2>
          <p className="section-sub">{tl("lc_sub")}</p>

          {/* Clickable pipeline */}
          <div className="pipeline-scroll">
            <div className="pipeline-track">
              {LC_STAGES.map((s, i) => (
                <div key={s.n} className={`pipe-stage${activeLcStage===i?" active":""}`}
                  onClick={() => { setActiveLcStage(i); setActiveLcTab(Object.keys(s.tabs)[0]); }}>
                  <svg className="pipe-dot-svg" width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="32"
                      fill="transparent"
                      stroke={activeLcStage===i ? s.t : s.c}
                      strokeWidth={activeLcStage===i ? 4 : 2.5}
                    />
                    <text x="36" y="41" textAnchor="middle"
                      fill={s.t} fontSize="14" fontWeight="800"
                      fontFamily="'Plus Jakarta Sans',sans-serif">{s.n}</text>
                  </svg>
                  <div className="pipe-label">{s.l.split("\n").map((ln,j)=><span key={j}>{ln}{j===0&&s.l.includes("\n")?<br/>:null}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="lc-click-hint">{tl("lc_click_hint")}</div>

          {/* Stage detail panel */}
          {(() => {
            const stage = LC_STAGES[activeLcStage];
            const tabKeys = Object.keys(stage.tabs);
            const safeTab = tabKeys.includes(activeLcTab) ? activeLcTab : tabKeys[0];
            return (
              <div className="lc-detail" key={activeLcStage}>
                <div className="lc-detail-header">
                  <div className="lc-detail-stage-chip" style={{background:stage.bg, border:`1px solid ${stage.c}50`, color:stage.t}}>
                    {stage.n}. {stage.l.replace("\n"," ")}
                  </div>
                </div>
                <div className="lc-detail-body">
                  <div>
                    <div className="lc-detail-col-title">{tl("lc_detail_gates")}</div>
                    {stage.gates.length === 0
                      ? <div className="lc-gate-noop">{tl("lc_gate_noop")}</div>
                      : stage.gates.map((g, gi) => (
                          <div key={gi} className={`lc-gate lc-gate-${g.s}`}>
                            <div className="lc-gate-icon">{g.s==="pass"?"✓":g.s==="warn"?"⚠":"✗"}</div>
                            <div className="lc-gate-label">{g.l}</div>
                          </div>
                        ))
                    }
                  </div>
                  <div>
                    <div className="lc-detail-col-title">{tl("lc_detail_tabs")}</div>
                    <div className="lc-tab-chips">
                      {tabKeys.map(tab => (
                        <button key={tab}
                          className={`lc-tab-chip${safeTab===tab?" on":""}`}
                          style={safeTab===tab?{borderColor:stage.c,color:stage.t,background:stage.bg}:{}}
                          onClick={() => setActiveLcTab(tab)}>
                          {tab}
                        </button>
                      ))}
                    </div>
                    <div className="lc-tab-desc">{stage.tabs[safeTab]}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Template cards */}
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

      {/* ARENA PROMO */}
      <ArenaPromoVideo tl={tl} />

      {/* DEMO CAROUSEL */}
      <DemoCarousel tl={tl} />

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
      {showPricing && <section className="pricing-section" id="pricing">
        <div className="section-inner" style={{textAlign:"center"}}>
          <div className="section-tag" style={{textAlign:"center"}}>{tl("pricing_tag")}</div>
          <h2 style={{margin:"0 auto 12px"}}>{tl("pricing_h2")}</h2>
          <p className="section-sub" style={{margin:"0 auto 36px"}}>{tl("pricing_sub")}</p>

          {/* Role tabs */}
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:40}}>
            {[["consultant","ptab_consultant"],["client","ptab_client"],["headhunter","ptab_headhunter"]].map(([id,key])=>(
              <button key={id} onClick={()=>setPricingTab(id)} style={{
                padding:"8px 22px", borderRadius:10, fontWeight:700, fontSize:"0.88rem",
                border: pricingTab===id ? "none" : "1.5px solid var(--border)",
                background: pricingTab===id ? "var(--accent)" : "transparent",
                color: pricingTab===id ? "#fff" : "var(--muted)",
                cursor:"pointer", transition:"all .15s",
              }}>{tl(key)}</button>
            ))}
          </div>

          {/* Consultant plans: Free + Pro */}
          {pricingTab === "consultant" && (
            <div className="pricing-grid" style={{maxWidth:680,gridTemplateColumns:"repeat(2,1fr)"}}>
              <div className="price-card">
                <div className="price-name">{tl("pc_free_name")}</div>
                <div className="price-amount">$0<small>/mo</small></div>
                <div className="price-period">{tl("pc_free_period")}</div>
                <ul className="price-features">{tl("pc_free_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_start")}</button>
              </div>
              <div className="price-card featured">
                <div className="price-badge">{tl("pc_pro_badge")}</div>
                <div className="price-name">{tl("pc_pro_name")}</div>
                <div className="price-amount">$29<small>/mo</small></div>
                <div className="price-period">{tl("pc_pro_period")}</div>
                <ul className="price-features">{tl("pc_pro_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-filled" onClick={onSignIn}>{tl("btn_upgrade")}</button>
              </div>
            </div>
          )}

          {/* Client plans: Free + Growth + Enterprise */}
          {pricingTab === "client" && (
            <div className="pricing-grid">
              <div className="price-card">
                <div className="price-name">{tl("cl_free_name")}</div>
                <div className="price-amount">$0<small>/mo</small></div>
                <div className="price-period">{tl("cl_free_period")}</div>
                <ul className="price-features">{tl("cl_free_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_start")}</button>
              </div>
              <div className="price-card featured">
                <div className="price-badge">{tl("cl_growth_badge")}</div>
                <div className="price-name">{tl("cl_growth_name")}</div>
                <div className="price-amount">$149<small>/mo</small></div>
                <div className="price-period">{tl("cl_growth_period")}</div>
                <ul className="price-features">{tl("cl_growth_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-filled" onClick={onSignIn}>{tl("btn_trial")}</button>
              </div>
              <div className="price-card">
                <div className="price-name">{tl("cl_ent_name")}</div>
                <div className="price-amount">{tl("cl_ent_custom")}<small>/mo</small></div>
                <div className="price-period">{tl("cl_ent_period")}</div>
                <ul className="price-features">{tl("cl_ent_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_contact")}</button>
              </div>
            </div>
          )}

          {/* Headhunter plans: Pro + Agency */}
          {pricingTab === "headhunter" && (
            <div className="pricing-grid" style={{maxWidth:680,gridTemplateColumns:"repeat(2,1fr)"}}>
              <div className="price-card">
                <div className="price-name">{tl("hh_pro_name")}</div>
                <div className="price-amount">$99<small>/mo</small></div>
                <div className="price-period">{tl("hh_pro_period")}</div>
                <ul className="price-features">{tl("hh_pro_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-outline" onClick={onSignIn}>{tl("btn_start")}</button>
              </div>
              <div className="price-card featured">
                <div className="price-badge">{tl("hh_agency_badge")}</div>
                <div className="price-name">{tl("hh_agency_name")}</div>
                <div className="price-amount">$249<small>/mo</small></div>
                <div className="price-period">{tl("hh_agency_period")}</div>
                <ul className="price-features">{tl("hh_agency_f").map(f=><li key={f}>{f}</li>)}</ul>
                <button className="price-cta price-cta-filled" onClick={onSignIn}>{tl("btn_upgrade")}</button>
              </div>
            </div>
          )}
        </div>
      </section>}

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
          <div className="footer-col"><h4>{tl("f_product")}</h4><a href="#arena">{tl("f_arena")}</a><a href="#features">{tl("f_features")}</a><a href="#lifecycle">{tl("f_lifecycle")}</a><a href="#roles">{tl("f_roles")}</a>{showPricing && <a href="#pricing">{tl("f_pricing")}</a>}</div>
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
