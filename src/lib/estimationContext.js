// The estimation context of a case (see estimation.js): seniority, live SAP check, whether
// Arena can implement the SAP objects, the SAP MCP policy's object types and the factors.
import { supabase } from "./supabase.js";
import { estimationFactors, SENIORITY_LEVELS } from "./estimation.js";
import { PIPELINE_OBJECT_TYPE_DEFAULTS } from "./sapPipelineDefaults.js";

const ADT_TYPES = ['abap-adt', 'abap-adt-readonly', 'abap-adt-both'];
const DEFAULT_OBJECT_TYPES = PIPELINE_OBJECT_TYPE_DEFAULTS;

/** SAP environment of the case: the project's own first, then the customer's (or legacy client's). */
export function caseSapEnvironment(caseData, settings) {
  const all = settings?.sap_integration ?? {};
  const envsOf = (e) => (e?.environments ?? (e?.host ? [e] : []));
  const proj = caseData?.project_id ? envsOf(all[`proj_${caseData.project_id}`]) : [];
  const cust = envsOf(all[caseData?.customer_id ?? caseData?.client_id] ?? all[caseData?.client_id]);
  const envs = proj.length ? proj : cust;
  const pick = (settings?.sap_case_env ?? {})[caseData?.id] ?? (settings?.sap_project_env ?? {})[caseData?.project_id];
  return envs.find(e => e.id === pick) ?? envs[0] ?? null;
}

/** Live SAP check for the case: case override → environment → project → customer → global. */
export function caseLiveCheckOn(caseData, settings, env) {
  const caseVal = (settings?.case_sap_live_check ?? {})[caseData?.id];
  if (caseVal === true || caseVal === false) return caseVal;
  if (env?.liveCheckOnGenerate === true || env?.liveCheckOnGenerate === false) return env.liveCheckOnGenerate;
  const proj = (settings?.sap_project_live_check ?? {})[caseData?.project_id];
  if (proj === true || proj === false) return proj;
  const cli = (settings?.sap_client_live_check ?? {})[caseData?.client_id];
  if (cli === true || cli === false) return cli;
  return (settings?.generation_context ?? {}).sap_live_check === true;
}

/** Seniority used for the estimate: the assigned consultant's, else the case's expected one, else
 *  estimation_factors.default_seniority (default mid). */
export async function caseSeniority(caseData, settings) {
  const assigned = caseData?.case_assignments?.[0]?.consultant_id ?? caseData?.case_assignments?.[0]?.users?.id ?? null;
  if (assigned) {
    try {
      const { data } = await supabase.from('consultant_profiles').select('expertise_level').eq('id', assigned).maybeSingle();
      if (SENIORITY_LEVELS.includes(data?.expertise_level)) return { seniority: data.expertise_level, source: 'consultant' };
    } catch { /* fall through */ }
  }
  if (SENIORITY_LEVELS.includes(caseData?.expected_seniority)) return { seniority: caseData.expected_seniority, source: 'case' };
  return { seniority: estimationFactors(settings).default_seniority, source: 'default' };
}

export async function caseEstimationContext(caseData, settings, { isStaff = false } = {}) {
  const env = caseSapEnvironment(caseData, settings);
  const liveCheck = caseLiveCheckOn(caseData, settings, env);
  let planAllows = true;
  if (caseData?.partner_id && !isStaff) {
    try {
      const { data } = await supabase.rpc('partner_limits', { p: caseData.partner_id });
      planAllows = data?.sapImplementation === true;
    } catch { planAllows = false; }
  }
  const arenaAvailable = !!env && ADT_TYPES.includes(env.mcp_type) && liveCheck && planAllows;
  const policyTypes = { ...DEFAULT_OBJECT_TYPES, ...((settings?.mcp_adt_pipeline_policy ?? {}).object_types ?? {}) };
  const { seniority, source } = await caseSeniority(caseData, settings);
  return { env, liveCheck, planAllows, arenaAvailable, policyTypes, seniority, senioritySource: source, factors: estimationFactors(settings) };
}
