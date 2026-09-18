import { useState, useEffect } from "react";
import {
  Archive, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Database,
  FileCode2, FileText, LayoutTemplate, Pencil, Plus, Trash2, User, X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useCases } from "../hooks/useCaseHooks.js";
import { useProjectTemplates } from "../hooks/useCoreHooks.js";
import { Spinner } from "../components/ProfileComponents.jsx";
import { EmptyState, Select } from "../components/ui.jsx";
import { LIFECYCLE_PRESETS } from "../lib/businessConstants.js";
import { CreateCaseWizard } from "../components/CreateCaseWizard.jsx";
import { AbapTemplatesSection } from "../components/SapPanels.jsx";
import { logEvent } from "../lib/utils.js";

// ============================================================
// CASE TEMPLATES
// ============================================================

// ── Built-in project templates (in-memory, no DB row required) ───────────────
const BUILT_IN_PROJECT_TEMPLATES = [
  {
    id: 'builtin-sap-full',
    name: 'SAP Full Implementation',
    description: 'End-to-end SAP project covering all ASAP methodology phases — from project prep through hypercare.',
    category: 'SAP Implementation',
    is_builtin: true,
    items: [
      { id: 'sfi-1',  title: 'Project Preparation & Planning',      description: 'Define scope, governance, team structure, tools, and project standards.',                          priority: 'high',   area_sap: 'BASIS', est_hours: 40,  sort_order: 0 },
      { id: 'sfi-2',  title: 'System Landscape Setup',              description: 'Install and configure DEV/QAS/PRD systems and transport management.',                              priority: 'medium', area_sap: 'BASIS', est_hours: 24,  sort_order: 1 },
      { id: 'sfi-3',  title: 'AS-IS Business Process Analysis',     description: 'Document current processes, pain points, and improvement opportunities.',                          priority: 'high',   area_sap: '',      est_hours: 80,  sort_order: 2 },
      { id: 'sfi-4',  title: 'Business Blueprint & GAP Analysis',   description: 'Map business requirements to SAP functionality; identify gaps and workarounds.',                   priority: 'high',   area_sap: '',      est_hours: 60,  sort_order: 3 },
      { id: 'sfi-5',  title: 'Functional Specifications (FS)',       description: 'Write functional specs for all custom developments, forms and reports.',                           priority: 'high',   area_sap: '',      est_hours: 80,  sort_order: 4 },
      { id: 'sfi-6',  title: 'Technical Specifications (TS)',        description: 'Translate functional specs into detailed technical specs for developers.',                          priority: 'medium', area_sap: 'ABAP',  est_hours: 60,  sort_order: 5 },
      { id: 'sfi-7',  title: 'System Configuration',                description: 'Configure SAP modules per the approved business blueprint.',                                       priority: 'high',   area_sap: '',      est_hours: 120, sort_order: 6 },
      { id: 'sfi-8',  title: 'Custom Development (ABAP)',            description: 'Develop custom reports, forms, enhancements, and interfaces.',                                     priority: 'medium', area_sap: 'ABAP',  est_hours: 80,  sort_order: 7 },
      { id: 'sfi-9',  title: 'Master Data Migration & Cleansing',   description: 'Extract, cleanse, map and load legacy master data into SAP.',                                      priority: 'high',   area_sap: '',      est_hours: 60,  sort_order: 8 },
      { id: 'sfi-10', title: 'Integration & Unit Testing',           description: 'Run unit and integration tests across all configured modules.',                                    priority: 'high',   area_sap: '',      est_hours: 40,  sort_order: 9 },
      { id: 'sfi-11', title: 'User Acceptance Testing (UAT)',        description: 'Business users validate end-to-end scenarios in QAS environment.',                                 priority: 'high',   area_sap: '',      est_hours: 40,  sort_order: 10 },
      { id: 'sfi-12', title: 'End-User Training',                   description: 'Train key users and end users on relevant SAP transactions and processes.',                        priority: 'medium', area_sap: '',      est_hours: 32,  sort_order: 11 },
      { id: 'sfi-13', title: 'Go-Live Preparation & Cutover Plan',  description: 'Finalize cutover plan, rehearsals, Go/No-Go decision, and go-live checklist.',                    priority: 'high',   area_sap: '',      est_hours: 24,  sort_order: 12 },
      { id: 'sfi-14', title: 'Go-Live Support & Hypercare',         description: 'Provide intensive support post go-live to stabilize the system.',                                  priority: 'high',   area_sap: '',      est_hours: 32,  sort_order: 13 },
    ],
  },
  {
    id: 'builtin-hana-migration',
    name: 'HANA Migration',
    description: 'Technical migration from any DB to SAP HANA — assessment through production go-live.',
    category: 'HANA Migration',
    is_builtin: true,
    items: [
      { id: 'hm-1', title: 'System Assessment & Sizing',           description: 'Analyze current system, DB size, custom code, and HANA hardware requirements.',   priority: 'high',   area_sap: 'BASIS', est_hours: 24, sort_order: 0 },
      { id: 'hm-2', title: 'Hardware & Infrastructure Setup',      description: 'Provision and configure HANA-certified hardware or cloud infrastructure.',          priority: 'high',   area_sap: 'BASIS', est_hours: 24, sort_order: 1 },
      { id: 'hm-3', title: 'HANA Installation & Configuration',    description: 'Install HANA DB, SAP HANA Studio, and configure system parameters.',               priority: 'high',   area_sap: 'BASIS', est_hours: 16, sort_order: 2 },
      { id: 'hm-4', title: 'Custom Code Adaptation',               description: 'Analyze ABAP code for HANA compatibility; optimize SQL and queries.',               priority: 'medium', area_sap: 'ABAP',  est_hours: 40, sort_order: 3 },
      { id: 'hm-5', title: 'Pre-Migration Data Cleanup',           description: 'Archive old data, run consistency checks, and eliminate data quality issues.',      priority: 'medium', area_sap: '',      est_hours: 32, sort_order: 4 },
      { id: 'hm-6', title: 'Database Migration Execution',         description: 'Execute the technical migration using SUM or DMO tools in non-production.',         priority: 'high',   area_sap: 'BASIS', est_hours: 80, sort_order: 5 },
      { id: 'hm-7', title: 'Post-Migration Validation & Testing',  description: 'Validate data completeness, run regression tests, and verify performance.',         priority: 'high',   area_sap: '',      est_hours: 40, sort_order: 6 },
      { id: 'hm-8', title: 'Performance Tuning & Optimization',    description: 'Leverage HANA in-memory capabilities; tune views, indexes, and queries.',           priority: 'medium', area_sap: 'BASIS', est_hours: 32, sort_order: 7 },
      { id: 'hm-9', title: 'Production Go-Live & Stabilization',   description: 'Migrate production system, validate, and provide hypercare support.',               priority: 'high',   area_sap: '',      est_hours: 24, sort_order: 8 },
    ],
  },
  {
    id: 'builtin-rollout',
    name: 'SAP Roll-out',
    description: 'Template roll-out to additional countries or sites using an established SAP template.',
    category: 'Roll-out',
    is_builtin: true,
    items: [
      { id: 'ro-1', title: 'Country / Site Scoping & Requirements', description: 'Define country-specific legal, tax, language, and process requirements.',         priority: 'high',   area_sap: '',      est_hours: 24, sort_order: 0 },
      { id: 'ro-2', title: 'Template Fit-Gap & Delta Configuration', description: 'Identify delta requirements vs the global template; configure locally.',          priority: 'high',   area_sap: '',      est_hours: 40, sort_order: 1 },
      { id: 'ro-3', title: 'Legal & Compliance Review',             description: 'Validate local statutory, tax, and payroll compliance requirements.',              priority: 'high',   area_sap: '',      est_hours: 24, sort_order: 2 },
      { id: 'ro-4', title: 'Data Migration (Local)',                description: 'Extract, cleanse and load local master and transactional data.',                   priority: 'high',   area_sap: '',      est_hours: 40, sort_order: 3 },
      { id: 'ro-5', title: 'Integration & Regression Testing',      description: 'Verify local processes and integrations with global systems.',                     priority: 'high',   area_sap: '',      est_hours: 32, sort_order: 4 },
      { id: 'ro-6', title: 'Key User Training',                     description: 'Train power users on SAP processes tailored to the local site.',                  priority: 'medium', area_sap: '',      est_hours: 24, sort_order: 5 },
      { id: 'ro-7', title: 'End User Training',                     description: 'Deliver role-based training to all end users at the local site.',                  priority: 'medium', area_sap: '',      est_hours: 24, sort_order: 6 },
      { id: 'ro-8', title: 'Go-Live Preparation & Cutover',         description: 'Final checks, cutover rehearsal, and Go/No-Go decision.',                         priority: 'high',   area_sap: '',      est_hours: 16, sort_order: 7 },
      { id: 'ro-9', title: 'Go-Live Support & Hypercare',           description: 'On-site and remote support during the post-go-live stabilization period.',         priority: 'high',   area_sap: '',      est_hours: 16, sort_order: 8 },
    ],
  },
  {
    id: 'builtin-platform-launch',
    name: 'Platform v1.0 Launch',
    description: 'Full software platform build from discovery to public release — 9 phases, each with detailed activities covering design, architecture, development, QA, and launch.',
    category: 'Software Development',
    is_builtin: true,
    items: [
      {
        id: 'plp-1', title: 'Discovery & Strategy', priority: 'high', area_sap: '', est_hours: 40, sort_order: 0,
        description: 'Define problem statement, personas, competitive analysis, and MVP scope. Align all stakeholders before a single line of code is written.',
        activities: [
          { title: 'Stakeholder interviews & alignment workshop',   description: 'Interview business owners, future users, and technical leads. Document goals, constraints, and success metrics.',                              est_hours: 8,  sort_order: 1, phase: 'design' },
          { title: 'Problem statement & user-persona definition',   description: 'Craft a crisp problem statement. Define primary and secondary personas with jobs-to-be-done and pain points.',                                est_hours: 6,  sort_order: 2, phase: 'design' },
          { title: 'Competitive analysis & market research',        description: 'Analyse 5-10 competitors or comparable products. Map features, pricing, and UX strengths/weaknesses.',                                       est_hours: 8,  sort_order: 3, phase: 'design' },
          { title: 'MVP scope definition & feature prioritisation', description: 'List all potential features, score by value vs effort, and lock the v1.0 scope. Document everything that is explicitly OUT of scope.',        est_hours: 8,  sort_order: 4, phase: 'design' },
          { title: 'Project charter & success metrics',             description: 'Document objectives, KPIs, timeline, budget, roles & responsibilities, and escalation paths.',                                               est_hours: 6,  sort_order: 5, phase: 'design' },
          { title: 'Risk assessment & feasibility study',           description: 'Identify technical, commercial, and operational risks. Rate likelihood/impact and define mitigation actions.',                                est_hours: 4,  sort_order: 6, phase: 'design' },
        ],
      },
      {
        id: 'plp-2', title: 'Product Design', priority: 'high', area_sap: '', est_hours: 120, sort_order: 1,
        description: 'Information architecture, wireframes, design system, high-fidelity mockups for all screens, interactive prototype, and usability testing with real users.',
        activities: [
          { title: 'User journey mapping & information architecture', description: 'Map end-to-end user journeys for each persona. Define site-map / screen hierarchy and navigation model.',                                  est_hours: 16, sort_order: 1, phase: 'design' },
          { title: 'Low-fidelity wireframes — all key screens',       description: 'Sketch wireframes for every screen in the MVP scope. Review with stakeholders and iterate before moving to high-fidelity.',                est_hours: 24, sort_order: 2, phase: 'design' },
          { title: 'Design system & component library setup',         description: 'Define colour tokens, typography scale, spacing, shadow levels, icons, and base components (buttons, inputs, cards, modals).',             est_hours: 20, sort_order: 3, phase: 'design' },
          { title: 'High-fidelity mockups — all screens',             description: 'Produce pixel-perfect mockups in Figma for every screen, including desktop and mobile breakpoints.',                                      est_hours: 32, sort_order: 4, phase: 'design' },
          { title: 'Interactive prototype',                           description: 'Link screens in Figma/Framer to create a clickable prototype covering the core user flows.',                                              est_hours: 16, sort_order: 5, phase: 'design' },
          { title: 'Usability testing with real users',               description: 'Run 5-8 moderated usability sessions with target users. Document findings and apply design iterations.',                                  est_hours: 12, sort_order: 6, phase: 'user_test' },
        ],
      },
      {
        id: 'plp-3', title: 'Technical Architecture', priority: 'high', area_sap: '', est_hours: 60, sort_order: 2,
        description: 'Tech stack decisions, database schema, API contracts, authorization model, infrastructure plan, CI/CD pipeline, and OWASP security threat model.',
        activities: [
          { title: 'Tech stack selection & Architecture Decision Records (ADRs)', description: 'Evaluate and decide on frontend framework, backend language/runtime, database, hosting, and key third-party services. Write one ADR per major decision.', est_hours: 8, sort_order: 1, phase: 'design' },
          { title: 'Database schema design',                         description: 'Model all entities, relationships, indexes, and RLS policies. Review with team; create migration scripts.',                                 est_hours: 12, sort_order: 2, phase: 'design' },
          { title: 'API contract design (REST / GraphQL)',           description: 'Define all endpoints or schema types, request/response shapes, authentication headers, and error codes. Publish to shared spec (OpenAPI/GraphQL SDL).', est_hours: 10, sort_order: 3, phase: 'design' },
          { title: 'Authentication & authorisation model',           description: 'Design user roles, permissions matrix, token strategy (JWT/session), MFA approach, and Row-Level Security rules.',                         est_hours: 8,  sort_order: 4, phase: 'design' },
          { title: 'Infrastructure & deployment plan',               description: 'Choose cloud provider, regions, compute/serverless model, CDN, storage, and environment strategy (dev/staging/prod).',                     est_hours: 10, sort_order: 5, phase: 'design' },
          { title: 'CI/CD pipeline design',                         description: 'Design the build, test, and deploy pipeline. Choose tooling (GitHub Actions / GitLab CI / etc.) and branch strategy.',                     est_hours: 6,  sort_order: 6, phase: 'design' },
          { title: 'Security threat model (OWASP Top 10)',          description: 'Walk through OWASP Top 10 for the planned architecture. Document threats and required controls.',                                           est_hours: 6,  sort_order: 7, phase: 'design' },
        ],
      },
      {
        id: 'plp-4', title: 'Foundation Build', priority: 'high', area_sap: '', est_hours: 160, sort_order: 3,
        description: 'Repository setup, CI/CD live, authentication, core DB, base UI component library, navigation shell, error tracking, and staging environment.',
        activities: [
          { title: 'Repository structure & monorepo/multi-repo setup',  description: 'Initialise repos with agreed structure, README, code-owners, branch protection, and commit-lint hooks.',                              est_hours: 8,  sort_order: 1, phase: 'design' },
          { title: 'CI/CD pipeline implementation',                     description: 'Build the full automated pipeline: lint → test → build → deploy to staging. Verify green on a trivial commit.',                      est_hours: 16, sort_order: 2, phase: 'development' },
          { title: 'Authentication system (sign-up / login / MFA)',     description: 'Implement email/password and social OAuth flows, email verification, password reset, and optional MFA.',                              est_hours: 24, sort_order: 3, phase: 'development' },
          { title: 'Core database tables & migrations',                 description: 'Apply the agreed schema via migrations. Seed dev/staging with representative test data.',                                             est_hours: 20, sort_order: 4, phase: 'development' },
          { title: 'Base UI component library',                        description: 'Build all design-system components in the frontend codebase: buttons, inputs, modals, toasts, layout wrappers, etc.',                 est_hours: 32, sort_order: 5, phase: 'development' },
          { title: 'Navigation shell & client-side routing',           description: 'Implement the global layout, sidebar/navbar, route guards, and 404/error pages.',                                                     est_hours: 16, sort_order: 6, phase: 'development' },
          { title: 'Error tracking & structured logging',              description: 'Integrate Sentry (or equivalent) on frontend and backend. Define log levels and structured log format.',                              est_hours: 12, sort_order: 7, phase: 'development' },
          { title: 'Staging environment deployment & smoke test',      description: 'Deploy the foundation to staging. Run a smoke-test checklist confirming auth, DB connectivity, and basic navigation.',                est_hours: 16, sort_order: 8, phase: 'development' },
          { title: 'Base API layer & middleware',                      description: 'Set up request validation, error-response formatting, rate limiting, CORS, and auth middleware on the backend.',                      est_hours: 16, sort_order: 9, phase: 'development' },
        ],
      },
      {
        id: 'plp-5', title: 'Core Feature Development', priority: 'high', area_sap: '', est_hours: 320, sort_order: 4,
        description: 'Two-week sprints building all primary features with sprint demos each cycle.',
        activities: [
          { title: 'Sprint 1 — CRUD flows for main entities',        description: 'Implement create/read/update/delete for all primary domain entities with form validation and optimistic UI.',                            est_hours: 40, sort_order: 1, phase: 'development' },
          { title: 'Sprint 2 — Dashboards & data visualisation',     description: 'Build the main dashboard(s): KPI tiles, charts, and tables. Implement data-fetching with pagination and filters.',                    est_hours: 40, sort_order: 2, phase: 'development' },
          { title: 'Sprint 3 — Notifications & real-time updates',   description: 'In-app notifications (bell icon + feed), email notification templates, and real-time push/websocket for live data.',                  est_hours: 40, sort_order: 3, phase: 'development' },
          { title: 'Sprint 4 — File uploads & media management',     description: 'Implement drag-and-drop file upload, image optimisation, CDN storage, and a document viewer/download flow.',                          est_hours: 40, sort_order: 4, phase: 'development' },
          { title: 'Sprint 5 — Search & filtering',                  description: 'Global search (full-text), per-page filters, sort controls, and saved-filter / recent-search UX.',                                    est_hours: 40, sort_order: 5, phase: 'development' },
          { title: 'Sprint 6 — Admin panel & user management',       description: 'Admin area: user list, role assignment, audit log viewer, feature flags, and system-settings page.',                                  est_hours: 40, sort_order: 6, phase: 'development' },
          { title: 'Sprint 7 — Billing & subscription flow',         description: 'Integrate payment provider (Stripe), plan selection, upgrade/downgrade, invoice history, and usage-limit enforcement.',               est_hours: 40, sort_order: 7, phase: 'development' },
          { title: 'Sprint 8 — API integrations & webhooks',         description: 'Build third-party integrations, outbound webhooks, OAuth2 app connections, and a developer API-key management page.',                 est_hours: 40, sort_order: 8, phase: 'development' },
        ],
      },
      {
        id: 'plp-6', title: 'Polish & Hardening', priority: 'medium', area_sap: '', est_hours: 100, sort_order: 5,
        description: 'Responsive audit, accessibility (WCAG AA), empty/error/loading states, onboarding flow, performance optimisation (Lighthouse 90+), copy review, and i18n setup.',
        activities: [
          { title: 'Responsive design audit & mobile fixes',         description: 'Test every screen at 375px, 768px, 1024px, and 1440px. Fix layout breaks, touch targets, and overflow issues.',                        est_hours: 16, sort_order: 1, phase: 'design' },
          { title: 'Accessibility audit (WCAG AA)',                  description: 'Run axe / Lighthouse accessibility checks. Fix colour-contrast, keyboard navigation, focus rings, ARIA labels, and screen-reader flow.', est_hours: 12, sort_order: 2, phase: 'design' },
          { title: 'Empty, error & loading state design',            description: 'Design and implement all missing states: skeleton loaders, empty-list illustrations, 5xx/4xx error pages, and inline field errors.',     est_hours: 12, sort_order: 3, phase: 'design' },
          { title: 'Onboarding flow & first-run experience',         description: 'Build the "aha moment" onboarding: welcome modal, setup wizard, contextual tooltips, and sample/seed data for new accounts.',           est_hours: 16, sort_order: 4, phase: 'design' },
          { title: 'Performance optimisation (Lighthouse 90+)',      description: 'Audit bundle size, code-split heavy routes, lazy-load images, implement caching headers, and optimise database queries.',               est_hours: 20, sort_order: 5, phase: 'development' },
          { title: 'Copy review & microcopy polish',                 description: 'Review all labels, tooltips, error messages, and CTA text for clarity. Run through a plain-English checklist.',                       est_hours: 8,  sort_order: 6, phase: 'design' },
          { title: 'Internationalisation (i18n) setup',              description: 'Extract all strings into a locale file. Set up the i18n framework and add at least one additional language as proof-of-concept.',      est_hours: 8,  sort_order: 7, phase: 'development' },
          { title: 'Dark mode & theming',                            description: 'Implement system-preference dark mode via CSS tokens. Verify contrast and icon legibility in both themes.',                            est_hours: 8,  sort_order: 8, phase: 'development' },
        ],
      },
      {
        id: 'plp-7', title: 'QA & Testing', priority: 'high', area_sap: '', est_hours: 100, sort_order: 6,
        description: 'Test plan, functional testing across all roles, cross-browser/device, RBAC audit, UAT with beta users, security review, and load testing.',
        activities: [
          { title: 'Test plan documentation',                        description: 'Write the test plan: scope, test types, environments, entry/exit criteria, defect severity levels, and sign-off process.',              est_hours: 8,  sort_order: 1, phase: 'design' },
          { title: 'Functional testing — all user roles',            description: 'Execute manual and/or automated functional test cases for every role and feature. Log and triage all defects.',                         est_hours: 24, sort_order: 2, phase: 'functional_test' },
          { title: 'Cross-browser & cross-device testing',           description: 'Test on Chrome, Firefox, Safari, Edge, iOS Safari, and Android Chrome. Verify layout and functionality on each.',                      est_hours: 16, sort_order: 3, phase: 'functional_test' },
          { title: 'Role-based access control (RBAC) audit',        description: 'Verify that every permission boundary is enforced on both the UI and the API layer. Document any bypass found.',                       est_hours: 12, sort_order: 4, phase: 'technical_test' },
          { title: 'Beta user UAT sessions',                        description: 'Onboard 5-15 beta users. Collect structured feedback via guided tasks, exit surveys, and support channel observation.',                 est_hours: 16, sort_order: 5, phase: 'user_test' },
          { title: 'Security review & penetration testing',         description: 'Run OWASP ZAP automated scan and manual pen-test for SQLi, XSS, IDOR, SSRF. Remediate findings before launch.',                       est_hours: 12, sort_order: 6, phase: 'technical_test' },
          { title: 'Load & stress testing',                         description: 'Define load targets (concurrent users, RPS). Run k6/Locust scenarios and identify performance bottlenecks under load.',                est_hours: 12, sort_order: 7, phase: 'technical_test' },
        ],
      },
      {
        id: 'plp-8', title: 'Launch Preparation', priority: 'high', area_sap: '', est_hours: 80, sort_order: 7,
        description: 'Production infrastructure, domain/SSL, monitoring, backup, legal docs, support channel, go-to-market announcement.',
        activities: [
          { title: 'Production infrastructure provisioning',         description: 'Provision all production cloud resources (compute, DB, storage, queues) with IaC (Terraform/Pulumi). Enable auto-scaling.',            est_hours: 16, sort_order: 1, phase: 'development' },
          { title: 'Domain, SSL certificates & CDN configuration',  description: 'Register domain, configure DNS, issue SSL cert, set up CDN (CloudFront/Cloudflare) with cache rules.',                                 est_hours: 8,  sort_order: 2, phase: 'development' },
          { title: 'Monitoring, alerting & observability dashboards', description: 'Set up uptime monitoring (Better Uptime), APM (Datadog/Grafana), error-rate alerts, and a status page (Statuspage.io).',             est_hours: 12, sort_order: 3, phase: 'development' },
          { title: 'Backup, recovery & disaster-recovery plan',     description: 'Enable automated DB backups with retention policy. Document and rehearse the recovery runbook.',                                       est_hours: 8,  sort_order: 4, phase: 'development' },
          { title: 'Legal — Terms of Service & Privacy Policy',     description: 'Draft/review ToS and Privacy Policy with legal counsel. Implement cookie consent banner and GDPR/CCPA opt-outs.',                     est_hours: 8,  sort_order: 5, phase: 'design' },
          { title: 'Support channel & helpdesk setup',              description: 'Configure Intercom/Zendesk/email support. Write first-response templates and triage workflow for launch-day tickets.',                  est_hours: 8,  sort_order: 6, phase: 'design' },
          { title: 'Go-to-market announcement & marketing preparation', description: 'Prepare launch blog post, social posts, Product Hunt submission, email to waitlist, and press-release assets.',                   est_hours: 12, sort_order: 7, phase: 'design' },
          { title: 'Final security hardening & compliance check',   description: 'Apply HTTP security headers (HSTS, CSP, etc.), review secrets management, and complete a pre-launch security checklist.',              est_hours: 8,  sort_order: 8, phase: 'technical_test' },
        ],
      },
      {
        id: 'plp-9', title: 'v1.0 Release', priority: 'critical', area_sap: '', est_hours: 40, sort_order: 8,
        description: 'Staged soft launch, 24-48h monitoring window, public launch, support triage, post-launch report, and v1.1 roadmap planning.',
        activities: [
          { title: 'Staged soft launch & smoke tests',               description: 'Deploy to production for invited users only. Execute the smoke-test checklist and verify all integrations end-to-end.',                 est_hours: 8,  sort_order: 1, phase: 'functional_test' },
          { title: '24-48h monitoring window',                       description: 'Watch error rates, latency, DB connections, and queue depth. Have on-call engineer ready. Hold daily sync during this window.',          est_hours: 8,  sort_order: 2, phase: 'technical_test' },
          { title: 'Public launch announcement',                     description: 'Remove invite gate and publish all go-to-market assets: blog, social, Product Hunt, newsletter. Coordinate timing.',                    est_hours: 4,  sort_order: 3, phase: 'development' },
          { title: 'Support inbox triage & first-response SLA',     description: 'Triage all incoming support tickets. Acknowledge within defined SLA; escalate critical bugs to engineering immediately.',               est_hours: 8,  sort_order: 4, phase: 'functional_test' },
          { title: 'Post-launch report & metrics review',           description: 'Compile launch metrics (sign-ups, activation rate, error rate, NPS). Share report with all stakeholders.',                             est_hours: 6,  sort_order: 5, phase: 'development' },
          { title: 'User feedback collection & analysis',           description: 'Send post-launch survey. Analyse in-app feedback and support tickets to identify top friction points.',                                est_hours: 4,  sort_order: 6, phase: 'user_test' },
          { title: 'v1.1 roadmap planning session',                  description: 'Facilitate a prioritisation session using launch learnings. Output: a ranked backlog for the next development cycle.',                 est_hours: 2,  sort_order: 7, phase: 'design' },
        ],
      },
    ],
  },
];

