import { useState } from "react";

const ORB_COLORS = ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0EA5E9','#F97316','#EF4444'];

// Always write both keyframes so adding galaxy-radar-pulse doesn't get skipped
// by a stale style element that was injected before this keyframe existed
if (typeof document !== 'undefined') {
  let _kf = document.getElementById('galaxy-orbit-kf');
  if (!_kf) { _kf = document.createElement('style'); _kf.id = 'galaxy-orbit-kf'; document.head.appendChild(_kf); }
  _kf.textContent = `
@keyframes galaxy-orbit {
  from { transform: rotate(var(--start)) translateX(var(--r)) rotate(calc(-1 * var(--start))); }
  to   { transform: rotate(calc(var(--start) + 360deg)) translateX(var(--r)) rotate(calc(-1 * (var(--start) + 360deg))); }
}
@keyframes galaxy-radar-pulse {
  0%   { transform: scale(0.04); opacity: 0.75; }
  60%  { opacity: 0.35; }
  100% { transform: scale(1);    opacity: 0; }
}`;
}

function OrbNode({ r, slotIdx, total, dur = 14, size = 40, onClick, highlight, children, caseCount }) {
  const startDeg = (slotIdx / Math.max(total, 1)) * 360;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', width: 0, height: 0,
      animation: `galaxy-orbit ${dur}s linear infinite`,
      '--start': `${startDeg}deg`, '--r': `${r}px`, zIndex: 2,
    }}>
      <div style={{ position: 'absolute', width: size, height: size, margin: -size / 2 }}>
        <div onClick={onClick} style={{
          width: size, height: size, borderRadius: '50%',
          border: highlight ? '2.5px solid #2563EB' : '2px solid rgba(255,255,255,0.55)',
          boxShadow: highlight ? '0 0 14px rgba(37,99,235,0.5)' : '0 2px 8px rgba(0,0,0,0.18)',
          overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff',
          transition: 'border-color .2s, box-shadow .2s',
        }}>
          {children}
        </div>
        {caseCount != null && caseCount > 0 && (
          <div style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 14, height: 14, borderRadius: 99,
            background: caseCount >= 5 ? '#EF4444' : caseCount >= 3 ? '#F59E0B' : '#10B981',
            border: '1.5px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 800, color: '#fff', lineHeight: 1,
            padding: '0 2px', fontFamily: 'system-ui,sans-serif',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}>
            {caseCount}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarCircle({ src, name, size = 36, color = '#2563EB', fontSize = 13 }) {
  const initials = (name ?? '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return src
    ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <div style={{ width: '100%', height: '100%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 700, color: '#fff', fontFamily: "'Barlow Condensed',sans-serif" }}>{initials}</div>;
}

function CenterAvatar({ client, companyName, onClick, size = 58 }) {
  return (
    <div onClick={onClick} style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      width: size, height: size, borderRadius: '50%',
      border: '2px solid rgba(37,99,235,0.3)',
      boxShadow: '0 0 20px rgba(37,99,235,0.2)',
      overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      zIndex: 10, background: '#fff',
    }}>
      <AvatarCircle src={client?.avatar_url} name={companyName} size={size} color="#2563EB" fontSize={Math.round(size * 0.3)} />
    </div>
  );
}

function StatTile({ value, label }) {
  return (
    <div style={{ flex: 1, background: 'rgba(37,99,235,0.06)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: '#1A4B8C' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B8AB8' }}>{label}</div>
    </div>
  );
}

function Chip({ children, color = '#1A4B8C', bg = 'rgba(26,75,140,0.07)', border = 'rgba(26,75,140,0.2)' }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: bg, border: `1px solid ${border}`, color }}>
      {children}
    </span>
  );
}

export function GalaxyExplorer({ openCases, applications, auth, onApply, appliedCaseIds, platformLogoUrl, consultantCaseCounts = {} }) {
  const [level, setLevel]             = useState(1);
  const [selCustomer, setSelCustomer] = useState(null);
  const [selCase, setSelCase]         = useState(null);
  const [fading, setFading]           = useState(false);

  // Group open cases by customer
  const customerMap = {};
  openCases.forEach(c => {
    const cid = c.client_id;
    if (!customerMap[cid]) {
      customerMap[cid] = {
        id: cid,
        client: c.client,
        cases: [],
        companyName: c.client?.client_profiles?.company_name || c.client?.full_name || 'Client',
      };
    }
    customerMap[cid].cases.push(c);
  });
  const customers = Object.values(customerMap);

  const SYS = 540;
  const R1  = Math.round(SYS * 0.20);
  const R2  = Math.round(SYS * 0.32);
  const R3  = Math.round(SYS * 0.44);
  const R4  = Math.round(SYS * 0.56);

  function navigate(nextLevel, cust = null, cs = null) {
    setFading(true);
    setTimeout(() => {
      setLevel(nextLevel);
      setSelCustomer(cust);
      setSelCase(cs);
      setFading(false);
    }, 160);
  }

  // ── SOLAR SYSTEM ──────────────────────────────────────────
  function renderSystem() {
    // Always render all 4 decorative rings
    const allRings = () => [R1, R2, R3, R4].map(r => (
      <div key={r} style={{ position: 'absolute', borderRadius: '50%', border: `1px dashed rgba(140,140,140,${r === R1 ? '0.35' : r === R2 ? '0.28' : r === R3 ? '0.22' : '0.16'})`, top: '50%', left: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)' }} />
    ));

    // 3 staggered radar waves — centered via margin so they're safe even if keyframe isn't found
    // opacity:0 default means a missing keyframe renders nothing instead of a static ring
    const radarWaves = () => [0, 1.5, 3.0].map(delay => (
      <div key={`rw-${delay}`} style={{
        position: 'absolute', top: '50%', left: '50%',
        width: R3 * 2, height: R3 * 2,
        marginLeft: -R3, marginTop: -R3,
        borderRadius: '50%',
        border: '1.5px solid rgba(37,99,235,0.55)',
        pointerEvents: 'none',
        opacity: 0,
        animation: `galaxy-radar-pulse 3.8s ease-out infinite`,
        animationDelay: `${delay}s`,
        zIndex: 1,
      }} />
    ));

    if (level === 1) {
      return (
        <div style={{ position: 'relative', width: SYS, height: SYS, flexShrink: 0 }}>
          {allRings()}
          {radarWaves()}
          {/* Center: Platform logo */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 80, height: 80, borderRadius: '50%', background: platformLogoUrl ? '#fff' : 'linear-gradient(135deg,#1A4B8C,#2563EB)', border: '3px solid rgba(37,99,235,0.2)', boxShadow: '0 0 24px rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, overflow: 'hidden' }}>
            {platformLogoUrl
              ? <img src={platformLogoUrl} alt="Platform" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
              : <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>A</span>
            }
          </div>
          {/* Distribute customers across R2/R3/R4 */}
          {customers.map((cust, i) => {
            const rings = customers.length <= 4 ? [R2] : customers.length <= 8 ? [R2, R3] : [R2, R3, R4];
            const ringIdx = i % rings.length;
            const r = rings[ringIdx];
            const groupTotal = Math.ceil(customers.length / rings.length);
            const slotIdx = Math.floor(i / rings.length);
            const dur = r === R2 ? 22 : r === R3 ? 30 : 38;
            return (
              <OrbNode key={cust.id} r={r} slotIdx={slotIdx} total={groupTotal} dur={dur} size={60}
                onClick={() => navigate(2, cust)} caseCount={cust.cases.length}>
                <AvatarCircle src={cust.client?.avatar_url} name={cust.companyName} color={ORB_COLORS[i % ORB_COLORS.length]} fontSize={17} />
              </OrbNode>
            );
          })}
        </div>
      );
    }

    if (level === 2) {
      const custCases = selCustomer?.cases ?? [];
      const r1cases = custCases.slice(0, 3);
      const r2cases = custCases.slice(3, 7);
      const r3cases = custCases.slice(7, 10);
      return (
        <div style={{ position: 'relative', width: SYS, height: SYS, flexShrink: 0 }}>
          {allRings()}
          {radarWaves()}
          <CenterAvatar client={selCustomer?.client} companyName={selCustomer?.companyName} onClick={() => navigate(1)} size={80} />
          {r1cases.map((cs, i) => (
            <OrbNode key={cs.id} r={R2} slotIdx={i} total={r1cases.length} dur={14} size={54}
              onClick={() => navigate(3, selCustomer, cs)} highlight={selCase?.id === cs.id}
              caseCount={cs.applications?.length ?? 0}>
              <CaseNode c={cs} idx={i} />
            </OrbNode>
          ))}
          {r2cases.map((cs, i) => (
            <OrbNode key={cs.id} r={R3} slotIdx={i} total={r2cases.length} dur={22} size={50}
              onClick={() => navigate(3, selCustomer, cs)} highlight={selCase?.id === cs.id}
              caseCount={cs.applications?.length ?? 0}>
              <CaseNode c={cs} idx={r1cases.length + i} />
            </OrbNode>
          ))}
          {r3cases.map((cs, i) => (
            <OrbNode key={cs.id} r={R4} slotIdx={i} total={r3cases.length} dur={32} size={46}
              onClick={() => navigate(3, selCustomer, cs)} highlight={selCase?.id === cs.id}
              caseCount={cs.applications?.length ?? 0}>
              <CaseNode c={cs} idx={r1cases.length + r2cases.length + i} />
            </OrbNode>
          ))}
        </div>
      );
    }

    if (level === 3) {
      const caseApps = selCase?.applications ?? [];
      const myApp    = caseApps.find(a => a.consultant_id === auth.user?.id);
      const others   = caseApps.filter(a => a.consultant_id !== auth.user?.id);
      const r1apps   = others.slice(0, 3);
      const r2apps   = others.slice(3, 7);
      const r3apps   = others.slice(7, 11);
      const r1Total  = r1apps.length + (myApp ? 1 : 0);
      return (
        <div style={{ position: 'relative', width: SYS, height: SYS, flexShrink: 0 }}>
          {allRings()}
          {radarWaves()}
          <CenterAvatar client={selCustomer?.client} companyName={selCustomer?.companyName} onClick={() => navigate(2, selCustomer)} size={80} />
          {r1apps.map((app, i) => (
            <OrbNode key={app.consultant_id} r={R2} slotIdx={i} total={r1Total} dur={10} size={46} caseCount={consultantCaseCounts[app.consultant_id] ?? 0}>
              <AvatarCircle src={app.consultant?.avatar_url} name={app.consultant?.full_name ?? 'C'} color={ORB_COLORS[i % ORB_COLORS.length]} fontSize={13} />
            </OrbNode>
          ))}
          {myApp && (
            <OrbNode r={R2} slotIdx={r1apps.length} total={r1Total} dur={10} size={46} highlight caseCount={consultantCaseCounts[auth.user?.id] ?? 0}>
              <div style={{ width: '100%', height: '100%', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>You</div>
            </OrbNode>
          )}
          {r2apps.map((app, i) => (
            <OrbNode key={app.consultant_id} r={R3} slotIdx={i} total={r2apps.length} dur={17} size={42} caseCount={consultantCaseCounts[app.consultant_id] ?? 0}>
              <AvatarCircle src={app.consultant?.avatar_url} name={app.consultant?.full_name ?? 'C'} color={ORB_COLORS[(r1apps.length + i) % ORB_COLORS.length]} fontSize={12} />
            </OrbNode>
          ))}
          {r3apps.map((app, i) => (
            <OrbNode key={app.consultant_id} r={R4} slotIdx={i} total={r3apps.length} dur={26} size={38} caseCount={consultantCaseCounts[app.consultant_id] ?? 0}>
              <AvatarCircle src={app.consultant?.avatar_url} name={app.consultant?.full_name ?? 'C'} color={ORB_COLORS[(r1apps.length + r2apps.length + i) % ORB_COLORS.length]} fontSize={11} />
            </OrbNode>
          ))}
          {caseApps.length === 0 && (
            <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: '#6B8AB8', whiteSpace: 'nowrap' }}>
              No applicants yet — be first
            </div>
          )}
        </div>
      );
    }
  }

  // ── SIDEBAR ────────────────────────────────────────────────
  function renderSidebar() {
    if (level === 1) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 4px' }}>
          <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 700, color: '#1A4B8C', marginBottom: 4 }}>
              {customers.length} {customers.length === 1 ? 'Customer' : 'Customers'} · {openCases.length} Open
            </div>
            <div style={{ fontSize: 12, color: '#6B8AB8' }}>Click a customer to explore their cases</div>
          </div>
          {customers.map((cust, i) => (
            <div key={cust.id} onClick={() => navigate(2, cust)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(26,75,140,0.04)', border: '1px solid rgba(26,75,140,0.1)', borderRadius: 10, cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: ORB_COLORS[i % ORB_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                {cust.client?.avatar_url ? <img src={cust.client.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cust.companyName.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A4B8C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.companyName}</div>
                <div style={{ fontSize: 10, color: '#6B8AB8' }}>{cust.cases.length} case{cust.cases.length !== 1 ? 's' : ''}</div>
              </div>
              <span style={{ fontSize: 16, color: 'rgba(26,75,140,0.3)' }}>›</span>
            </div>
          ))}
        </div>
      );
    }

    if (level === 2) {
      const cust = selCustomer;
      const sapAreas    = [...new Set(cust.cases.map(c => c.area_sap).filter(Boolean))];
      const industries  = [...new Set(cust.cases.map(c => c.area_industry).filter(Boolean))];
      const totalBudget = cust.cases.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
      const allSkills   = [...new Set(cust.cases.flatMap(c => c.skills_required ?? []))];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 4px' }}>
          {/* Customer card */}
          <div style={{ background: 'rgba(26,75,140,0.04)', border: '1px solid rgba(26,75,140,0.12)', borderRadius: 14, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', border: '2px solid rgba(37,99,235,0.3)' }}>
                {cust.client?.avatar_url ? <img src={cust.client.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cust.companyName.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 17, fontWeight: 700, color: '#1A4B8C', lineHeight: 1.1 }}>{cust.companyName}</div>
                {cust.client?.full_name && cust.client.full_name !== cust.companyName && (
                  <div style={{ fontSize: 11, color: '#4A6B9A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.client.full_name}</div>
                )}
                {cust.client?.email && <div style={{ fontSize: 10, color: '#6B8AB8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.client.email}</div>}
              </div>
            </div>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <StatTile value={cust.cases.length} label="Open Cases" />
              <StatTile value={cust.cases.filter(c => appliedCaseIds.has(c.id)).length} label="Applied" />
              {totalBudget > 0 && <StatTile value={`$${(totalBudget / 1000).toFixed(0)}k`} label="Tot. Budget" />}
            </div>
            {/* Industries */}
            {industries.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B8AB8', marginBottom: 4 }}>Industry</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {industries.map(ind => <Chip key={ind} color="#0369A1" bg="rgba(3,105,161,0.07)" border="rgba(3,105,161,0.22)">{ind}</Chip>)}
                </div>
              </div>
            )}
            {/* SAP Areas */}
            {sapAreas.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B8AB8', marginBottom: 4 }}>SAP Areas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sapAreas.map(s => <Chip key={s} color="#0066CC" bg="rgba(0,102,204,0.07)" border="rgba(0,102,204,0.22)">{s}</Chip>)}
                </div>
              </div>
            )}
            {/* Skills union */}
            {allSkills.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B8AB8', marginBottom: 4 }}>Skills Needed</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {allSkills.slice(0, 8).map(sk => (
                    <span key={sk} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)', color: '#1A4B8C' }}>{sk}</span>
                  ))}
                  {allSkills.length > 8 && <span style={{ fontSize: 10, color: '#6B8AB8' }}>+{allSkills.length - 8}</span>}
                </div>
              </div>
            )}
          </div>
          {/* Cases list */}
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B8AB8', paddingLeft: 2 }}>Cases — click to drill in</div>
          {cust.cases.map((cs, i) => {
            const applied = appliedCaseIds.has(cs.id);
            return (
              <div key={cs.id} onClick={() => navigate(3, cust, cs)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'rgba(26,75,140,0.04)', border: `1px solid ${applied ? 'rgba(5,150,105,0.3)' : 'rgba(26,75,140,0.1)'}`, borderRadius: 10, cursor: 'pointer' }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: ORB_COLORS[i % ORB_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1A4B8C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs.title}</div>
                  <div style={{ fontSize: 10, color: applied ? '#059669' : '#6B8AB8' }}>
                    {cs.applications?.length ?? 0} applied{applied ? ' · ✓ You applied' : ''}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: 'rgba(26,75,140,0.3)', flexShrink: 0 }}>›</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (level === 3) {
      const cs     = selCase;
      const cust   = selCustomer;
      const applied = appliedCaseIds.has(cs.id)
        || (cs.applications ?? []).some(a => a.consultant_id === auth.user?.id);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 4px' }}>
          {/* Customer mini-card */}
          <div style={{ background: 'rgba(26,75,140,0.04)', border: '1px solid rgba(26,75,140,0.1)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {cust.client?.avatar_url ? <img src={cust.client.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cust.companyName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A4B8C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.companyName}</div>
              {cust.client?.email && <div style={{ fontSize: 10, color: '#6B8AB8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.client.email}</div>}
            </div>
          </div>
          {/* Case detail card */}
          <div style={{ background: 'rgba(26,75,140,0.04)', border: '1px solid rgba(26,75,140,0.18)', borderRadius: 14, padding: '14px', flex: 1 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 19, fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginBottom: 6 }}>{cs.title}</div>
            {cs.description && <div style={{ fontSize: 11, color: '#4A6B9A', lineHeight: 1.5, marginBottom: 10 }}>{cs.description.slice(0, 140)}{cs.description.length > 140 ? '…' : ''}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {cs.budget        && <Chip color="#059669" bg="rgba(5,150,105,0.08)" border="rgba(5,150,105,0.25)">${Number(cs.budget).toLocaleString()}</Chip>}
              {cs.area_sap      && <Chip color="#0066CC" bg="rgba(0,102,204,0.07)" border="rgba(0,102,204,0.22)">{cs.area_sap}</Chip>}
              {cs.area_industry && <Chip color="#0369A1" bg="rgba(3,105,161,0.07)" border="rgba(3,105,161,0.22)">{cs.area_industry}</Chip>}
            </div>
            {(cs.skills_required?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B8AB8', marginBottom: 4 }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {cs.skills_required.slice(0, 5).map(sk => (
                    <span key={sk} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)', color: '#1A4B8C' }}>{sk}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              {(() => {
                const m = cs.application_mode;
                const [color, bg, border, label] =
                  m === 'team'       ? ['#4F46E5','rgba(79,70,229,0.08)','rgba(79,70,229,0.25)','👥 Teams only']
                  : m === 'individual' ? ['#475569','rgba(71,85,105,0.08)','rgba(71,85,105,0.2)','🧑 Individual only']
                  :                      ['#059669','rgba(5,150,105,0.08)','rgba(5,150,105,0.25)','👥 Teams & Individual'];
                return (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, border: `1px solid ${border}`, color, background: bg }}>
                    {label}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <StatTile value={cs.applications?.length ?? 0} label="Applied" />
              {!!cs.time_commitment && <StatTile value={`${cs.time_commitment}%`} label="Commit" />}
            </div>
            {auth.isConsultant && (
              applied
                ? <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 10, color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Application submitted</div>
                : <button onClick={() => onApply(cs)} style={{ width: '100%', background: 'linear-gradient(135deg,#1A4B8C,#2563EB)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, padding: '11px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}>
                    Apply to this case →
                  </button>
            )}
          </div>
        </div>
      );
    }
  }

  const breadcrumbs = [
    { label: 'Overview', onClick: () => navigate(1) },
    { label: selCustomer?.companyName ?? null, onClick: () => level >= 2 && navigate(2, selCustomer) },
    { label: selCase?.title ? (selCase.title.length > 22 ? selCase.title.slice(0, 22) + '…' : selCase.title) : null, onClick: null },
  ];

  return (
    <div style={{ background: '#ffffff', borderRadius: 20, border: '1.5px solid rgba(26,75,140,0.15)', overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 24px rgba(37,99,235,0.08)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: 560 }}>
      {/* Header bar */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(26,75,140,0.1)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(26,75,140,0.04)', flexShrink: 0 }}>
        {level > 1 && (
          <button onClick={() => level === 2 ? navigate(1) : navigate(2, selCustomer)}
            style={{ background: 'rgba(26,75,140,0.08)', border: '1px solid rgba(26,75,140,0.18)', borderRadius: 7, color: '#1A4B8C', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}>
            ‹ Back
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, overflow: 'hidden' }}>
          {breadcrumbs.map((bc, i) => bc.label && (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              {i > 0 && <span style={{ fontSize: 10, color: 'rgba(26,75,140,0.3)', flexShrink: 0 }}>›</span>}
              <span onClick={bc.onClick ?? undefined}
                style={{ fontSize: 11, fontWeight: i + 1 === level ? 700 : 500, color: i + 1 === level ? '#1A4B8C' : 'rgba(26,75,140,0.45)', cursor: bc.onClick && i + 1 < level ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {bc.label}
              </span>
            </span>
          ))}
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6B8AB8', flexShrink: 0 }}>
          {level === 1 ? 'Galaxy View' : level === 2 ? 'Customer' : 'Case Detail'}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Solar system — left, large panel */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', opacity: fading ? 0 : 1, transition: 'opacity .16s', position: 'relative' }}>
          {renderSystem()}
        </div>
        {/* Sidebar — right, fixed-width panel */}
        <div style={{ width: 320, flexShrink: 0, minWidth: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', overflowY: 'auto', borderLeft: '1px solid rgba(26,75,140,0.1)', opacity: fading ? 0 : 1, transition: 'opacity .16s' }}>
          {renderSidebar()}
        </div>
      </div>
    </div>
  );
}

function CaseNode({ c, idx }) {
  const abbr = (c.title ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || `C${idx + 1}`;
  return (
    <div style={{ width: '100%', height: '100%', background: ORB_COLORS[idx % ORB_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', fontFamily: "'Barlow Condensed',sans-serif" }}>
      {abbr}
    </div>
  );
}
