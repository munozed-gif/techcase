-- ============================================================
-- TechCase — Migration Hub Test Data
-- 3 full migration projects with all related records
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Helpers ──────────────────────────────────────────────────
-- We use DO blocks so we can reference IDs across inserts.

DO $$
DECLARE
  -- Project UUIDs
  p1 uuid := gen_random_uuid();   -- ECC to S/4 Brownfield
  p2 uuid := gen_random_uuid();   -- Greenfield S/4 Cloud
  p3 uuid := gen_random_uuid();   -- Selective Data Transfer

  -- migration_project UUIDs
  mp1 uuid := gen_random_uuid();
  mp2 uuid := gen_random_uuid();
  mp3 uuid := gen_random_uuid();

  -- Cutover run UUIDs
  cr1_dr1 uuid := gen_random_uuid();
  cr1_dr2 uuid := gen_random_uuid();
  cr1_go  uuid := gen_random_uuid();
  cr2_dr1 uuid := gen_random_uuid();
  cr2_go  uuid := gen_random_uuid();
  cr3_dr1 uuid := gen_random_uuid();
  cr3_go  uuid := gen_random_uuid();

  -- Data migration object UUIDs for project 1
  dmo1_1 uuid := gen_random_uuid();
  dmo1_2 uuid := gen_random_uuid();
  dmo1_3 uuid := gen_random_uuid();
  dmo1_4 uuid := gen_random_uuid();
  dmo1_5 uuid := gen_random_uuid();

  -- Data migration object UUIDs for project 2
  dmo2_1 uuid := gen_random_uuid();
  dmo2_2 uuid := gen_random_uuid();
  dmo2_3 uuid := gen_random_uuid();

  -- Data migration object UUIDs for project 3
  dmo3_1 uuid := gen_random_uuid();
  dmo3_2 uuid := gen_random_uuid();
  dmo3_3 uuid := gen_random_uuid();
  dmo3_4 uuid := gen_random_uuid();

BEGIN

-- ══════════════════════════════════════════════════════════════
-- 1. BASE PROJECTS
-- ══════════════════════════════════════════════════════════════

INSERT INTO projects (id, name, description, status, project_type,
  start_date, end_date, industry, area_sap,
  objectives, deliverables, success_criteria, out_of_scope,
  skills_required, work_mode, priority)
VALUES
  -- Project 1: ECC → S/4HANA Brownfield (ACME Corp)
  (p1,
   'ACME Corp – ECC to S/4HANA 2023',
   'Full brownfield migration from SAP ECC 6.0 EHP8 to SAP S/4HANA 2023 for a mid-size manufacturing company. Scope includes FI, CO, MM, SD, PP modules.',
   'active', 'migration',
   '2026-01-15', '2026-12-31', 'Manufacturing', 'FI/CO/MM/SD/PP',
   'Migrate ACME Corp to SAP S/4HANA 2023 preserving all historical data and business processes while adopting standard SAP best practices and simplifications.',
   ARRAY['Go-Live S/4HANA 2023','WRICEF Remediation Report','Data Migration Sign-Off Package','Cutover Plan','End-User Training Material'],
   'Zero critical open defects at go-live; data reconciliation variance < 0.1%; system uptime > 99.5% post go-live',
   'SAP BW/4HANA upgrade; Ariba integration rework; Legacy payroll migration',
   ARRAY['SAP FI','SAP CO','SAP MM','SAP SD','SAP PP','SAP Basis','ABAP','Data Migration'],
   'hybrid', 'critical'),

  -- Project 2: Greenfield S/4HANA Cloud (TechNova)
  (p2,
   'TechNova – S/4HANA Cloud Greenfield',
   'Greenfield implementation of SAP S/4HANA Cloud Public Edition for a fast-growing tech services company. SAP Activate methodology, 100% cloud-native.',
   'active', 'migration',
   '2026-03-01', '2026-10-15', 'Technology', 'FI/MM/SD',
   'Implement SAP S/4HANA Cloud PE with full adoption of standard processes, eliminating legacy customizations and enabling continuous innovation.',
   ARRAY['Configured S/4HANA Cloud Tenant','Integration Suite Setup','Data Load Validation','Fit-to-Standard Workshop Results','Hypercare Plan'],
   'All 47 business processes covered by standard S/4HANA; go-live within budget; user adoption score ≥ 4/5',
   'Legacy CRM data historical migration; Custom ABAP development; On-premise integration without SAP BTP',
   ARRAY['SAP S/4HANA Cloud','SAP FI','SAP MM','SAP SD','SAP BTP','Integration'],
   'remote', 'high'),

  -- Project 3: Selective Data Transfer (GlobalLogix)
  (p3,
   'GlobalLogix – Selective Data Transfer',
   'Selective data transfer (SLT / SNP Cockpit) from SAP ECC 6.0 to new S/4HANA 2022 system. Only open items, master data and last 3 years of transactional data.',
   'active', 'migration',
   '2026-05-01', '2026-11-30', 'Logistics', 'FI/MM/SD/WM',
   'Transfer selective data from ECC to a pre-built S/4HANA 2022 system; validate completeness and accuracy; achieve go-live within 6-month timeline.',
   ARRAY['Data Extraction Spec','Transformation Rules Catalogue','Mock Run 1 & 2 Results','Go-Live Data Package','Reconciliation Report'],
   'Open item reconciliation match 100%; Master data completeness > 99%; Go-live weekend downtime < 36 hours',
   'PP/QM module data; Archived documents older than 3 years; Third-party WMS historical data',
   ARRAY['SAP FI','SAP MM','SAP SD','SAP WM','Data Migration','ABAP','SNP Cockpit'],
   'onsite', 'high');


-- ══════════════════════════════════════════════════════════════
-- 2. MIGRATION PROJECTS (the hub records)
-- ══════════════════════════════════════════════════════════════

INSERT INTO migration_projects (id, project_id, approach, source_version, target_version,
  go_live_date, current_phase)
VALUES
  (mp1, p1, 'brownfield', 'SAP ECC 6.0 EHP8', 'SAP S/4HANA 2023', '2026-12-15', 'realize'),
  (mp2, p2, 'greenfield', 'No SAP System', 'SAP S/4HANA Cloud PE 2405', '2026-10-01', 'deploy'),
  (mp3, p3, 'bluefield', 'SAP ECC 6.0 EHP7', 'SAP S/4HANA 2022', '2026-11-20', 'prepare');


-- ══════════════════════════════════════════════════════════════
-- 3. PHASE DELIVERABLES
-- ══════════════════════════════════════════════════════════════

-- Project 1 (Brownfield – in Realize phase)
INSERT INTO migration_phase_deliverables (migration_project_id, phase, title, completed, completed_at)
VALUES
  -- Discover
  (mp1,'discover','Initial Scope Document',true,'2026-01-20 10:00:00+00'),
  (mp1,'discover','System Landscape Assessment',true,'2026-01-22 14:00:00+00'),
  (mp1,'discover','Business Case & TCO',true,'2026-01-28 09:00:00+00'),
  -- Prepare
  (mp1,'prepare','Project Charter Signed',true,'2026-02-05 11:00:00+00'),
  (mp1,'prepare','SAP Activate Kickoff',true,'2026-02-10 09:00:00+00'),
  (mp1,'prepare','System Readiness Check',true,'2026-02-20 16:00:00+00'),
  (mp1,'prepare','WRICEF Inventory v1',true,'2026-02-28 15:00:00+00'),
  -- Explore
  (mp1,'explore','Fit-Gap Workshop – FI/CO',true,'2026-03-15 10:00:00+00'),
  (mp1,'explore','Fit-Gap Workshop – MM/SD/PP',true,'2026-03-22 10:00:00+00'),
  (mp1,'explore','Simplification Items Assessment',true,'2026-04-01 14:00:00+00'),
  (mp1,'explore','Solution Landscape Design',true,'2026-04-10 16:00:00+00'),
  (mp1,'explore','Data Migration Strategy',true,'2026-04-15 11:00:00+00'),
  -- Realize (in progress)
  (mp1,'realize','Configuration Baseline',true,'2026-05-10 09:00:00+00'),
  (mp1,'realize','Unit Test Scripts',true,'2026-05-25 15:00:00+00'),
  (mp1,'realize','WRICEF Development – Batch 1',true,'2026-06-20 14:00:00+00'),
  (mp1,'realize','Data Migration Mock Run 1',true,'2026-07-15 10:00:00+00'),
  (mp1,'realize','Integration Test Round 1',true,'2026-08-01 09:00:00+00'),
  (mp1,'realize','WRICEF Development – Batch 2',false,null),
  (mp1,'realize','Data Migration Mock Run 2',false,null),
  (mp1,'realize','User Acceptance Testing (UAT)',false,null),
  -- Deploy / Run (not started)
  (mp1,'deploy','Cutover Dress Rehearsal 1',false,null),
  (mp1,'deploy','Cutover Dress Rehearsal 2',false,null),
  (mp1,'deploy','Go-Live Weekend Execution',false,null),
  (mp1,'run','Hypercare Week 1 Review',false,null),
  (mp1,'run','Hypercare Week 2 Review',false,null),
  (mp1,'run','Project Close-Out Report',false,null);

-- Project 2 (Greenfield – in Deploy phase)
INSERT INTO migration_phase_deliverables (migration_project_id, phase, title, completed, completed_at)
VALUES
  (mp2,'discover','Digital Discovery Assessment',true,'2026-03-05 10:00:00+00'),
  (mp2,'discover','Cloud Readiness Checklist',true,'2026-03-08 14:00:00+00'),
  (mp2,'prepare','SAP BTP Tenant Setup',true,'2026-03-20 09:00:00+00'),
  (mp2,'prepare','Fit-to-Standard Workshop Agenda',true,'2026-03-25 11:00:00+00'),
  (mp2,'explore','Fit-to-Standard Workshop – Finance',true,'2026-04-10 09:00:00+00'),
  (mp2,'explore','Fit-to-Standard Workshop – Logistics',true,'2026-04-17 09:00:00+00'),
  (mp2,'explore','Delta Design Decisions Log',true,'2026-04-25 15:00:00+00'),
  (mp2,'realize','Sprint 1 – FI Configuration',true,'2026-05-15 17:00:00+00'),
  (mp2,'realize','Sprint 2 – MM/SD Configuration',true,'2026-06-13 17:00:00+00'),
  (mp2,'realize','Sprint 3 – Integrations',true,'2026-07-11 17:00:00+00'),
  (mp2,'realize','UAT Sign-Off',true,'2026-08-30 16:00:00+00'),
  (mp2,'deploy','Data Load – Master Data',true,'2026-09-05 12:00:00+00'),
  (mp2,'deploy','Data Load – Open Items',true,'2026-09-10 14:00:00+00'),
  (mp2,'deploy','Cutover Rehearsal',true,'2026-09-20 08:00:00+00'),
  (mp2,'deploy','Go-Live',false,null),
  (mp2,'run','Hypercare Support',false,null),
  (mp2,'run','Knowledge Transfer Sessions',false,null);

-- Project 3 (Bluefield – in Prepare phase)
INSERT INTO migration_phase_deliverables (migration_project_id, phase, title, completed, completed_at)
VALUES
  (mp3,'discover','Data Volume Assessment',true,'2026-05-08 10:00:00+00'),
  (mp3,'discover','Selective Transfer Scope',true,'2026-05-12 14:00:00+00'),
  (mp3,'prepare','SNP Cockpit License & Setup',true,'2026-05-20 11:00:00+00'),
  (mp3,'prepare','Extraction Rules Definition',true,'2026-05-28 16:00:00+00'),
  (mp3,'prepare','Transformation Catalogue Draft',false,null),
  (mp3,'explore','Data Mapping Workshop – FI',false,null),
  (mp3,'explore','Data Mapping Workshop – MM/SD',false,null),
  (mp3,'explore','Business Rules Sign-Off',false,null),
  (mp3,'realize','Mock Run 1 Execution',false,null),
  (mp3,'realize','Mock Run 2 Execution',false,null),
  (mp3,'realize','Reconciliation Validation',false,null),
  (mp3,'deploy','Go-Live Data Load',false,null),
  (mp3,'run','Post-Migration Audit',false,null);


-- ══════════════════════════════════════════════════════════════
-- 4. PHASE GATES
-- ══════════════════════════════════════════════════════════════

INSERT INTO migration_phase_gates (migration_project_id, phase, status, approved_at, notes)
VALUES
  -- Project 1 gates
  (mp1,'discover','completed','2026-01-30 10:00:00+00','All discover deliverables approved by steering committee.'),
  (mp1,'prepare','completed','2026-03-01 09:00:00+00','Project charter signed; sandbox provisioned.'),
  (mp1,'explore','completed','2026-04-20 15:00:00+00','Fit-gap complete; 47 gaps identified, remediation plan approved.'),
  (mp1,'realize','in_progress',null,'UAT and Mock Run 2 pending before gate closure.'),
  (mp1,'deploy','not_started',null,null),
  (mp1,'run','not_started',null,null),
  -- Project 2 gates
  (mp2,'discover','completed','2026-03-10 11:00:00+00','Cloud readiness confirmed. Green light from CTO.'),
  (mp2,'prepare','completed','2026-04-01 10:00:00+00','Tenant ready, team onboarded.'),
  (mp2,'explore','completed','2026-04-30 16:00:00+00','Fit-to-standard workshops complete. 8 delta decisions logged.'),
  (mp2,'realize','completed','2026-09-01 17:00:00+00','All sprints done; UAT signed off.'),
  (mp2,'deploy','in_progress',null,'Data loads complete; final go-live cutover pending.'),
  (mp2,'run','not_started',null,null),
  -- Project 3 gates
  (mp3,'discover','completed','2026-05-15 09:00:00+00','Selective scope approved. 3-year window confirmed.'),
  (mp3,'prepare','in_progress',null,'Transformation catalogue still in draft.'),
  (mp3,'explore','not_started',null,null),
  (mp3,'realize','not_started',null,null),
  (mp3,'deploy','not_started',null,null),
  (mp3,'run','not_started',null,null);


-- ══════════════════════════════════════════════════════════════
-- 5. WRICEF OBJECTS
-- ══════════════════════════════════════════════════════════════

-- Project 1 (Brownfield – lots of WRICEF)
INSERT INTO wricef_objects (migration_project_id, type, name, object_id, description,
  complexity, effort_days, remediation_approach, status)
VALUES
  (mp1,'R','Vendor Aging Report','ZFI_VEND_AGING','Custom ABAP report for vendor open-item aging analysis by company code','medium',5,'Re-implement using CDS views + ALV Grid in Fiori','remediated'),
  (mp1,'R','Customer Statement Report','ZSD_CUST_STMT','Customer account statement PDF with custom layout','high',8,'Convert to SAP S/4 Account Statement – BRFplus customization','in_progress'),
  (mp1,'R','Inventory Valuation Report','ZMM_INV_VAL','Stock valuation by plant and storage location with batch breakdown','medium',4,'Standard S/4 MR21 + custom Fiori app extension','open'),
  (mp1,'I','EDI 810 Invoice Interface','ZFI_EDI810','Inbound EDI 810 invoice processing via SAP PI/PO','high',12,'Migrate SAP PI/PO iFlow to SAP Integration Suite','in_progress'),
  (mp1,'I','CRM Opportunity Sync','ZSD_CRM_SYNC','Outbound IDOC to legacy CRM for order confirmation','medium',7,'Replace with BTP Event Mesh + REST API','open'),
  (mp1,'C','Document Splitting Custom Logic','ZFI_DOC_SPLIT','Custom enhancement for document splitting in FI-GL','high',10,'Evaluate standard S/4 document splitting; delta custom logic','remediated'),
  (mp1,'C','Material Price Control Override','ZMM_PRICE_OVR','Conversion exit for MAP price override in GR posting','low',3,'Standard configuration covers 80%; small BADI remains','remediated'),
  (mp1,'E','Purchase Order User Exit','ZME_PO_EXIT','User exit ME_PROCESS_PO_CUST for custom approval logic','medium',6,'Convert to BAdI ME_PROCESS_PO_CUST in S/4','tested'),
  (mp1,'E','Invoice Parking Workflow','ZFI_INV_WF','Custom ABAP workflow for 3-way match exception parking','high',14,'Replace with SAP Business Workflow in S/4; migrate WI','in_progress'),
  (mp1,'F','Vendor Payment Advice Form','ZFI_PAY_ADV','Smartform-based vendor remittance advice','medium',4,'Convert Smartform to SAP Script / Adobe Form in S/4','remediated'),
  (mp1,'F','Delivery Note Custom Form','ZSD_DEL_NOTE','Smartform delivery note with logo, barcode, packing list','high',8,'Adobe Interactive Form with BTP Document Management','open'),
  (mp1,'W','Credit Limit Workflow','ZSD_CREDIT_WF','Custom workflow for credit limit exception approval','medium',5,'Convert to SAP S/4 credit management workflow','tested'),

  -- Project 2 (Greenfield – minimal WRICEF, cloud-standard)
  (mp2,'R','Executive Sales Dashboard','ZSD_EXEC_DASH','Executive dashboard – being replaced by standard S/4 Fiori analytics','low',2,'Use standard S/4 Cloud Analytical Apps – no custom dev','remediated'),
  (mp2,'I','Salesforce CRM Integration','ZSD_SF_SYNC','Real-time customer & order sync to Salesforce CRM','high',15,'SAP BTP Integration Suite – pre-built Salesforce connector','in_progress'),
  (mp2,'I','Bank Statement Inbound','ZFI_BAI2','BAI2 bank statement inbound processing','medium',6,'Use standard SAP Multi-Bank Connectivity (MBC)','remediated'),

  -- Project 3 (Bluefield – focused on data conversion objects)
  (mp3,'C','Customer Open Items Extraction','ZSDT_CUST_OI','Extract open AR items with clearing history for selective transfer','high',10,'SNP Cockpit extraction rule; custom ABAP validation report','in_progress'),
  (mp3,'C','Vendor Open Items Extraction','ZSDT_VEND_OI','Extract open AP items including partially cleared items','high',8,'SNP Cockpit extraction rule with aging reconciliation','open'),
  (mp3,'C','Material Master Selective Load','ZSDT_MAT_MSTR','Transfer only materials used in last 36 months (activity-based)','medium',5,'LSMW + BAPI_MATERIAL_SAVEDATA with date filter','open'),
  (mp3,'C','GL Balance Carryforward','ZSDT_GL_CARRY','Carry forward GL account balances; exclude zero-balance accounts','medium',4,'Standard S/4 FBL3N extract + F.16 balance carryforward','open'),
  (mp3,'R','Data Reconciliation Report','ZSDT_RECON','Side-by-side ECC vs S/4 balance comparison by company code','high',7,'Custom ABAP report comparing Supabase staging vs S/4 tables','open');


-- ══════════════════════════════════════════════════════════════
-- 6. CUTOVER RUNS
-- ══════════════════════════════════════════════════════════════

INSERT INTO cutover_runs (id, migration_project_id, run_type, scheduled_date,
  system_freeze_date, downtime_start, downtime_end, status, go_no_go, go_no_go_at, notes)
VALUES
  -- Project 1
  (cr1_dr1, mp1, 'dr1',
   '2026-09-13 06:00:00+00', '2026-09-12 18:00:00+00',
   '2026-09-13 06:00:00+00', '2026-09-14 20:00:00+00',
   'completed', 'go', '2026-09-12 17:00:00+00',
   'DR1 completed in 38h. 3 critical tasks delayed; root causes documented. Overall GO for DR2.'),
  (cr1_dr2, mp1, 'dr2',
   '2026-11-08 06:00:00+00', '2026-11-07 18:00:00+00',
   '2026-11-08 06:00:00+00', '2026-11-09 22:00:00+00',
   'planned', null, null,
   'DR2 target: complete within 32h based on DR1 lessons learned.'),
  (cr1_go, mp1, 'go_live',
   '2026-12-13 06:00:00+00', '2026-12-12 18:00:00+00',
   '2026-12-13 06:00:00+00', '2026-12-15 06:00:00+00',
   'planned', null, null,
   'Production go-live. Target downtime window: 48h max.'),

  -- Project 2
  (cr2_dr1, mp2, 'dr1',
   '2026-09-20 08:00:00+00', '2026-09-20 00:00:00+00',
   '2026-09-20 08:00:00+00', '2026-09-20 20:00:00+00',
   'completed', 'go', '2026-09-20 06:00:00+00',
   'Cloud cutover rehearsal completed in 11h. All data loads successful. GO approved.'),
  (cr2_go, mp2, 'go_live',
   '2026-10-04 22:00:00+00', '2026-10-04 12:00:00+00',
   '2026-10-04 22:00:00+00', '2026-10-05 10:00:00+00',
   'planned', null, null,
   'Weekend go-live. Target: 12h downtime window. Cloud activation + DNS cutover.'),

  -- Project 3
  (cr3_dr1, mp3, 'dr1',
   '2026-10-18 06:00:00+00', '2026-10-17 20:00:00+00',
   '2026-10-18 06:00:00+00', '2026-10-19 18:00:00+00',
   'planned', null, null,
   'Mock run 1: selective data extraction and load. Full reconciliation expected.'),
  (cr3_go, mp3, 'go_live',
   '2026-11-22 04:00:00+00', '2026-11-21 16:00:00+00',
   '2026-11-22 04:00:00+00', '2026-11-23 16:00:00+00',
   'planned', null, null,
   'Go-live. 36h downtime window. All selective data loaded; ECC decommission follows Monday.');


-- ══════════════════════════════════════════════════════════════
-- 7. CUTOVER TASKS
-- ══════════════════════════════════════════════════════════════

-- Project 1 cutover tasks
INSERT INTO cutover_tasks (migration_project_id, seq, title, team, duration_hours,
  depends_on, run_type, status, started_at, completed_at)
VALUES
  (mp1, 1,  'System freeze – block ECC production postings', 'Basis', 0.5, null, 'all', 'done', '2026-09-12 18:00:00+00', '2026-09-12 18:30:00+00'),
  (mp1, 2,  'Final ECC backup (full system)', 'Basis', 2.0, 1, 'all', 'done', '2026-09-12 19:00:00+00', '2026-09-12 21:00:00+00'),
  (mp1, 3,  'Export open purchase orders (MM)', 'Migration Team', 1.5, 2, 'all', 'done', '2026-09-13 06:00:00+00', '2026-09-13 07:30:00+00'),
  (mp1, 4,  'Export open sales orders (SD)', 'Migration Team', 1.5, 2, 'all', 'done', '2026-09-13 06:00:00+00', '2026-09-13 07:30:00+00'),
  (mp1, 5,  'Export open FI documents (AR/AP/GL)', 'Migration Team', 3.0, 2, 'all', 'done', '2026-09-13 06:00:00+00', '2026-09-13 09:00:00+00'),
  (mp1, 6,  'SUM (Software Update Manager) tool run', 'Basis', 12.0, 2, 'all', 'done', '2026-09-13 09:00:00+00', '2026-09-13 21:00:00+00'),
  (mp1, 7,  'S/4HANA system startup & health check', 'Basis', 1.0, 6, 'all', 'done', '2026-09-13 21:00:00+00', '2026-09-13 22:00:00+00'),
  (mp1, 8,  'Load open AR/AP open items', 'Migration Team', 4.0, 7, 'all', 'done', '2026-09-13 22:00:00+00', '2026-09-14 02:00:00+00'),
  (mp1, 9,  'Load open sales orders', 'Migration Team', 3.0, 8, 'all', 'done', '2026-09-14 02:00:00+00', '2026-09-14 05:00:00+00'),
  (mp1, 10, 'Reconciliation check – FI balances', 'Finance Team', 2.0, 8, 'all', 'done', '2026-09-14 05:00:00+00', '2026-09-14 07:00:00+00'),
  (mp1, 11, 'Smoke test – FI posting (FV50)', 'Finance Team', 1.0, 10, 'all', 'done', '2026-09-14 07:00:00+00', '2026-09-14 08:00:00+00'),
  (mp1, 12, 'Smoke test – PO creation & GR (ME21N/MIGO)', 'MM Team', 1.0, 9, 'all', 'done', '2026-09-14 08:00:00+00', '2026-09-14 09:00:00+00'),
  (mp1, 13, 'Go/No-Go decision meeting', 'Steering Committee', 0.5, 12, 'all', 'done', '2026-09-14 17:00:00+00', '2026-09-14 17:30:00+00'),
  (mp1, 14, 'System open for users (PROD cutover only)', 'Basis', 0.5, 13, 'go_live', 'pending', null, null),

  -- Project 2 cutover tasks (leaner – cloud)
  (mp2, 1,  'Freeze master data changes in legacy system', 'Operations', 0.5, null, 'all', 'done', '2026-09-20 00:00:00+00', '2026-09-20 00:30:00+00'),
  (mp2, 2,  'Final master data extraction (Business Partner, Material)', 'Migration Team', 2.0, 1, 'all', 'done', '2026-09-20 01:00:00+00', '2026-09-20 03:00:00+00'),
  (mp2, 3,  'Load Business Partners to S/4 Cloud', 'Migration Team', 1.5, 2, 'all', 'done', '2026-09-20 08:00:00+00', '2026-09-20 09:30:00+00'),
  (mp2, 4,  'Load open AR / AP items', 'Finance', 2.0, 3, 'all', 'done', '2026-09-20 09:30:00+00', '2026-09-20 11:30:00+00'),
  (mp2, 5,  'Integration Suite connectivity test (Salesforce)', 'Integration', 1.0, 3, 'all', 'done', '2026-09-20 11:00:00+00', '2026-09-20 12:00:00+00'),
  (mp2, 6,  'Smoke test – full Order-to-Cash cycle', 'SD Team', 1.5, 4, 'all', 'done', '2026-09-20 12:00:00+00', '2026-09-20 13:30:00+00'),
  (mp2, 7,  'Reconciliation sign-off', 'Finance', 1.0, 6, 'all', 'done', '2026-09-20 14:00:00+00', '2026-09-20 15:00:00+00'),
  (mp2, 8,  'DNS cutover & user access activation', 'Basis', 0.5, 7, 'go_live', 'pending', null, null),

  -- Project 3 cutover tasks
  (mp3, 1,  'ECC data freeze – block all postings', 'Basis', 0.5, null, 'all', 'pending', null, null),
  (mp3, 2,  'SNP Cockpit – start selective extraction job', 'Migration Team', 1.0, 1, 'all', 'pending', null, null),
  (mp3, 3,  'Extraction monitoring & delta reconciliation', 'Migration Team', 6.0, 2, 'all', 'pending', null, null),
  (mp3, 4,  'Load Customer Master (XD01)', 'Migration Team', 2.0, 3, 'all', 'pending', null, null),
  (mp3, 5,  'Load Vendor Master (XK01)', 'Migration Team', 2.0, 3, 'all', 'pending', null, null),
  (mp3, 6,  'Load Material Master (MM01)', 'Migration Team', 3.0, 3, 'all', 'pending', null, null),
  (mp3, 7,  'Load Open AR Items (F-22)', 'Finance', 4.0, 4, 'all', 'pending', null, null),
  (mp3, 8,  'Load Open AP Items (F-43)', 'Finance', 4.0, 5, 'all', 'pending', null, null),
  (mp3, 9,  'Load Open POs (ME22N mass update)', 'MM Team', 3.0, 6, 'all', 'pending', null, null),
  (mp3, 10, 'Load Open SOs (VA02 mass update)', 'SD Team', 3.0, 6, 'all', 'pending', null, null),
  (mp3, 11, 'Reconciliation check – all objects', 'QA Team', 4.0, 10, 'all', 'pending', null, null),
  (mp3, 12, 'Go/No-Go decision', 'Steering Committee', 0.5, 11, 'all', 'pending', null, null),
  (mp3, 13, 'Activate S/4HANA system for users', 'Basis', 0.5, 12, 'go_live', 'pending', null, null);


-- ══════════════════════════════════════════════════════════════
-- 8. DATA MIGRATION OBJECTS
-- ══════════════════════════════════════════════════════════════

INSERT INTO data_migration_objects (id, migration_project_id, name, sap_object,
  category, record_count_source, mapping_status,
  mock_run_1_pct, mock_run_1_errors,
  mock_run_2_pct, mock_run_2_errors,
  go_live_pct, go_live_errors, go_no_go, notes)
VALUES
  -- Project 1 data objects
  (dmo1_1, mp1, 'Customer Master', 'DEBMAS06', 'Master Data', 12450, 'completed',
   96.2, 47, 99.1, 11, null, null, false, 'Main issues: duplicate BP numbers, missing payment terms.'),
  (dmo1_2, mp1, 'Vendor Master', 'CREMAS05', 'Master Data', 4320, 'completed',
   98.0, 9, 99.6, 2, null, null, false, 'Minor issues with bank account IBAN validation.'),
  (dmo1_3, mp1, 'Material Master', 'MATMAS05', 'Master Data', 58900, 'completed',
   94.5, 323, 98.7, 76, null, null, false, 'Long text migration required extra transformation step.'),
  (dmo1_4, mp1, 'Open AR Items', 'FIDCCP02', 'Transactional', 89200, 'in_progress',
   91.3, 776, null, null, null, null, false, 'Mock Run 2 pending. Main gap: cleared items misclassification.'),
  (dmo1_5, mp1, 'GL Account Master', 'GLM_COAS', 'Master Data', 3800, 'completed',
   99.8, 1, 100.0, 0, null, null, true, 'Fully validated. Go-No-Go signed.'),

  -- Project 2 data objects
  (dmo2_1, mp2, 'Business Partner – Customers', 'DEBMAS06', 'Master Data', 2800, 'completed',
   98.5, 4, 99.9, 0, 100.0, 0, true, 'Loaded to cloud tenant. BP deduplication via MDG.'),
  (dmo2_2, mp2, 'Business Partner – Vendors', 'CREMAS05', 'Master Data', 850, 'completed',
   99.2, 7, 100.0, 0, 100.0, 0, true, 'All vendors loaded. Payment method mapping complete.'),
  (dmo2_3, mp2, 'Open AR Balance Transfer', 'FIDCCP02', 'Transactional', 14600, 'completed',
   97.8, 32, 99.4, 9, null, null, false, 'Final load pending go-live weekend. Manual reconciliation approved.'),

  -- Project 3 data objects
  (dmo3_1, mp3, 'Customer Master (active last 3y)', 'DEBMAS06', 'Master Data', 7200, 'in_progress',
   null, null, null, null, null, null, false, 'Extraction rules defined; mock run 1 scheduled Oct 18.'),
  (dmo3_2, mp3, 'Vendor Master (active last 3y)', 'CREMAS05', 'Master Data', 2100, 'in_progress',
   null, null, null, null, null, null, false, 'IBAN validation rules being updated.'),
  (dmo3_3, mp3, 'Open AP Items', 'FIDCCP02', 'Transactional', 43500, 'not_started',
   null, null, null, null, null, null, false, 'Depends on vendor master completion.'),
  (dmo3_4, mp3, 'Open Purchase Orders (last 3y)', 'PORDCR1', 'Transactional', 28700, 'not_started',
   null, null, null, null, null, null, false, 'Scope: only POs with open quantity or invoice balance.');