const SAP_TEMPLATES = [
  {
    name: "S/4HANA Migration Assessment",
    category: "Migration",
    description: "Assess readiness for S/4HANA migration including system landscape analysis, data quality review, and custom code impact.",
    template_data: {
      title: "S/4HANA Migration Assessment",
      description: "Assess readiness for S/4HANA migration including system landscape analysis, data quality review, and custom code impact.",
      estimated_hours: 80,
      min_trust_level: "silver",
    },
  },
  {
    name: "FI/CO Configuration",
    category: "Finance",
    description: "Configure SAP Financial Accounting and Controlling modules including chart of accounts, cost centers, and profit centers.",
    template_data: { title: "FI/CO Configuration", estimated_hours: 120, min_trust_level: "silver" },
  },
  {
    name: "SAP BTP Integration",
    category: "Integration",
    description: "Design and implement integrations using SAP Business Technology Platform, including API Management and Integration Suite.",
    template_data: { title: "SAP BTP Integration", estimated_hours: 160, min_trust_level: "gold" },
  },
  {
    name: "SD Module Implementation",
    category: "Sales",
    description: "Implement SAP Sales & Distribution module covering order management, pricing, billing, and shipping.",
    template_data: { title: "SD Module Implementation", estimated_hours: 200, min_trust_level: "silver" },
  },
  {
    name: "ABAP Custom Development",
    category: "Development",
    description: "Custom ABAP development including reports, enhancements, user exits, and BAPI implementations.",
    template_data: { title: "ABAP Custom Development", estimated_hours: 40, min_trust_level: "starter" },
  },
];

