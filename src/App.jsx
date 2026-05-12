import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Flame, Lock, Plus, Trash2, Edit2, Check, X, Crown, Search, Eye, EyeOff } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// ============ CONFIG ============
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
const FIRESTORE_DOC_PATH = ['leagues', 'survivor50'];

const TEAMS = [
  { player: 'Lisa', contestants: ['Kamilla Karthigesu', 'Chrissy Hofbeck', 'Mike White', 'Colby Donaldson'], captain: 'Colby Donaldson' },
  { player: 'Dave', contestants: ['Angelina Keeley', 'Coach Wade', 'Christian Hubicki', 'Stephenie LaGrossa Kendrick'], captain: 'Stephenie LaGrossa Kendrick' },
  { player: 'Bryan', contestants: ['Rick Devens', 'Emily Flippen', 'Genevieve Mushaluk', 'Joseph Hunter'], captain: 'Joseph Hunter' },
  { player: 'Ben', contestants: ['Ozzy Lusth', 'Jonathan Young', 'Cirie Fields', 'Dee Valladares'], captain: 'Dee Valladares' },
  { player: 'Meg', contestants: ['Savannah Louie', 'Tiffany Ervin', 'Aubry Bracco', 'Kyle Fraser'], captain: 'Kyle Fraser' },
  { player: 'Abby', contestants: ['Charlie Davis', 'Q Burdette', 'Jenna Lewis-Dougherty', 'Rizo Velovic'], captain: 'Rizo Velovic' },
];

const ALL_CONTESTANTS = TEAMS.flatMap(t => t.contestants);

const EVENT_TYPES = [
  { id: 'survived', label: 'Survived episode', preMerge: 1, postMerge: 2, captainBonus: 0 },
  { id: 'challenge', label: 'Won individual challenge', preMerge: 1, postMerge: 2, captainBonus: 2 },
  { id: 'idolFound', label: 'Found an idol', preMerge: 1, postMerge: 1, captainBonus: 1 },
  { id: 'idolCorrect', label: 'Played idol correctly', preMerge: 2, postMerge: 2, captainBonus: 0 },
  { id: 'idolMisplay', label: 'Misplayed an idol', preMerge: -1, postMerge: -1, captainBonus: 0 },
  { id: 'jury', label: 'Sent to jury', preMerge: 0, postMerge: 2, captainBonus: 0 },
  { id: 'votedOutCaptain', label: 'Captain voted out', preMerge: -3, postMerge: -3, captainBonus: 0, captainOnly: true },
];

const ENDGAME_PLACEMENTS = [
  { id: 'sole', label: 'Sole Survivor', points: 10 },
  { id: 'runnerup', label: 'Runner-up', points: 7 },
  { id: 'third', label: '3rd place', points: 5 },
  { id: 'fourth', label: '4th place', points: 3 },
];

const TESTIMONIALS = [
  {
    quote: "Wow!! I am so impressed with this new app!!! Over the top user friendly, and high quality data!",
    author: "Lisa",
  },
  {
    quote: "Cool.",
    author: "Abby",
  },
  {
    quote: "[this app] is really awesome. Does something like this exist or could you start selling these?",
    author: "Meghan",
  },
  // Add more testimonials here as they come in:
  // { quote: "...", author: "..." },
];

const EMPTY_STATE = {
  episodes: [],
  eliminated: {},
  endgame: {},
  mergeEpisode: null,
};

// ============ FIRESTORE HELPERS ============
function subscribeToState(callback) {
  const ref = doc(db, ...FIRESTORE_DOC_PATH);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback(EMPTY_STATE);
    }
  }, (error) => {
    console.error('Firestore subscribe error:', error);
  });
}

async function saveState(state) {
  try {
    const ref = doc(db, ...FIRESTORE_DOC_PATH);
    await setDoc(ref, state);
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

// ============ SCORING ============
function calculateScores(state) {
  const contestantScores = {};
  ALL_CONTESTANTS.forEach(c => { contestantScores[c] = { total: 0, breakdown: [] }; });

  const sortedEpisodes = [...(state.episodes || [])].sort((a, b) => a.number - b.number);

  sortedEpisodes.forEach(ep => {
    const isPostMerge = state.mergeEpisode !== null && state.mergeEpisode !== undefined && ep.number >= state.mergeEpisode;
    Object.entries(ep.events || {}).forEach(([contestant, events]) => {
      if (!contestantScores[contestant]) return;
      events.forEach(eventId => {
        const evType = EVENT_TYPES.find(e => e.id === eventId);
        if (!evType) return;
        const isCaptain = TEAMS.some(t => t.captain === contestant);
        const basePts = isPostMerge ? evType.postMerge : evType.preMerge;
        const captainPts = isCaptain ? evType.captainBonus : 0;
        const total = basePts + captainPts;
        if (total !== 0) {
          contestantScores[contestant].total += total;
          contestantScores[contestant].breakdown.push({
            episode: ep.number,
            event: evType.label,
            points: total,
            captainBonus: captainPts > 0,
          });
        }
      });
    });
  });

  Object.entries(state.endgame || {}).forEach(([placeId, contestant]) => {
    if (!contestant || !contestantScores[contestant]) return;
    const place = ENDGAME_PLACEMENTS.find(p => p.id === placeId);
    if (!place) return;
    contestantScores[contestant].total += place.points;
    contestantScores[contestant].breakdown.push({
      episode: 'Finale',
      event: place.label,
      points: place.points,
      captainBonus: false,
    });
  });

  const teamScores = TEAMS.map(team => {
    const contestantData = team.contestants.map(c => ({
      name: c,
      score: contestantScores[c].total,
      breakdown: contestantScores[c].breakdown,
      eliminated: state.eliminated && state.eliminated[c] !== undefined,
      eliminatedEp: state.eliminated && state.eliminated[c],
      isCaptain: team.captain === c,
    }));
    return {
      ...team,
      total: contestantData.reduce((sum, c) => sum + c.score, 0),
      contestantData,
    };
  });

  return { teamScores, contestantScores };
}

// ============ COLORS / FONTS ============
const colors = {
  sand: '#F4EDD8',
  sandDark: '#E8DDB8',
  ocean: '#1B4D52',
  oceanLight: '#2A6E75',
  palm: '#3D6B3F',
  sunset: '#C8542E',
  sunsetDark: '#A03F1F',
  ember: '#E08A3C',
  ink: '#1A2521',
  bone: '#FAF6E8',
  ash: '#7A7466',
};

const fonts = {
  display: '"Frank Ruhl Libre", Georgia, serif',
  body: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", monospace',
};

// ============ APP ============
function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState('public');
  const [adminAuth, setAdminAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spoilerAck, setSpoilerAck] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToState((data) => {
      setState(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function updateState(updater) {
    const newState = typeof updater === 'function' ? updater(state) : updater;
    setState(newState);
    await saveState(newState);
  }

  if (loading || !state) {
    return (
      <div style={{ minHeight: '100vh', background: colors.sand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.body, color: colors.ink }}>
        <div>Loading the season...</div>
      </div>
    );
  }

  const latestEpisode = state.episodes && state.episodes.length > 0
    ? Math.max(...state.episodes.map(e => e.number))
    : null;
  const showSpoilerGate = view === 'public' && !spoilerAck && latestEpisode !== null;

  return (
    <div style={{ minHeight: '100vh', background: colors.sand, fontFamily: fonts.body, color: colors.ink }}>
      <FontLoader />
      <Header view={view} setView={setView} adminAuth={adminAuth} />
      {showSpoilerGate && <SpoilerGate latestEpisode={latestEpisode} onAck={() => setSpoilerAck(true)} />}
      {view === 'public' && !showSpoilerGate && <PublicView state={state} />}
      {view === 'admin' && !adminAuth && <PasswordGate onUnlock={() => setAdminAuth(true)} />}
      {view === 'admin' && adminAuth && <AdminView state={state} updateState={updateState} />}
      {view === 'public' && !showSpoilerGate && <Testimonials />}
      <Footer />
    </div>
  );
}

function FontLoader() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);
  return null;
}

function Header({ view, setView, adminAuth }) {
  return (
    <header style={{ background: colors.ink, color: colors.bone, padding: '24px 32px', borderBottom: `4px solid ${colors.sunset}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: '100%', opacity: 0.08, background: `repeating-linear-gradient(45deg, ${colors.bone} 0px, ${colors.bone} 1px, transparent 1px, transparent 12px)` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: colors.ember, fontWeight: 600, marginBottom: 4 }}>Family Fantasy Draft</div>
          <h1 style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 38, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Survivor <span style={{ color: colors.ember }}>50</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(250,246,232,0.08)', padding: 4, borderRadius: 4 }}>
          <NavBtn active={view === 'public'} onClick={() => setView('public')}>
            <Trophy size={14} /> Standings
          </NavBtn>
          <NavBtn active={view === 'admin'} onClick={() => setView('admin')}>
            {adminAuth ? <Edit2 size={14} /> : <Lock size={14} />} Admin
          </NavBtn>
        </div>
      </div>
    </header>
  );
}

function NavBtn({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? colors.bone : 'transparent',
        color: active ? colors.ink : colors.bone,
        border: 'none',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: fonts.body,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function SpoilerGate({ latestEpisode, onAck }) {
  return (
    <main style={{ maxWidth: 500, margin: '60px auto', padding: '0 24px' }}>
      <div style={{
        background: colors.bone,
        border: `2px solid ${colors.sunset}`,
        borderRadius: 4,
        padding: 32,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: colors.sunset }} />
        <Flame size={36} style={{ color: colors.sunset, marginBottom: 12 }} />
        <div style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: colors.sunset, fontWeight: 700, marginBottom: 8 }}>
          Spoiler Warning
        </div>
        <h2 style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 700, margin: '0 0 16px', lineHeight: 1.2 }}>
          Standings include results through Episode {latestEpisode}
        </h2>
        <p style={{ fontSize: 14, color: colors.ash, margin: '0 0 24px', lineHeight: 1.5 }}>
          Continuing will reveal who's been voted out and who's still in the game. If you haven't watched through Episode {latestEpisode} yet, come back after you do.
        </p>
        <button onClick={onAck} style={{
          padding: '12px 24px', background: colors.ink, color: colors.bone, border: 'none',
          borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={16} /> I'm caught up — show standings
        </button>
        <div style={{ marginTop: 16, fontSize: 11, color: colors.ash, fontFamily: fonts.mono, letterSpacing: '0.1em' }}>
          You'll see this warning each time you open the app.
        </div>
      </div>
    </main>
  );
}

// ============ PUBLIC VIEW ============
function PublicView({ state }) {
  const { teamScores } = useMemo(() => calculateScores(state), [state]);
  const sorted = [...teamScores].sort((a, b) => b.total - a.total);
  const max = Math.max(1, sorted[0]?.total || 1);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  const totalEpisodes = (state.episodes || []).length;
  const isPostMerge = state.mergeEpisode !== null && state.mergeEpisode !== undefined;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', gap: 24, marginBottom: 32, flexWrap: 'wrap', borderBottom: `1px solid ${colors.sandDark}`, paddingBottom: 20 }}>
        <Stat label="Episodes scored" value={totalEpisodes} />
        <Stat label="Stage" value={isPostMerge ? `Post-merge (Ep ${state.mergeEpisode}+)` : 'Pre-merge'} />
        <Stat label="Leader" value={sorted[0]?.total > 0 ? sorted[0].player : '—'} />
        <Stat label="Top score" value={sorted[0]?.total || 0} />
      </div>

      <section style={{ marginBottom: 48 }}>
        <SectionTitle>The Standings</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {sorted.map((team, i) => (
            <StandingRow key={team.player} team={team} rank={i + 1} max={max} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Drafted Teams</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
          {sorted.map(team => (
            <TeamCard
              key={team.player}
              team={team}
              expanded={expandedTeam === team.player}
              onToggle={() => setExpandedTeam(expandedTeam === team.player ? null : team.player)}
            />
          ))}
        </div>
      </section>

      {(state.episodes || []).length > 0 && (
        <section style={{ marginTop: 48 }}>
          <SectionTitle>Episode Breakdown</SectionTitle>
          <EpisodeBreakdown
            state={state}
            selectedEpisode={selectedEpisode}
            setSelectedEpisode={setSelectedEpisode}
          />
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.ash, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 700, color: colors.ink, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 24, height: 2, background: colors.sunset }} />
      <h2 style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0, color: colors.ink }}>{children}</h2>
    </div>
  );
}

function StandingRow({ team, rank, max }) {
  const pct = (team.total / max) * 100;
  const isLeader = rank === 1 && team.total > 0;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 18px',
      background: colors.bone,
      border: isLeader ? `2px solid ${colors.sunset}` : `1px solid ${colors.sandDark}`,
      borderRadius: 4,
      position: 'relative',
    }}>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 900, color: isLeader ? colors.sunset : colors.ash, minWidth: 32, lineHeight: 1 }}>
        {rank}
      </div>
      <div style={{ minWidth: 80, fontWeight: 600, fontSize: 16 }}>{team.player}</div>
      <div style={{ flex: 1, height: 6, background: colors.sand, borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${Math.max(0, pct)}%`, height: '100%', background: isLeader ? colors.sunset : colors.ocean, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, minWidth: 50, textAlign: 'right' }}>
        {team.total}
      </div>
    </div>
  );
}

function TeamCard({ team, expanded, onToggle }) {
  const aliveCount = team.contestantData.filter(c => !c.eliminated).length;
  return (
    <div style={{
      background: colors.bone,
      border: `1px solid ${colors.sandDark}`,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', textAlign: 'left', padding: '16px 18px', background: 'transparent', border: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: fonts.body,
      }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{team.player}</div>
          <div style={{ fontSize: 11, color: colors.ash, marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
            {aliveCount}/{team.contestantData.length} alive · {team.total} pts
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.ash }}>{expanded ? '−' : '+'}</div>
      </button>
      <div style={{ borderTop: `1px solid ${colors.sandDark}` }}>
        {team.contestantData.map(c => (
          <div key={c.name} style={{
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: `1px solid ${colors.sand}`,
            opacity: c.eliminated ? 0.5 : 1,
          }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 13,
                textDecoration: c.eliminated ? 'line-through' : 'none',
                fontWeight: c.isCaptain ? 600 : 400,
              }}>
                {c.name}
              </span>
              {c.isCaptain && (
                <Crown size={12} style={{ color: colors.sunset }} />
              )}
              {c.eliminated && (
                <span style={{ fontSize: 10, color: colors.ash, fontFamily: fonts.mono }}>OUT EP{c.eliminatedEp}</span>
              )}
            </div>
            <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16, minWidth: 30, textAlign: 'right' }}>
              {c.score}
            </div>
          </div>
        ))}
        {expanded && (
          <div style={{ padding: '12px 18px', background: colors.sand, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: colors.ash, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 10 }}>
              Score breakdown
            </div>
            {team.contestantData.map(c => (
              c.breakdown.length > 0 && (
                <div key={c.name} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                  {c.breakdown.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.ash, padding: '2px 0' }}>
                      <span>Ep {b.episode} · {b.event}{b.captainBonus ? ' (captain bonus)' : ''}</span>
                      <span style={{ fontFamily: fonts.mono, color: b.points > 0 ? colors.palm : colors.sunsetDark }}>
                        {b.points > 0 ? '+' : ''}{b.points}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ))}
            {team.contestantData.every(c => c.breakdown.length === 0) && (
              <div style={{ color: colors.ash, fontStyle: 'italic' }}>No points yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EpisodeBreakdown({ state, selectedEpisode, setSelectedEpisode }) {
  const sortedEpisodes = [...(state.episodes || [])].sort((a, b) => b.number - a.number);

  const activeEpNum = selectedEpisode !== null ? selectedEpisode : sortedEpisodes[0]?.number;
  const activeEp = (state.episodes || []).find(e => e.number === activeEpNum);

  if (!activeEp) return null;

  const isPostMerge = state.mergeEpisode !== null && state.mergeEpisode !== undefined && activeEp.number >= state.mergeEpisode;

  const teamBreakdowns = TEAMS.map(team => {
    const contestantBreakdowns = team.contestants.map(c => {
      const events = (activeEp.events || {})[c] || [];
      const isCaptain = team.captain === c;
      const eventDetails = events.map(eventId => {
        const evType = EVENT_TYPES.find(e => e.id === eventId);
        if (!evType) return null;
        const basePts = isPostMerge ? evType.postMerge : evType.preMerge;
        const captainPts = isCaptain ? evType.captainBonus : 0;
        return { label: evType.label, basePts, captainPts, total: basePts + captainPts };
      }).filter(Boolean);
      const epTotal = eventDetails.reduce((s, e) => s + e.total, 0);
      return { name: c, isCaptain, events: eventDetails, total: epTotal };
    });
    const teamTotal = contestantBreakdowns.reduce((s, c) => s + c.total, 0);
    return { player: team.player, contestants: contestantBreakdowns, total: teamTotal };
  });

  const sortedTeams = [...teamBreakdowns].sort((a, b) => b.total - a.total);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${colors.sandDark}` }}>
        {sortedEpisodes.map(ep => {
          const isActive = ep.number === activeEpNum;
          return (
            <button
              key={ep.number}
              onClick={() => setSelectedEpisode(ep.number)}
              style={{
                padding: '8px 14px',
                background: isActive ? colors.ink : colors.bone,
                color: isActive ? colors.bone : colors.ink,
                border: `1px solid ${isActive ? colors.ink : colors.sandDark}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: fonts.body,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontFamily: fonts.display }}>Ep {ep.number}</span>
              {ep.title && <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>· {ep.title}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>
            Episode {activeEp.number}
          </div>
          {activeEp.title && (
            <div style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>{activeEp.title}</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: colors.ash, fontFamily: fonts.mono, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {isPostMerge ? 'Post-merge scoring' : 'Pre-merge scoring'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {sortedTeams.map(team => (
          <EpisodeTeamCard key={team.player} team={team} />
        ))}
      </div>
    </div>
  );
}

function EpisodeTeamCard({ team }) {
  const hasPoints = team.contestants.some(c => c.events.length > 0);
  return (
    <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${colors.sand}` }}>
        <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700 }}>{team.player}</div>
        <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, color: team.total > 0 ? colors.palm : team.total < 0 ? colors.sunsetDark : colors.ash }}>
          {team.total > 0 ? '+' : ''}{team.total}
        </div>
      </div>
      {!hasPoints ? (
        <div style={{ fontSize: 12, color: colors.ash, fontStyle: 'italic', padding: '8px 0' }}>
          No points scored this episode.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {team.contestants.map(c => (
            c.events.length > 0 && (
              <div key={c.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  {c.isCaptain && <Crown size={11} style={{ color: colors.sunset }} />}
                  <span style={{ marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 12, fontWeight: 600, color: c.total > 0 ? colors.palm : colors.sunsetDark }}>
                    {c.total > 0 ? '+' : ''}{c.total}
                  </span>
                </div>
                <div style={{ paddingLeft: 12, borderLeft: `2px solid ${colors.sand}` }}>
                  {c.events.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.ash, padding: '2px 0' }}>
                      <span>
                        {ev.label}
                        {ev.captainPts > 0 && (
                          <span style={{ color: colors.sunset, fontWeight: 600 }}> +{ev.captainPts} captain</span>
                        )}
                      </span>
                      <span style={{ fontFamily: fonts.mono }}>
                        {ev.total > 0 ? '+' : ''}{ev.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ADMIN ============
function PasswordGate({ onUnlock }) {
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);

  function submit() {
    if (pwd === ADMIN_PASSWORD) onUnlock();
    else { setError(true); setTimeout(() => setError(false), 600); }
  }

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: '0 24px' }}>
      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: 32, textAlign: 'center' }}>
        <Lock size={32} style={{ color: colors.ocean, marginBottom: 16 }} />
        <h2 style={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Admin access</h2>
        <p style={{ fontSize: 13, color: colors.ash, margin: '0 0 24px' }}>Score entry is restricted.</p>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type={show ? 'text' : 'password'}
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Password"
            style={{
              width: '100%', padding: '12px 40px 12px 14px', fontSize: 14,
              border: `1px solid ${error ? colors.sunset : colors.sandDark}`, borderRadius: 4,
              background: colors.sand, fontFamily: fonts.body, outline: 'none', boxSizing: 'border-box',
              animation: error ? 'shake 0.3s' : 'none',
            }}
          />
          <button onClick={() => setShow(!show)} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: colors.ash,
          }}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button onClick={submit} style={{
          width: '100%', padding: '12px', background: colors.ink, color: colors.bone, border: 'none',
          borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
        }}>
          Unlock
        </button>
      </div>
      <style>{`@keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }`}</style>
    </main>
  );
}

function AdminView({ state, updateState }) {
  const [tab, setTab] = useState('episodes');
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${colors.sandDark}` }}>
        <AdminTab active={tab === 'episodes'} onClick={() => setTab('episodes')}>Episodes</AdminTab>
        <AdminTab active={tab === 'eliminated'} onClick={() => setTab('eliminated')}>Eliminations</AdminTab>
        <AdminTab active={tab === 'merge'} onClick={() => setTab('merge')}>Merge</AdminTab>
        <AdminTab active={tab === 'endgame'} onClick={() => setTab('endgame')}>Endgame</AdminTab>
      </div>
      {tab === 'episodes' && <EpisodesTab state={state} updateState={updateState} />}
      {tab === 'eliminated' && <EliminationsTab state={state} updateState={updateState} />}
      {tab === 'merge' && <MergeTab state={state} updateState={updateState} />}
      {tab === 'endgame' && <EndgameTab state={state} updateState={updateState} />}
    </main>
  );
}

function AdminTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 20px', background: 'transparent', border: 'none',
      borderBottom: active ? `2px solid ${colors.sunset}` : '2px solid transparent',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
      color: active ? colors.ink : colors.ash, fontFamily: fonts.body, letterSpacing: '0.05em',
    }}>{children}</button>
  );
}

