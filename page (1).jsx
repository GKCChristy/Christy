'use client';

// ============================================================
// app/page.jsx
// Christy Dashboard — Cura Community Connections
// Brand: Burgundy #7B2442 | Royal Blue #1A4DBF
// Claude-in-Claude: Haiku powers the Ask Christy insights panel
// ============================================================

import { useState, useEffect, useRef } from 'react';

const B = '#7B2442';      // burgundy
const BL = '#F5E8ED';     // burgundy light
const R = '#1A4DBF';      // royal blue
const RL = '#E6EDFB';     // royal light
const HAIKU = 'claude-haiku-4-5-20251001';

const LEVEL_CONFIG = {
  '7_day':       { label: '7-day flag',    bg: '#FFF0E8', color: '#A34800' },
  '30_day':      { label: '30-day flag',   bg: BL,        color: B         },
  'monitor_only':{ label: 'Monitored',     bg: '#EAF3DE', color: '#3B6D11' }
};

const REASON_LABELS = {
  no_device_data:   'No device data',
  unanswered_calls: 'Calls unanswered',
  both:             'Device + calls'
};

export default function ChristyDashboard() {
  const [metrics, setMetrics]       = useState(null);
  const [flags, setFlags]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [chatInput, setChatInput]   = useState('');
  const [messages, setMessages]     = useState([
    { role: 'assistant', content: 'Hello. I\'m Christy. Ask me about today\'s patient engagement gaps.' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function fetchData() {
    try {
      const [mRes, fRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/flags')
      ]);
      setMetrics(await mRes.json());
      const fData = await fRes.json();
      setFlags(fData.flags ?? []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function askChristy() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    setChatInput('');
    const updated = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:       updated.map(m => ({ role: m.role, content: m.content })),
          metricsContext: metrics,
          flagsContext:   flags.slice(0, 10)
        })
      });
      const data = await res.json();
      const reply = data.reply ?? 'Unable to process. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askChristy(); }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top nav */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #E8E6E1',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem', height: 60
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: B,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: 1
          }}>CHR</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#1a1a1a' }}>Christy</div>
            <div style={{ fontSize: 11, color: '#888' }}>Cura Community Connections · CCM/RPM Gap Agent</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill label="SOC 2 aligned" bg={BL} color={B} />
          <Pill label="HIPAA aligned" bg={RL} color={R} />
          <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>Daily · 9:00 AM CT</span>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Date + run status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
              Patient Engagement Gaps
            </h1>
            <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>{today}</p>
          </div>
          {metrics?.lastRun && (
            <div style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>
              <div>Last run: {new Date(metrics.lastRun.started_at).toLocaleTimeString()}</div>
              <div style={{ color: metrics.lastRun.status === 'completed' ? '#3B6D11' : B, fontWeight: 600 }}>
                {metrics.lastRun.status}
              </div>
            </div>
          )}
        </div>

        {/* Metrics strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
          <MetricCard label="Total active patients" value={metrics?.totalPatients} sub="enrolled in CCM/RPM" loading={loading} />
          <MetricCard label="7-day flags"  value={metrics?.flags7d}  sub="recent silence"      loading={loading} accent={B} />
          <MetricCard label="30-day flags" value={metrics?.flags30d} sub="persistent drop-off" loading={loading} accent={B} />
          <MetricCard label="Monitored"    value={metrics?.monitored} sub="week 1 — no flag"   loading={loading} accent={R} />
          <MetricCard label="Alerts sent"  value={metrics?.alertsSent} sub="to care managers"  loading={loading} />
        </div>

        {/* Two-column layout: flags table + chat */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>

          {/* Flags table */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E6E1', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E8E6E1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>Today's flags</span>
              <span style={{ fontSize: 12, color: '#999' }}>{flags.length} patients</span>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: 14 }}>Loading…</div>
            ) : flags.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: 14 }}>No flags for today.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8F7F5' }}>
                    {['Patient', 'Enrolled', 'Program', 'Flag', 'Reason', 'Priority'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: '#888', fontWeight: 600, borderBottom: '1px solid #E8E6E1' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f, i) => {
                    const p = f.patients;
                    const lvl = LEVEL_CONFIG[f.flag_level];
                    const enrolled = Math.floor((Date.now() - new Date(p?.enrollment_date)) / 86400000);
                    return (
                      <tr key={f.id} style={{ borderBottom: i < flags.length - 1 ? '1px solid #F0EEE9' : 'none' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{p?.first_name} {p?.last_name}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{p?.cciq_patient_id}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#666' }}>Day {enrolled}</td>
                        <td style={{ padding: '10px 14px', color: '#666' }}>{p?.program_type}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <Pill label={lvl?.label} bg={lvl?.bg} color={lvl?.color} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Pill label={REASON_LABELS[f.reason] ?? '—'} bg="#F0EEE9" color="#666" />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: f.priority <= 2 ? B : f.priority === 3 ? '#E28000' : '#ccc',
                            color: '#fff', fontSize: 11, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>{f.priority}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Ask Christy — Claude-in-Claude Haiku chat */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E6E1', display: 'flex', flexDirection: 'column', height: 520 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E8E6E1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B6D11' }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>Ask Christy</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>Powered by Haiku</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                    background: m.role === 'user' ? R : '#F8F7F5',
                    color: m.role === 'user' ? '#fff' : '#1a1a1a',
                    borderBottomRightRadius: m.role === 'user' ? 2 : 10,
                    borderBottomLeftRadius: m.role === 'assistant' ? 2 : 10
                  }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', gap: 4, padding: '4px 12px' }}>
                  {[0,1,2].map(n => <div key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: `pulse 1s ${n * 0.2}s infinite` }} />)}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid #E8E6E1', display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Who has the highest priority today?"
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid #E8E6E1', outline: 'none', color: '#1a1a1a'
                }}
              />
              <button
                onClick={askChristy}
                disabled={!chatInput.trim() || chatLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: chatInput.trim() && !chatLoading ? B : '#E8E6E1',
                  color: chatInput.trim() && !chatLoading ? '#fff' : '#aaa',
                  cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.15s'
                }}
              >Send</button>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ label, value, sub, loading, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8E6E1', padding: '1rem' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: loading ? '#E8E6E1' : (accent ?? '#1a1a1a') }}>
        {loading ? '—' : (value ?? 0)}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function Pill({ label, bg, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: bg, color
    }}>{label}</span>
  );
}