-- ══════════════════════════════════════════════════════════════
-- 9. DATA QUALITY ISSUES
-- ══════════════════════════════════════════════════════════════

INSERT INTO data_quality_issues (data_object_id, title, description, severity, status, resolved_at)
VALUES
  -- Customer Master issues (project 1)
  (dmo1_1, 'Duplicate Business Partner numbers', 'Legacy ECC has 312 customers with duplicate BP numbers created before MDM enforcement. Require manual dedup before migration.', 'high', 'in_progress', null),
  (dmo1_1, 'Missing payment terms on 147 customers', 'Payment terms (ZTERM) blank on 147 customer records. Defaulting to ZNET30 pending business approval.', 'medium', 'resolved', '2026-08-15 14:00:00+00'),
  (dmo1_1, 'Invalid country codes in address', '23 customer records with non-ISO country codes (e.g., "UK" instead of "GB"). Transformation rule applied.', 'low', 'resolved', '2026-07-28 10:00:00+00'),

  -- Material Master issues (project 1)
  (dmo1_3, 'Missing base unit of measure on 450 materials', 'Materials created before 2015 have blank BASE_UOM. Business confirmed EA (Each) as default.', 'high', 'resolved', '2026-08-01 09:00:00+00'),
  (dmo1_3, 'Long text truncation in MARA-MAKTX', 'Material descriptions exceeding 40 chars being truncated. 8,231 materials affected. Extended description field migration added.', 'medium', 'in_progress', null),
  (dmo1_3, 'Invalid profit center on 76 materials', '76 plant-level material records point to deactivated profit centers. Requires G/L account reassignment.', 'critical', 'in_progress', null),

  -- AR Open Items issues (project 1)
  (dmo1_4, 'Clearing reference mismatch', '3,400 cleared AR documents have mismatched clearing references between BSID and BSAD. Root cause: custom clearing program with no standard AUGBL update.', 'critical', 'in_progress', null),
  (dmo1_4, 'Currency rounding differences', '12 invoices have < 0.01 USD rounding differences vs legacy. Tolerance approved by Finance Controller.', 'low', 'resolved', '2026-08-20 11:00:00+00'),

  -- Project 2 issues
  (dmo2_3, 'Credit control area mapping gap', '180 customer invoices reference a legacy credit control area not existing in S/4 Cloud. New CCA created and mapped.', 'high', 'resolved', '2026-09-08 16:00:00+00'),
  (dmo2_3, 'Tax code missing on 9 open items', '9 open invoices missing tax codes due to legacy manual entry workaround. Manual correction applied.', 'medium', 'resolved', '2026-09-10 10:00:00+00'),

  -- Project 3 issues
  (dmo3_1, 'Activity date filter misses reactivated customers', '47 customers reactivated after 3-year dormancy are excluded by the date filter. Business decision: include all reactivated customers.', 'medium', 'open', null),
  (dmo3_2, 'IBAN format changed for MX bank accounts', 'Mexico introduced 18-digit IBAN in 2025; legacy ECC stores old 10-digit format for 23 vendors. Transformation rule needed.', 'high', 'open', null);


-- ══════════════════════════════════════════════════════════════
-- 10. SIMPLIFICATION ITEMS
-- ══════════════════════════════════════════════════════════════

INSERT INTO simplification_items (migration_project_id, item_id, title, area,
  impact, description, affected_objects, remediation_notes, status)
