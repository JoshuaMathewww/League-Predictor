import { useState, useEffect } from 'react';

// --- DATA HELPERS ---

const getRankIcon = (tier) => {
  const t = tier?.toLowerCase() || 'unranked';
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.png`;
};

const getQueueName = (id) => {
  const queues = { 420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Normal Draft", 430: "Normal Blind", 450: "ARAM", 700: "Clash", 1700: "Arena" };
  return queues[Number(id)] || "Classic";
};

const getSpellName = (id) => {
  const spells = { 1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste", 7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 14: "SummonerDot", 21: "SummonerBarrier" };
  return spells[id] || "SummonerFlash"; 
};

const getRuneStyleIcon = (styleId) => {
  const styles = { 8000: '7201_Precision', 8100: '7200_Domination', 8200: '7202_Sorcery', 8300: '7203_Whimsy', 8400: '7204_Resolve' };
  const folder = styles[styleId] || '7201_Precision';
  return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${folder}.png`;
};

// --- SUB-COMPONENTS ---

function GameTimer({ startTime, initialLength }) {
  const [elapsed, setElapsed] = useState(initialLength);
  useEffect(() => {
    if (!startTime || startTime === 0) { setElapsed(initialLength); return; }
    const interval = setInterval(() => {
      const now = Date.now();
      const diffInSeconds = Math.floor((now - startTime) / 1000);
      setElapsed(diffInSeconds > 0 ? diffInSeconds : initialLength);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, initialLength]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  return <span className="text-xl font-mono text-slate-400">{formatTime(elapsed)}</span>;
}

const BannedChampIcon = ({ championId }) => {
  const isNoBan = !championId || Number(championId) === -1;
  return (
    <div className="relative w-8 h-8 rounded border border-slate-800/60 overflow-hidden bg-slate-900 shadow-md">
      {isNoBan ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-800/40 text-slate-500 font-bold text-sm">?</div>
      ) : (
        <>
          <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`} className="w-full h-full grayscale-[40%] opacity-80" alt="ban" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-[2px] bg-red-500/80 rotate-45 absolute"></div>
            <div className="w-full h-[2px] bg-red-500/80 -rotate-45 absolute"></div>
          </div>
        </>
      )}
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---

function LiveGame({ data }) {
  const [runeData, setRuneData] = useState([]);

  useEffect(() => {
    fetch('https://ddragon.leagueoflegends.com/cdn/15.23.1/data/en_US/runesReforged.json')
      .then(res => res.json())
      .then(json => {
        const allRunes = json.flatMap(style => style.slots.flatMap(slot => slot.runes));
        setRuneData(allRunes);
      })
      .catch(err => console.error("Error loading runes:", err));
  }, []);

  const getKeystoneInfo = (id) => {
    const rune = runeData.find(r => r.id === Number(id));
    if (!rune) return { icon: 'perk-images/Styles/RunesIcon.png', name: 'Rune', shortDesc: 'Description unavailable.' };
    return rune;
  };

  if (!data || !data.in_game) {
    return <div className="text-white p-10 bg-slate-950 min-h-screen">No active game data found.</div>;
  }

  const RuneSection = ({ p, isRed }) => {
    const keystone = getKeystoneInfo(p.keystoneId);
    return (
      <div className={`flex gap-2 items-center bg-slate-950/50 p-1.5 rounded border border-slate-800 ${isRed ? 'mr-2 flex-row-reverse' : 'ml-2'}`}>
        <div className="relative group/rune w-9 h-9 bg-slate-900 rounded-full border border-slate-700 overflow-visible flex items-center justify-center cursor-pointer">
          <img src={`https://ddragon.leagueoflegends.com/cdn/img/${keystone.icon}`} className="w-full h-full scale-110" alt={keystone.name} />
          <div className={`absolute bottom-full mb-3 hidden group-hover/rune:block w-64 bg-slate-900 p-3 rounded-lg text-xs shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-slate-700 z-[9999] pointer-events-none text-left ${isRed ? 'right-0' : 'left-0'}`}>
            <p className="font-bold text-blue-400 border-b border-slate-800 pb-1 mb-2 text-sm">{keystone.name}</p>
            <p className="text-slate-200 leading-relaxed font-normal" dangerouslySetInnerHTML={{ __html: keystone.shortDesc }} />
          </div>
        </div>
        <div className="w-7 h-7 bg-slate-900 rounded-full border border-slate-700 overflow-hidden flex items-center justify-center">
          <img src={getRuneStyleIcon(p.perkStyle)} className="w-5 h-5 opacity-80" alt="Tree" />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-7xl">
        <header className="mb-6 border-b border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <p className="text-blue-500 font-bold tracking-widest text-xs uppercase mb-1">Live Match Found</p>
            <h2 className="text-4xl font-black uppercase tracking-tighter">
              {getQueueName(data.game_queue_id || data.game_queue_config_id || data.game?.gameQueueConfigId)}
            </h2>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-slate-500 text-xs font-bold uppercase mb-1">Game Time</p>
            <div className="bg-slate-900 px-6 py-2 rounded-lg border border-slate-800 shadow-inner">
              <GameTimer startTime={data.game_start_time} initialLength={data.game_length} />
            </div>
          </div>
        </header>

        {/* Global Ban Section */}
        <div className="flex justify-between items-center mb-8 px-6 py-3 bg-slate-900/40 rounded-xl border border-slate-800/40 shadow-inner">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500/60 mr-2">Blue Bans</span>
            {[0, 1, 2, 3, 4].map(i => (
              <BannedChampIcon key={`blue-ban-${i}`} championId={data.banned_champions?.filter(b => b.teamId === 100)[i]?.championId} />
            ))}
          </div>
          <div className="h-10 w-[1px] bg-slate-800/80 mx-2"></div>
          <div className="flex flex-row-reverse gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 ml-2">Red Bans</span>
            {[0, 1, 2, 3, 4].map(i => (
              <BannedChampIcon key={`red-ban-${i}`} championId={data.banned_champions?.filter(b => b.teamId === 200)[i]?.championId} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Blue Team Participants */}
          <div className="space-y-2">
            <h3 className="text-blue-400 font-bold border-l-4 border-blue-500 pl-3 mb-4 uppercase text-sm tracking-wider">Blue Team</h3>
            {data.participants.filter(p => p.teamId === 100).map(p => (
              <div key={p.puuid} className="bg-slate-900 p-4 min-h-[110px] rounded-lg border border-slate-800 hover:border-blue-500/40 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`} alt="champion" className="w-16 h-16 rounded border border-slate-700 shadow-lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold leading-none">{p.summonerName}{p.bot && <span className="ml-2 text-red-500 text-sm font-black">(BOT)</span>}</p>
                      <div className="flex items-center gap-1.5 ml-1">
                        <img src={getRankIcon(p.rank?.tier)} className="w-5 h-5 object-contain" alt="rank-icon" />
                        <span className="text-indigo-300/90 text-[12px] font-bold uppercase tracking-tight">{p.rank?.tier} {p.rank?.rank} - {p.rank?.lp} LP</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[12px] font-bold tracking-tight">
                      <span className="text-slate-400 text-[13px] font-medium">#{p.tagLine}</span>
                      <span className={`px-1.5 py-0.5 rounded-sm bg-slate-950/40 ${p.rank?.winrate >= 50 ? 'text-emerald-700/90': 'text-rose-700/75'}`}>
                        {p.rank?.winrate}% WR <span className="font-medium">({p.rank?.wins}W {p.rank?.losses}L)</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex flex-col gap-1">
                    <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell1Id)}.png`} className="w-7 h-7 rounded border border-slate-800" title="Spell 1" />
                    <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell2Id)}.png`} className="w-7 h-7 rounded border border-slate-800" title="Spell 2" />
                  </div>
                  <RuneSection p={p} isRed={false} />
                </div>
              </div>
            ))}
          </div>

          {/* Red Team Participants */}
          <div className="space-y-2">
            <h3 className="text-red-400 font-bold border-r-4 border-red-500 pr-3 mb-4 text-right uppercase text-sm tracking-wider">Red Team</h3>
            {data.participants.filter(p => p.teamId === 200).map(p => (
              <div key={p.puuid} className="bg-slate-900 p-4 min-h-[110px] rounded-lg border border-slate-800 hover:border-red-500/40 transition-all flex flex-row-reverse items-center justify-between group">
                <div className="flex flex-row-reverse items-center gap-4 text-right">
                  <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`} alt="champion" className="w-16 h-16 rounded border border-slate-700 shadow-lg" />
                  <div>
                    <div className="flex flex-row-reverse items-center gap-2">
                      <p className="text-lg font-bold leading-none">{p.bot && <span className="mr-2 text-red-500 text-sm font-black">(BOT)</span>}{p.summonerName}</p>
                      <div className="flex flex-row-reverse items-center gap-1.5 mr-1">
                        <img src={getRankIcon(p.rank?.tier)} className="w-5 h-5 object-contain" alt="rank-icon" />
                        <span className="text-indigo-300/90 text-[12px] font-bold uppercase tracking-tight">{p.rank?.tier} {p.rank?.rank} - {p.rank?.lp} LP</span>
                      </div>
                    </div>
                    <div className="flex flex-row-reverse items-center gap-2 mt-1.5 text-[12px] font-bold tracking-tight">
                      <span className="text-slate-400 text-[13px] font-medium">#{p.tagLine}</span>
                      <span className={`px-1.5 py-0.5 rounded-sm bg-slate-950/40 ${p.rank?.winrate >= 50 ? 'text-emerald-700/90': 'text-rose-700/75'}`}>
                        {p.rank?.winrate}% WR <span className="font-medium">({p.rank?.wins}W {p.rank?.losses}L)</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row-reverse gap-2 items-center">
                  <div className="flex flex-col gap-1">
                    <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell1Id)}.png`} className="w-7 h-7 rounded border border-slate-800" alt="Spell 1" />
                    <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell2Id)}.png`} className="w-7 h-7 rounded border border-slate-800" alt="Spell 2" />
                  </div>
                  <RuneSection p={p} isRed={true} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveGame;