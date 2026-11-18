// ISO 3166-1 alpha-2 country codes. Names come from the browser (Intl.DisplayNames) in the
// user's language, so the list needs no translations; flags are built from the code.
export const COUNTRY_CODES = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI',
  'BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN',
  'CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK',
  'FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM',
  'HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN',
  'KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK',
  'ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP',
  'NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF',
  'TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI',
  'VN','VU','WF','WS','YE','YT','ZA','ZM','ZW',
];

const _names = new Map();
/** Country name in the given language ('en', 'es', …); falls back to the code. */
export function countryName(code, lang = 'en') {
  const c = String(code ?? '').toUpperCase();
  if (!c) return '';
  if (!_names.has(lang)) {
    try { _names.set(lang, new Intl.DisplayNames([lang], { type: 'region' })); } catch { _names.set(lang, null); }
  }
  try { return _names.get(lang)?.of(c) ?? c; } catch { return c; }
}

/** Flag emoji for a two-letter country code ('' when the code isn't valid). */
export function countryFlag(code) {
  const c = String(code ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

/** [{ code, name }] sorted by name in the given language. */
export function countryOptions(lang = 'en') {
  const coll = new Intl.Collator(lang);
  return COUNTRY_CODES.map(code => ({ code, name: countryName(code, lang) }))
    .sort((a, b) => coll.compare(a.name, b.name));
}

/** Best-effort code for a free-text country name saved before the list existed. */
export function codeForCountryName(name) {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return '';
  for (const lang of ['en', 'es']) {
    const hit = COUNTRY_CODES.find(c => countryName(c, lang).toLowerCase() === n);
    if (hit) return hit;
  }
  return '';
}
