import { BRAND_MARK } from "../lib/brand.js";
/** Small superscript ™ (or ®) after the brand name in logos. */
export function Tm() {
  return <sup style={{ fontSize: ".55em", verticalAlign: "super", lineHeight: 0, marginLeft: 1, fontWeight: 600 }}>{BRAND_MARK}</sup>;
}