function CaseTemplatePickerModal({ onClose, onSelect }) {
  const { t } = useT();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("case_templates")
          .select("*")
          .order("use_count", { ascending: false });
        if (!error) setTemplates(data ?? []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = templates.filter(tpl =>
    !search ||
    tpl.name.toLowerCase().includes(search.toLowerCase()) ||
    (tpl.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (tpl.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t("template.pick")}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t("template.start_from")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b border-gray-50">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("template.search")}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">{t("label.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <LayoutTemplate className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{t("template.none")}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(tpl => (
                <button key={tpl.id}
                  onClick={() => onSelect(tpl)}
                  className="text-left w-full p-4 border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50 rounded-xl transition-all group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{tpl.name}</span>
                        {tpl.category && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">{tpl.category}</span>
                        )}
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>
                      )}
                      <p className="text-xs text-gray-300 mt-1.5">
                        {t("template.use_count").replace("{n}", tpl.use_count ?? 0)}
                      </p>
                    </div>
                    <Copy className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0 mt-0.5 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveCaseAsTemplateModal({ caseData, onClose }) {
  const { t } = useT();
  const [name, setName] = useState(caseData.title ?? "");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const templateData = {};
      const fields = ["title","description","estimated_hours","budget","min_trust_level","area_sap","area_industry","priority","work_mode","travel_required","skills_required","certifications_required","languages_required","min_years_experience","security_clearance","interview_required","interview_format","interview_rounds","technical_assessment"];
      fields.forEach(f => { if (caseData[f] !== undefined && caseData[f] !== null) templateData[f] = caseData[f]; });
      const { error } = await supabase.from("case_templates").insert({
        name: name.trim(),
        category: category.trim() || null,
        description: caseData.description ?? null,
        template_data: templateData,
        created_by: user?.id ?? null,
        is_global: false,
      });
      if (!error) {
        logEvent('template.created', { entityType: 'case_template', metadata: { name: name.trim() } });
        setSaved(true);
        setTimeout(() => onClose(), 1200);
      } else {
        alert(error.message);
      }
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{t("template.save_as")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        {saved ? (
          <div className="flex items-center gap-2 text-green-600 text-sm font-medium py-4">
            <CheckCircle2 className="w-5 h-5" /> {t("template.saved")}
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("template.name")} *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t("template.name")} />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("template.category")}</label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Migration, Finance, Integration" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">{t("action.cancel")}</button>
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-40">
                {saving ? t("state.saving") : t("template.save_as")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CaseTemplatesView({ auth }) {
  const { t } = useT();
  const [templateTab, setTemplateTab] = useState('case');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [createInitialData, setCreateInitialData] = useState(null);
  const [seeded, setSeeded] = useState(false);
  const { createCase } = useCases({});

  async function loadTemplates() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("case_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("loadTemplates error:", error.message, error.code);
        setLoadError(error.message);
      } else {
        setTemplates(data ?? []);
      }
    } catch (e) {
      console.error("loadTemplates exception:", e.message);
      setLoadError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadTemplates(); }, []);

  // Seed built-in templates on mount if table is empty
  useEffect(() => {
    if (seeded || loading || templates.length > 0) return;
    setSeeded(true);
    (async () => {
      try {
        await supabase.from("case_templates").insert(
          SAP_TEMPLATES.map(tpl => ({ ...tpl, is_global: true, created_by: null }))
        );
        loadTemplates();
      } catch {}
    })();
  }, [loading, templates.length, seeded]);

  const filtered = templates.filter(tpl =>
    !search ||
    tpl.name.toLowerCase().includes(search.toLowerCase()) ||
    (tpl.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id) {
    await supabase.from("case_templates").delete().eq("id", id);
    setConfirmDeleteId(null);
    loadTemplates();
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await supabase.from("case_templates").update({
        name: editForm.name,
        category: editForm.category || null,
        description: editForm.description || null,
      }).eq("id", editingId);
      setEditingId(null);
      loadTemplates();
    } catch {}
    setSaving(false);
  }

  if (showCreateCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <CreateCaseWizard
          auth={auth}
          createCase={createCase}
          presetData={createInitialData}
          onComplete={() => setShowCreateCase(false)}
          onCancel={() => setShowCreateCase(false)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("template.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">Manage reusable templates for cases and projects</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button onClick={() => setTemplateTab('case')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${templateTab === 'case' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <FileText size={14} /> Case Templates
        </button>
        <button onClick={() => setTemplateTab('project')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${templateTab === 'project' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <LayoutTemplate size={14} /> Project Templates
        </button>
        <button onClick={() => setTemplateTab('abap')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${templateTab === 'abap' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <FileCode2 size={14} /> ABAP Standards
        </button>
      </div>

      {templateTab === 'project' && <ProjectTemplatesSection auth={auth} />}
      {templateTab === 'abap'    && <AbapTemplatesSection auth={auth} />}

      {templateTab === 'case' && <>
      <div className="mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("template.search")}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <strong>Could not load templates:</strong> {loadError}
          <button onClick={loadTemplates} className="ml-3 underline text-red-600 hover:text-red-800">Retry</button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState Icon={LayoutTemplate} title={t("template.none")} subtitle="" />
      ) : (
        <div className="grid gap-4">
          {filtered.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              {editingId === tpl.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("template.name")}</label>
                    <input value={editForm.name ?? ""} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("template.category")}</label>
                    <input value={editForm.category ?? ""} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("label.description")}</label>
                    <textarea value={editForm.description ?? ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} disabled={saving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                      {saving ? t("state.saving") : t("action.save_changes")}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                      {t("action.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-900">{tpl.name}</h3>
                      {tpl.category && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">{tpl.category}</span>
                      )}
                      {tpl.is_global && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs">{t("template.builtin")}</span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-2">{tpl.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                      <span>{t("template.use_count").replace("{n}", tpl.use_count ?? 0)}</span>
                      {tpl.creator?.full_name && <span>By {tpl.creator.full_name}</span>}
                      <span>{tpl.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        const td = tpl.template_data ?? {};
                        setCreateInitialData({ title: td.title ?? tpl.name, description: td.description ?? tpl.description ?? "", ...td });
                        setShowCreateCase(true);
                        supabase.from("case_templates").update({ use_count: (tpl.use_count ?? 0) + 1 }).eq("id", tpl.id).then(() => {});
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> {t("template.create_from")}
                    </button>
                    <button
                      onClick={() => { setEditingId(tpl.id); setEditForm({ name: tpl.name, category: tpl.category ?? "", description: tpl.description ?? "" }); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === tpl.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(tpl.id)}
                          className="px-2 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg">{t("action.confirm")}</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">{t("action.cancel")}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(tpl.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </>}
    </div>
  );
}

// ============================================================
// PROJECT TEMPLATES — Section, Apply Modal, Save Modal
// ============================================================

function ProjectTemplatesSection({ auth }) {
  const { t } = useT();
  const { templates: customTemplates, loading, createTemplate, updateTemplate, deleteTemplate } = useProjectTemplates();
  const ALL = [...BUILT_IN_PROJECT_TEMPLATES, ...customTemplates];
  const [expanded, setExpanded]     = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState(null);
  // create form
  const [createForm, setCreateForm]   = useState({ name: '', description: '', category: '' });
  const [createItems, setCreateItems] = useState([{ title: '', description: '', est_hours: '', area_sap: '', priority: 'medium' }]);

  function addItem() { setCreateItems(p => [...p, { title: '', description: '', est_hours: '', area_sap: '', priority: 'medium' }]); }
  function removeItem(i) { setCreateItems(p => p.filter((_, idx) => idx !== i)); }
  function updateItem(i, field, val) { setCreateItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it)); }

  async function handleCreate() {
    if (!createForm.name.trim()) { setError('Template name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const items = createItems
        .filter(it => it.title.trim())
        .map((it, idx) => ({ id: `item-${Date.now()}-${idx}`, ...it, est_hours: it.est_hours ? Number(it.est_hours) : null, sort_order: idx }));
      await createTemplate({ ...createForm, items, created_by: auth.user?.id, is_public: true });
      setShowCreate(false);
      setCreateForm({ name: '', description: '', category: '' });
      setCreateItems([{ title: '', description: '', est_hours: '', area_sap: '', priority: 'medium' }]);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function handleSaveEdit() {
    setSaving(true); setError(null);
    try {
      await updateTemplate(editingId, { name: editForm.name, description: editForm.description, category: editForm.category });
      setEditingId(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  const canManage = auth.isAdmin || auth.isManager;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{ALL.length} template{ALL.length !== 1 ? 's' : ''} available</p>
        {canManage && (
          <button onClick={() => setShowCreate(p => !p)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl">
            <Plus size={14} /> {t("template.new")}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}

      {/* Create form */}
      {showCreate && canManage && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-blue-900 text-sm">{t("template.new_project_template")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.name")} *</label>
              <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. SAP Finance Implementation"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.category")}</label>
              <input value={createForm.category} onChange={e => setCreateForm(p => ({ ...p, category: e.target.value }))}
                placeholder="e.g. SAP Implementation"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t("label.description")}</label>
            <textarea value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Brief description of when to use this template…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">{t("template.items_cases")}</label>
              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"><Plus size={12} /> Add item</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {createItems.map((it, i) => (
                <div key={i} className="flex gap-2 items-start bg-white border border-gray-100 rounded-xl p-2">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input value={it.title} onChange={e => updateItem(i, 'title', e.target.value)}
                      placeholder="Case title *" className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                    <input value={it.est_hours} onChange={e => updateItem(i, 'est_hours', e.target.value)}
                      placeholder="Hours" type="number" min="0"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                    <input value={it.area_sap} onChange={e => updateItem(i, 'area_sap', e.target.value)}
                      placeholder="SAP area" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                    <select value={it.priority} onChange={e => updateItem(i, 'priority', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400">
                      {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input value={it.description} onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder="Description (optional)" className="col-span-3 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                  </div>
                  <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 mt-1 flex-shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setShowCreate(false); setError(null); }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-white rounded-xl border border-gray-200">{t("action.cancel")}</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2">
              {saving ? <><Spinner size={12} /> {t("state.saving")}</> : t("template.create")}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8"><Spinner /></div>}

      {/* Template list */}
      {ALL.map(tmpl => (
        <div key={tmpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {editingId === tmpl.id ? (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.name")}</label>
                  <input value={editForm.name ?? ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.category")}</label>
                  <input value={editForm.category ?? ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t("label.description")}</label>
                <textarea value={editForm.description ?? ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                  {saving ? t("state.saving") : t("action.save")}
                </button>
                <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">{t("action.cancel")}</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-900">{tmpl.name}</h3>
                    {tmpl.category && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">{tmpl.category}</span>}
                    {tmpl.is_builtin && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs">{t("template.builtin")}</span>}
                    {!tmpl.is_builtin && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">{t("template.custom")}</span>}
                  </div>
                  {tmpl.description && <p className="text-sm text-gray-500 mb-2">{tmpl.description}</p>}
                  <p className="text-xs text-gray-400">{(tmpl.items ?? []).length} item{(tmpl.items ?? []).length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setExpanded(expanded === tmpl.id ? null : tmpl.id)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1">
                    {expanded === tmpl.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {expanded === tmpl.id ? 'Hide' : 'Preview'}
                  </button>
                  {canManage && !tmpl.is_builtin && (
                    <>
                      <button onClick={() => { setEditingId(tmpl.id); setEditForm({ name: tmpl.name, category: tmpl.category ?? '', description: tmpl.description ?? '' }); setError(null); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil size={15} />
                      </button>
                      {confirmDel === tmpl.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={async () => { await deleteTemplate(tmpl.id); setConfirmDel(null); }}
                            className="px-2 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg">{t("action.delete")}</button>
                          <button onClick={() => setConfirmDel(null)}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">{t("action.cancel")}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(tmpl.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {expanded === tmpl.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="space-y-2">
                    {(tmpl.items ?? []).map((item, idx) => (
                      <div key={item.id ?? idx} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                          {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            {item.area_sap && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{item.area_sap}</span>}
                            {item.est_hours && <span className="text-xs text-gray-400">{item.est_hours}h</span>}
                            {item.priority && item.priority !== 'medium' && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${['high','urgent'].includes(item.priority) ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{item.priority}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ApplyTemplateModal({ projectId, clientId, userId, onClose, onDone }) {
  const { t } = useT();
  const { templates: customTemplates, loading } = useProjectTemplates();
  const ALL = [...BUILT_IN_PROJECT_TEMPLATES, ...customTemplates];
  const categories = ['All', ...[...new Set(ALL.map(t => t.category).filter(Boolean))]];

  const [catFilter, setCatFilter]           = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [items, setItems]                   = useState([]);
  const [applying, setApplying]             = useState(false);
  const [error, setError]                   = useState(null);

  const filtered = catFilter === 'All' ? ALL : ALL.filter(t => t.category === catFilter);

  function selectTemplate(tmpl) {
    setSelectedTemplate(tmpl);
    setItems((tmpl.items ?? []).map(it => ({ ...it, _selected: true })));
  }

  function toggleItem(id) { setItems(prev => prev.map(it => it.id === id ? { ...it, _selected: !it._selected } : it)); }
  function toggleAll() {
    const allOn = items.every(it => it._selected);
    setItems(prev => prev.map(it => ({ ...it, _selected: !allOn })));
  }

  async function handleApply() {
    const selected = items.filter(it => it._selected);
    if (!selected.length) { setError('Select at least one item to apply.'); return; }
    setApplying(true); setError(null);
    try {
      const rows = selected.map(item => ({
        title:           item.title,
        description:     item.description || null,
        priority:        ['low','medium','high','urgent'].includes(item.priority) ? item.priority : 'medium',
        area_sap:        item.area_sap || null,
        estimated_hours: item.est_hours ? Number(item.est_hours) : null,
        project_id:      projectId,
        client_id:       clientId ?? null,
        status:          'open',
        created_by:      userId,
      }));
      const { data: inserted, error: dbErr } = await supabase.from('cases').insert(rows).select('id');
      if (dbErr) throw new Error(dbErr.message);

      // Insert case_activities for items that carry activities
      if (inserted?.length) {
        const activitiesToInsert = [];
        selected.forEach((item, idx) => {
          if (!item.activities?.length) return;
          const caseId = inserted[idx]?.id;
          if (!caseId) return;
          item.activities.forEach(act => {
            activitiesToInsert.push({
              case_id:       caseId,
              title:         act.title,
              description:   act.description || null,
              est_hours:     act.est_hours ? Number(act.est_hours) : null,
              sort_order:    act.sort_order ?? 1,
              task_no:       act.sort_order ?? 1,
              phase:         act.phase || null,
              activity_type: 'task',
              status:        'pending',
              progress_pct:  0,
            });
          });
        });
        if (activitiesToInsert.length > 0) {
          const { error: actErr } = await supabase.from('case_activities').insert(activitiesToInsert);
          if (actErr) console.warn('Activities insert warning:', actErr.message);
        }
      }

      onDone();
    } catch (e) { setError(e.message); setApplying(false); }
  }

  const selCount = items.filter(it => it._selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{height: 'min(90vh, 720px)', minHeight: '480px'}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50"><LayoutTemplate size={18} className="text-blue-600" /></div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{t("template.apply")}</h2>
              <p className="text-xs text-gray-500">Select a template to create cases in this project</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: template list */}
          <div className="w-72 border-r border-gray-100 flex flex-col overflow-hidden flex-shrink-0">
            <div className="p-3 border-b border-gray-100 flex flex-wrap gap-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${catFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading && <div className="p-4 text-center text-xs text-gray-400">{t("label.loading")}</div>}
              {filtered.map(tmpl => (
                <button key={tmpl.id} onClick={() => selectTemplate(tmpl)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-colors ${selectedTemplate?.id === tmpl.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {tmpl.is_builtin
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">{t("template.builtin")}</span>
                      : <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">{t("template.custom")}</span>}
                    {tmpl.category && <span className="text-xs text-gray-400">{tmpl.category}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{tmpl.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{tmpl.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {(tmpl.items ?? []).length} phases
                    {(tmpl.items ?? []).some(i => i.activities?.length) && (
                      <span className="ml-1">· {(tmpl.items ?? []).reduce((s, i) => s + (i.activities?.length ?? 0), 0)} activities</span>
                    )}
                  </p>
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-gray-400">No templates in this category</div>
              )}
            </div>
          </div>

          {/* Right: items preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedTemplate ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <LayoutTemplate size={40} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Select a template from the left to preview its items</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900">{selectedTemplate.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedTemplate.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      {items.every(it => it._selected) ? 'Deselect all' : 'Select all'}
                    </button>
                    <span className="text-xs text-gray-400">{selCount} of {items.length} selected</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {items.map(item => (
                    <button key={item.id} onClick={() => toggleItem(item.id)}
                      className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${item._selected ? 'border-blue-200 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${item._selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {item._selected && <Check size={9} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                        {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          {item.area_sap && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{item.area_sap}</span>}
                          {item.est_hours && <span className="text-xs text-gray-400">{item.est_hours}h</span>}
                          {item.activities?.length > 0 && (
                            <span className="text-xs text-blue-500 font-medium">{item.activities.length} activities</span>
                          )}
                          {item.priority && item.priority !== 'medium' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${['high','urgent','critical'].includes(item.priority) ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{item.priority}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
            {error ?? (() => {
              if (!selCount) return 'Select items to apply';
              const totalActs = items.filter(it => it._selected).reduce((s, it) => s + (it.activities?.length ?? 0), 0);
              return `${selCount} case${selCount === 1 ? '' : 's'}${totalActs > 0 ? ` + ${totalActs} activities` : ''} will be created`;
            })()}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">{t("action.cancel")}</button>
            <button onClick={handleApply} disabled={applying || !selCount || !selectedTemplate}
              className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2">
              {applying ? <><Spinner size={12} /> Applying…</> : <><Check size={14} /> Apply {selCount > 0 ? selCount : ''} Cases</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveTemplateModal({ cases, auth, onClose, onSaved }) {
  const { t } = useT();
  const { createTemplate } = useProjectTemplates();
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [category, setCategory]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  async function handleSave() {
    if (!name.trim()) { setError('Template name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const items = cases.map((c, i) => ({
        id: `item-${i}`,
        title: c.title,
        description: c.description ?? '',
        priority: c.priority ?? 'medium',
        area_sap: c.area_sap ?? '',
        est_hours: c.estimated_hours ?? null,
        sort_order: i,
      }));
      await createTemplate({ name: name.trim(), description: description.trim() || null, category: category.trim() || 'Custom', is_public: true, created_by: auth.user?.id, items });
      onSaved();
    } catch (e) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">{t("template.save_as")}</h2>
        <p className="text-sm text-gray-500 mb-4">{cases.length} case{cases.length !== 1 ? 's' : ''} will be saved as template items.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.name")} *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My SAP Finance Project"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t("template.category")}</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. SAP Implementation"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t("label.description")}</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Briefly describe this template…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">{t("action.cancel")}</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2">
            {saving ? <><Spinner size={12} /> {t("state.saving")}</> : t("template.save_as")}
          </button>
        </div>
      </div>
    </div>
  );
}

export { BUILT_IN_PROJECT_TEMPLATES, SAP_TEMPLATES, CaseTemplatePickerModal, SaveCaseAsTemplateModal, CaseTemplatesView, ProjectTemplatesSection, ApplyTemplateModal, SaveTemplateModal };