function EpisodesTab({ state, updateState }) {
  const [editingEp, setEditingEp] = useState(null);
  const sorted = [...(state.episodes || [])].sort((a, b) => b.number - a.number);

  function startNew() {
    const eps = state.episodes || [];
    const nextNum = eps.length === 0 ? 1 : Math.max(...eps.map(e => e.number)) + 1;
    setEditingEp({ number: nextNum, title: '', events: {}, isNew: true });
  }

  function saveEp(ep) {
    updateState(s => {
      const others = (s.episodes || []).filter(e => e.number !== ep.number);
      return { ...s, episodes: [...others, { number: ep.number, title: ep.title, events: ep.events }] };
    });
    setEditingEp(null);
  }

  function deleteEp(num) {
    if (!confirm(`Delete episode ${num}?`)) return;
    updateState(s => ({ ...s, episodes: (s.episodes || []).filter(e => e.number !== num) }));
  }

  if (editingEp) {
    return <EpisodeEditor ep={editingEp} state={state} onSave={saveEp} onCancel={() => setEditingEp(null)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, margin: 0 }}>Episodes</h2>
        <button onClick={startNew} style={btnPrimary}><Plus size={14} /> New episode</button>
      </div>
      {sorted.length === 0 ? (
        <div style={{ background: colors.bone, padding: 32, borderRadius: 4, textAlign: 'center', color: colors.ash, border: `1px dashed ${colors.sandDark}` }}>
          No episodes yet. Add your first one to start scoring.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(ep => {
            const eventCount = Object.values(ep.events || {}).reduce((sum, evs) => sum + evs.length, 0);
            return (
              <div key={ep.number} style={{
                background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 18 }}>Episode {ep.number}</div>
                  {ep.title && <div style={{ fontSize: 12, color: colors.ash, marginTop: 2 }}>{ep.title}</div>}
                  <div style={{ fontSize: 11, color: colors.ash, marginTop: 4, fontFamily: fonts.mono }}>{eventCount} events</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditingEp({ ...ep, isNew: false })} style={btnGhost}><Edit2 size={14} /></button>
                  <button onClick={() => deleteEp(ep.number)} style={{ ...btnGhost, color: colors.sunsetDark }}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EpisodeEditor({ ep, state, onSave, onCancel }) {
  const [title, setTitle] = useState(ep.title || '');
  const [number, setNumber] = useState(ep.number);
  const [events, setEvents] = useState(ep.events || {});
  const [search, setSearch] = useState('');

  function toggleEvent(contestant, eventId) {
    setEvents(prev => {
      const current = prev[contestant] || [];
      const has = current.includes(eventId);
      const updated = has ? current.filter(e => e !== eventId) : [...current, eventId];
      const next = { ...prev };
      if (updated.length === 0) delete next[contestant]; else next[contestant] = updated;
      return next;
    });
  }

  const isPostMerge = state.mergeEpisode !== null && state.mergeEpisode !== undefined && number >= state.mergeEpisode;
  const filtered = ALL_CONTESTANTS.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const eliminated = state.eliminated || {};
  const aliveContestants = filtered.filter(c => eliminated[c] === undefined || eliminated[c] >= number);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, margin: 0 }}>
          {ep.isNew ? 'New episode' : `Edit episode ${ep.number}`}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btnGhost}><X size={14} /> Cancel</button>
          <button onClick={() => onSave({ number, title, events })} style={btnPrimary}><Check size={14} /> Save</button>
        </div>
      </div>

      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={lblStyle}>Episode #</label>
          <input type="number" value={number} onChange={e => setNumber(parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: 100 }} />
          <label style={lblStyle}>Title (optional)</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Tribe swap chaos" style={inputStyle} />
        </div>
        <div style={{ fontSize: 12, color: colors.ash, paddingTop: 12, borderTop: `1px solid ${colors.sand}` }}>
          Scoring as <strong>{isPostMerge ? 'post-merge' : 'pre-merge'}</strong>
          {(state.mergeEpisode === null || state.mergeEpisode === undefined) && ' · merge not yet set'}
          {state.mergeEpisode !== null && state.mergeEpisode !== undefined && ` · merge at ep ${state.mergeEpisode}`}
        </div>
      </div>

      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 700, margin: 0 }}>Events by contestant</h3>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.ash }} />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter contestants..."
              style={{ ...inputStyle, paddingLeft: 30, width: 200 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.ash, marginBottom: 16, padding: 12, background: colors.sand, borderRadius: 4 }}>
          Tap events to toggle. Mark eliminations in the Eliminations tab.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {aliveContestants.map(c => (
            <ContestantRow
              key={c}
              contestant={c}
              isPostMerge={isPostMerge}
              selected={events[c] || []}
              onToggle={(evId) => toggleEvent(c, evId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContestantRow({ contestant, isPostMerge, selected, onToggle }) {
  const isCaptain = TEAMS.some(t => t.captain === contestant);
  const team = TEAMS.find(t => t.contestants.includes(contestant));
  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${colors.sand}`, borderRadius: 4, background: selected.length > 0 ? colors.sand : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{contestant}</span>
        {isCaptain && <Crown size={12} style={{ color: colors.sunset }} />}
        <span style={{ fontSize: 11, color: colors.ash, fontFamily: fonts.mono }}>{team?.player}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {EVENT_TYPES.filter(e => !e.captainOnly || isCaptain).map(ev => {
          const isSelected = selected.includes(ev.id);
          const pts = isPostMerge ? ev.postMerge : ev.preMerge;
          const captainPts = isCaptain ? ev.captainBonus : 0;
          const total = pts + captainPts;
          return (
            <button
              key={ev.id}
              onClick={() => onToggle(ev.id)}
              style={{
                padding: '6px 10px', fontSize: 12,
                border: `1px solid ${isSelected ? colors.ocean : colors.sandDark}`,
                background: isSelected ? colors.ocean : colors.bone,
                color: isSelected ? colors.bone : colors.ink,
                borderRadius: 4, cursor: 'pointer', fontFamily: fonts.body, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {ev.label}
              <span style={{ fontFamily: fonts.mono, fontSize: 11, opacity: 0.7 }}>
                {total > 0 ? '+' : ''}{total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EliminationsTab({ state, updateState }) {
  function setEliminated(contestant, episodeNum) {
    updateState(s => {
      const next = { ...(s.eliminated || {}) };
      if (episodeNum === '' || episodeNum === null) delete next[contestant];
      else next[contestant] = parseInt(episodeNum);
      return { ...s, eliminated: next };
    });
  }
  const eliminated = state.eliminated || {};
  return (
    <div>
      <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Eliminations</h2>
      <p style={{ fontSize: 13, color: colors.ash, marginBottom: 20 }}>Set the episode each contestant was voted out. Leave blank if still in the game.</p>
      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, overflow: 'hidden' }}>
        {TEAMS.map(team => (
          <div key={team.player}>
            <div style={{ padding: '10px 16px', background: colors.sand, fontFamily: fonts.display, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {team.player}
            </div>
            {team.contestants.map(c => (
              <div key={c} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${colors.sand}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{c}</span>
                  {team.captain === c && <Crown size={12} style={{ color: colors.sunset }} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, color: colors.ash }}>Eliminated ep:</label>
                  <input
                    type="number" min="1"
                    value={eliminated[c] || ''}
                    onChange={e => setEliminated(c, e.target.value)}
                    placeholder="—"
                    style={{ ...inputStyle, width: 70 }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MergeTab({ state, updateState }) {
  const [mergeEp, setMergeEp] = useState(state.mergeEpisode || '');
  function save() {
    const n = mergeEp === '' ? null : parseInt(mergeEp);
    updateState(s => ({ ...s, mergeEpisode: n }));
  }
  return (
    <div>
      <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Merge episode</h2>
      <p style={{ fontSize: 13, color: colors.ash, marginBottom: 20 }}>
        Set the episode number when the merge happens. Episodes from this number onward score at post-merge values.
      </p>
      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label style={lblStyle}>Merge at episode:</label>
        <input type="number" min="1" value={mergeEp} onChange={e => setMergeEp(e.target.value)} placeholder="e.g. 8" style={{ ...inputStyle, width: 100 }} />
        <button onClick={save} style={btnPrimary}><Check size={14} /> Save</button>
      </div>
    </div>
  );
}

function EndgameTab({ state, updateState }) {
  function setPlacement(placeId, contestant) {
    updateState(s => ({ ...s, endgame: { ...(s.endgame || {}), [placeId]: contestant || null } }));
  }
  const endgame = state.endgame || {};
  return (
    <div>
      <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Final placements</h2>
      <p style={{ fontSize: 13, color: colors.ash, marginBottom: 20 }}>Set after the finale airs.</p>
      <div style={{ background: colors.bone, border: `1px solid ${colors.sandDark}`, borderRadius: 4, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ENDGAME_PLACEMENTS.map(p => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', gap: 12, alignItems: 'center' }}>
            <label style={lblStyle}>{p.label}</label>
            <select value={endgame[p.id] || ''} onChange={e => setPlacement(p.id, e.target.value)} style={inputStyle}>
              <option value="">— select contestant —</option>
              {ALL_CONTESTANTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.ash, textAlign: 'right' }}>+{p.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Testimonials() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (TESTIMONIALS.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  if (TESTIMONIALS.length === 0) return null;

  const current = TESTIMONIALS[index];

  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 0' }}>
      <div style={{ borderTop: `1px solid ${colors.sandDark}`, paddingTop: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: colors.ash, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>
          What people are saying
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 100 }}>
          <figure key={index} style={{ margin: 0, maxWidth: 600, textAlign: 'center', animation: 'fadeIn 0.6s ease-out' }}>
            <blockquote style={{ margin: 0, fontFamily: fonts.display, fontSize: 15, fontStyle: 'italic', color: colors.ink, lineHeight: 1.5 }}>
              "{current.quote}"
            </blockquote>
            <figcaption style={{ marginTop: 8, fontSize: 11, color: colors.ash, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
              — {current.author}
            </figcaption>
          </figure>
          {TESTIMONIALS.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  aria-label={`Show testimonial ${i + 1}`}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background: i === index ? colors.sunset : colors.sandDark,
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: '32px 24px', textAlign: 'center', fontSize: 11, color: colors.ash, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: fonts.mono }}>
      Outwit · Outplay · Outscore
    </footer>
  );
}

const inputStyle = {
  padding: '8px 12px', fontSize: 14, border: `1px solid ${colors.sandDark}`, borderRadius: 4,
  background: colors.bone, fontFamily: fonts.body, outline: 'none', color: colors.ink,
};
const lblStyle = { fontSize: 12, fontWeight: 600, color: colors.ash, letterSpacing: '0.05em', textTransform: 'uppercase' };
const btnPrimary = {
  padding: '8px 16px', background: colors.ink, color: colors.bone, border: 'none', borderRadius: 4,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: fonts.body,
};
const btnGhost = {
  padding: '8px 12px', background: 'transparent', color: colors.ink, border: `1px solid ${colors.sandDark}`, borderRadius: 4,
  fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: fonts.body,
};

export default App;