VALUES
  -- Project 1 simplification items
  (mp1, 'SI-FI-001', 'New Asset Accounting (FI-AA) mandatory in S/4HANA', 'FI', 'mandatory_change',
   'Classic Asset Accounting (parallel depreciation via ANLC) replaced by New Asset Accounting. Parallel valuation now via leading/non-leading ledger.',
   'ANLA, ANLC, depreciation area config, APC balance reports',
   'Migrate to New AA: run RAALTD11 conversion program, verify depreciation ledger assignments.',
   'in_progress'),
  (mp1, 'SI-FI-002', 'Document Splitting replaces Profit Center substitution (FI-GL)', 'FI', 'mandatory_change',
   'Legacy FAGL_SPLINFO-based substitution no longer supported. Standard document splitting configuration required.',
   'Substitution rules, BSEG splitting logic, profit center derivation',
   'Configure document splitting in S/4; migrate custom derivation rules to Flexible Hierarchy.',
   'in_progress'),
  (mp1, 'SI-CO-001', 'Overhead Cost Controlling – CO-PA line item storage changed', 'FI', 'optional',
   'Costing-based CO-PA now reads from ACDOCA (Universal Journal) instead of CE1xxxx tables. Custom CO-PA reports need adaptation.',
   'CE1xxxx tables, custom KE30 reports, CO-PA assessment cycles',
   'Rewrite custom CO-PA reports using CDS views on ACDOCA. CE1xxxx tables retained as compatibility views.',
   'open'),
  (mp1, 'SI-MM-001', 'Material Ledger mandatory – Actual Costing alignment', 'MM', 'mandatory_change',
   'Material Ledger activation is mandatory in S/4HANA. If not previously active, actual cost determination changes.',
   'CKMLCR, CKMLPP, price variances, OBYC account assignments',
   'Activate ML in sandbox; run CKMVFM to validate existing standard prices. Finance alignment needed.',
   'resolved'),
  (mp1, 'SI-MM-002', 'MRP – Classic MRP replaced by MRP Live (optional)', 'MM', 'optional',
   'MRP Live uses HANA in-memory engine for instant MRP results. Classic MRP (MDBT) still supported but deprecated.',
   'MDBT, MRP controller config, exception messages',
   'Pilot MRP Live in sandbox for key plants. Decision: adopt for FG materials, keep classic for RM.',
   'open'),
  (mp1, 'SI-SD-001', 'Rebate Processing – Sales Rebates deprecated (SD-BF-RB)', 'MM', 'mandatory_change',
   'Classic SD rebates (condition type BO01-BO05) replaced by Settlement Management in S/4HANA 2020+.',
   'VBO1, rebate agreements, billing document conditions',
   'Migrate active rebate agreements to Settlement Management. Closed agreements remain read-only.',
   'open'),
  (mp1, 'SI-BASIS-001', 'SAP GUI transactions replaced by Fiori Apps', 'Basis', 'informational',
   '1,500+ ECC transactions have Fiori equivalents. Business users should adopt Fiori launchpad as primary UI.',
   'SU01 roles, SAP GUI shortcuts, training materials',
   'Conduct Fiori readiness workshop; update SAP roles for Fiori tiles; create user guides.',
   'resolved'),

  -- Project 2 simplification items (greenfield – mostly informational)
  (mp2, 'SI-FI-001', 'Universal Journal (ACDOCA) – single source of truth', 'FI', 'informational',
   'S/4HANA Cloud uses ACDOCA as the single ledger. FI, CO, ML, AA all post to one table. No separate CO reconciliation needed.',
   'BSEG, COEP, ANLA, CKMLCR – all replaced by ACDOCA views',
   'Native S/4 Cloud design; no migration action required. Train users on Fiori Finance apps.',
   'not_applicable'),
  (mp2, 'SI-SD-001', 'Credit Management – integration with FI-AR mandatory', 'MM', 'mandatory_change',
   'S/4HANA Cloud Credit Management requires FIN-FSCM-CR setup. Legacy SD credit check (F.28) not available.',
   'Credit control area config, KNKK table, FD32',
   'Configure FSCM Credit Management; define credit segments; migrate credit limits from FD32.',
   'resolved'),

  -- Project 3 simplification items
  (mp3, 'SI-FI-001', 'New Asset Accounting conversion required (selective transfer)', 'FI', 'mandatory_change',
   'Target S/4HANA 2022 uses New AA. Transferred asset master records must be converted using RAALTD11 equivalent for selective data.',
   'ANLA, depreciation areas, APC values transferred via SNP',
   'Run New AA activation on target BEFORE data load. Validate via AS03 after load.',
   'open'),
  (mp3, 'SI-MM-001', 'Inventory valuation – MAP vs Standard price alignment', 'MM', 'mandatory_change',
   'Materials transferred with Moving Average Price must be reviewed: S/4 ML activation changes variance handling.',
   'MBEW, CKMLCR, material price determination',
   'Confirm ML activation on target system. Review price variances for transferred materials in first period.',
   'open'),
  (mp3, 'SI-BASIS-001', 'Customizing transport requirements for selective transfer', 'Basis', 'mandatory_change',
   'All customizing (IMG settings) must be transported to target via TR before data load. Selective data does not carry config.',
   'Transport requests, IMG activities, number range objects',
   'TR analysis complete. 47 config TRs identified for import to target before data migration.',
   'in_progress');

END $$;
