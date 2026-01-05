import { useState, useEffect } from 'react';

// --- DATA HELPERS ---

const getRankIcon = (tier) => {
  const t = tier?.toLowerCase() || 'unranked';
  if (t === 'emerald') {
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.svg`;
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.png`;
};

const getQueueName = (id) => {
  const queues = { 420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Normal Draft", 430: "Normal Blind", 450: "ARAM", 700: "Clash", 1700: "Arena", 2400: "ARAM: Mayhem"};
  return queues[Number(id)] || "Classic";
};

const getSpellName = (id) => {
  const spells = { 1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste", 7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 14: "SummonerDot", 21: "SummonerBarrier" };
  return spells[id] || "SummonerFlash"; 
};

const getRuneStyleIcon = (styleId) => {
  const styles = { 
    8000: '7201_Precision', 
    8100: '7200_Domination', 
    8200: '7202_Sorcery', 
    8300: '7203_Whimsy', 
    8400: '7204_Resolve' 
  };
  const folder = styles[Number(styleId)] || '7201_Precision';
  return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${folder}.png`;
};

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const formatTimeAgo = (timestamp) => {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));
  if (hours === 0) return `${minutes} mins ago`;
  if (days === 0) return `${hours} hours ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

// --- SUB-COMPONENTS ---

const sortParticipantsByLane = (participants) => {
  const sorted = { TOP: null, JNG: null, MID: null, BOT: null, SUP: null };
  const remaining = [...participants];
  
  const jngIndex = remaining.findIndex(p => p.spell1Id === 11 || p.spell2Id === 11);
  if (jngIndex !== -1) {
    sorted.JNG = remaining.splice(jngIndex, 1)[0];
  }

  const order = ['TOP', 'MID', 'BOT', 'SUP'];
  order.forEach(lane => {
    if (remaining.length === 0) return;
    let bestPlayerIndex = 0;
    let maxProb = -1;

    remaining.forEach((p, i) => {
      const prob = p.laneProbabilities?.[lane] || 0;
      if (prob > maxProb) {
        maxProb = prob;
        bestPlayerIndex = i;
      }
    });

    if (!sorted[lane]) {
      sorted[lane] = remaining.splice(bestPlayerIndex, 1)[0];
    }
  });

  const finalArray = [sorted.TOP, sorted.JNG, sorted.MID, sorted.BOT, sorted.SUP].filter(Boolean);
  
  if (finalArray.length < 5) {
    return [...finalArray, ...remaining];
  }

  return finalArray;
};


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
  const [selectedPuuid, setSelectedPuuid] = useState(null);

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

  const getPerformanceTags = (match) => {
    const tags = [];
    const ch = match.challenges;
    const p = match; 

    if (ch.killParticipation > 0.7) tags.push("High Participation");
    if (ch.soloKills > 2) tags.push("Solo Bolos");
    if (p.pentaKills > 0) tags.push("Pentakill");
    if (p.firstBloodKill) tags.push("First Blood");
    if (ch.multikills >= 3) tags.push("Multikills");
    if (ch.outnumberedKills > 0) tags.push("Outnumbered Kills");
    if (ch.killsUnderOwnTurret > 1) tags.push("Tower Anchor");
    if (ch.killingSprees > 2) tags.push("Killing Spree");

    if (ch.maxCsAdvantageOnLaneOpponent > 30) tags.push("CS Gap");
    if (ch.turretPlatesTaken > 3) tags.push("Turret Plate Eater");
    if (ch.laneMinionsFirst10Minutes > 80) tags.push("Early Farmer");
    if (ch.maxLevelLeadLaneOpponent >= 2) tags.push("Experience Lead");

    if (ch.epicMonsterSteals > 0) tags.push("Objective Secured");
    if (p.objectivesStolen > 0) tags.push("Objective Steal");
    if (p.turretKills > 2) tags.push("Split Pusher");

    if (ch.visionScoreAdvantageLaneOpponent > 1.5) tags.push("Vision Gap");
    if (ch.visionScorePerMinute > 2.0) tags.push("Map Vision");
    if (ch.wardTakedowns > 5) tags.push("Vision Denial");
    if (ch.effectiveHealAndShielding > 10000) tags.push("Utility Impact");
    if (ch.saveAllyFromDeath > 0) tags.push("Mitigation Clutch");
    if (ch.highestCrowdControlScore === 1) tags.push("CC Gap");

    if (ch.damageTakenOnTeamPercentage > 0.35) tags.push("Frontliner");
    if (ch.survivedSingleDigitHpCount > 0) tags.push("Evasive");
    if (ch.dodgeSkillShotsSmallWindow > 10) tags.push("Mechanical");
    if (ch.bountyGold > 1000) tags.push("Big Bounty");
    if (ch.goldPerMinute > 600) tags.push("Gold Lead");

    return tags;
  };

  if (!data || !data.in_game) {
    return <div className="text-white p-10 bg-slate-950 min-h-screen">No active game data found.</div>;
  }

  const selectedPlayer = data.participants.find(p => p.puuid === selectedPuuid);

  const RuneSection = ({ p, isRed }) => {
    const keystone = getKeystoneInfo(p.keystoneId);
    const subStyleUrl = getRuneStyleIcon(p.perkSubStyle);
    
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
          <img src={subStyleUrl} className="w-5 h-5 opacity-80" alt="Sub Style" />
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-white pt-2 pb-6 px-6 flex flex-col items-center">
      <div className="w-full max-w-[1800px]">
        <header className="mb-6 border-b border-slate-800/50 pb-6 flex justify-between items-end w-full px-2">
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

        <div className="flex justify-between items-center mb-8 px-6 py-3 bg-slate-900/40 rounded-xl border border-slate-800/40 shadow-inner w-full">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500/60 mr-2">Blue Bans</span>
            {[0, 1, 2, 3, 4].map(i => (
              <BannedChampIcon key={`blue-ban-${i}`} championId={data.banned_champions?.filter(b => b.teamId === 100)[i]?.championId} />
            ))}
          </div>
          <div className="h-10 w-[1px] bg-slate-800/80 mx-4 hidden lg:block"></div>
          <div className="flex flex-row-reverse gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 ml-2">Red Bans</span>
            {[0, 1, 2, 3, 4].map(i => (
              <BannedChampIcon key={`red-ban-${i}`} championId={data.banned_champions?.filter(b => b.teamId === 200)[i]?.championId} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-1 gap-y-4">
          {/* Blue Team Participants */}
          <div className="space-y-2">
            <h3 className="text-blue-400 font-bold border-l-4 border-blue-500 pl-3 mb-4 uppercase text-sm tracking-wider">Blue Team</h3>
            {sortParticipantsByLane(data.participants.filter(p => p.teamId === 100)).map((p, index) => {
              const isHidden = !p.puuid;
              return (
                <div 
                  key={p.puuid || `blue-hidden-${index}`} 
                  onClick={() => !isHidden && setSelectedPuuid(p.puuid === selectedPuuid ? null : p.puuid)} 
                  className={`bg-slate-900 pl-8 p-4 min-h-[110px] rounded-lg border transition-all flex items-center justify-between group relative overflow-visible ${
                    !isHidden ? 'cursor-pointer hover:z-50 hover:border-blue-500/40' : 'cursor-default opacity-80'
                  } ${
                    selectedPuuid === p.puuid && p.puuid !== null ? 'border-blue-500 bg-slate-800/40 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-slate-800'
                  }`}
                >
                  {/* Lane Label */}
                  <div className="absolute top-0 left-0 bg-blue-600/20 text-blue-400 text-[8px] font-medium px-2 py-0.5 rounded-br border-r border-b border-blue-500/30 tracking-widest">
                    {['TOP', 'JNG', 'MID', 'BOT', 'SUP'][index]}
                  </div>
                  <div className="flex items-center gap-4 ml-2 flex-1 min-w-0">
                    <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`} alt="champion" className="w-16 h-16 rounded border border-slate-700 shadow-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold leading-none truncate">{p.summonerName}{p.bot && <span className="ml-2 text-red-500 text-sm font-black">(BOT)</span>}</p>
                        <div className="flex items-center gap-1.5 ml-1 flex-shrink-0">
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
                  <div className="flex gap-2 items-center pl-12 flex-shrink-0">
                    <div className="flex flex-col gap-1">
                      <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell1Id)}.png`} className="w-7 h-7 rounded border border-slate-800" title="Spell 1" />
                      <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell2Id)}.png`} className="w-7 h-7 rounded border border-slate-800" title="Spell 2" />
                    </div>
                    <RuneSection p={p} isRed={false} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Red Team Participants */}
          <div className="space-y-2">
            <h3 className="text-red-400 font-bold border-r-4 border-red-500 pr-3 mb-4 text-right uppercase text-sm tracking-wider">Red Team</h3>
            {sortParticipantsByLane(data.participants.filter(p => p.teamId === 200)).map((p, index) => {
              const isHidden = !p.puuid;
              return (
                <div 
                  key={p.puuid || `red-hidden-${index}`} 
                  onClick={() => !isHidden && setSelectedPuuid(p.puuid === selectedPuuid ? null : p.puuid)} 
                  className={`bg-slate-900 pr-8 p-4 min-h-[110px] rounded-lg border transition-all flex flex-row-reverse items-center justify-between group relative overflow-visible ${
                    !isHidden ? 'cursor-pointer hover:z-50 hover:border-red-500/40' : 'cursor-default opacity-80'
                  } ${
                    selectedPuuid === p.puuid && p.puuid !== null ? 'border-red-500 bg-slate-800/40 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-slate-800'
                  }`}
                >
                  {/* Lane Label */}
                  <div className="absolute top-0 right-0 bg-red-600/20 text-red-400 text-[8px] font-medium px-2 py-0.5 rounded-bl border-l border-b border-red-500/30 tracking-widest">
                    {['TOP', 'JNG', 'MID', 'BOT', 'SUP'][index]}
                  </div>
                  <div className="flex flex-row-reverse items-center gap-4 text-right mr-2 flex-1 min-w-0">
                    <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`} alt="champion" className="w-16 h-16 rounded border border-slate-700 shadow-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-row-reverse items-center gap-2">
                        <p className="text-lg font-bold leading-none truncate">{p.summonerName}{p.bot && <span className="mr-2 text-red-500 text-sm font-black">(BOT)</span>}</p>
                        <div className="flex flex-row-reverse items-center gap-1.5 mr-1 flex-shrink-0">
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
                  <div className="flex flex-row-reverse gap-2 items-center pr-12 flex-shrink-0">
                    <div className="flex flex-col gap-1">
                      <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell1Id)}.png`} className="w-7 h-7 rounded border border-slate-800" alt="Spell 1" />
                      <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/spell/${getSpellName(p.spell2Id)}.png`} className="w-7 h-7 rounded border border-slate-800" alt="Spell 2" />
                    </div>
                    <RuneSection p={p} isRed={true} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center space-y-3 animate-in slide-in-from-top-4 duration-500">
          {selectedPuuid && (
            <>
              <div className="flex items-center justify-between w-full max-w-4xl px-2">
                <h4 className="text-xl font-bold flex items-center gap-3">
                  <span className="text-blue-400">{selectedPlayer?.summonerName}</span> 
                  <span className="text-slate-500 text-xs uppercase tracking-widest font-light">Recent Solo/Duo History</span>
                </h4>
                <button onClick={() => setSelectedPuuid(null)} className="text-slate-500 hover:text-white text-xs uppercase font-bold tracking-widest">Close ✕</button>
              </div>
              
              {selectedPlayer?.history?.length > 0 ? (
                selectedPlayer.history.map((match, i) => (
                  <div key={i} className={`flex items-center h-24 w-full max-w-4xl rounded-lg border bg-slate-900/80 backdrop-blur-md overflow-hidden transition-all ${match.win ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
                    <div className={`w-1 h-full ${match.win ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    
                    <div className="flex items-center gap-3 px-3"> 
                      <div className="relative">
                        <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${match.championId}.png`} className="w-14 h-14 rounded border border-slate-700 shadow-lg" alt="champ" />
                        <div className="absolute -top-1 -right-1 bg-slate-950 text-white text-[8px] font-black w-5 h-5 rounded-full border border-slate-800 flex items-center justify-center shadow-lg">
                           {match.champLevel}
                        </div>
                        <img src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${match.enemyLaner}.png`} className="w-7 h-7 rounded-full border-2 border-slate-900 absolute -bottom-1 -right-1 grayscale opacity-80" title="Opponent" />
                      </div>
                    </div>

                    <div className="flex flex-col w-24 border-r border-slate-800/50 pr-1"> 
                      <span className={`text-[9px] font-black uppercase tracking-tighter ${match.win ? 'text-emerald-400' : 'text-rose-400'}`}>{match.win ? 'Win' : 'Loss'}</span>
                      <span className="text-sm font-bold text-white truncate leading-tight">{match.champion}</span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                        {match.teamPosition === 'UTILITY' ? 'SUPPORT' : match.teamPosition}
                      </span>
                      <span className="text-[8px] text-slate-400 font-medium">
                        {formatDuration(match.game_duration)} • {formatTimeAgo(match.game_end_timestamp)}
                      </span>
                    </div>

                    <div className="flex flex-col justify-center px-4 w-28 border-r border-slate-800/50">
                      <span className="text-sm font-black tracking-tighter">{match.kills} / <span className="text-rose-500">{match.deaths}</span> / {match.assists}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{match.kda.toFixed(2)} KDA</span>
                    </div>

                    <div className="flex flex-col justify-center px-4 w-28 border-r border-slate-800/50">
                      <span className="text-[10px] text-slate-200 font-bold">{match.cs_per_min.toFixed(1)} CS/M</span>
                      <span className="text-[10px] text-amber-500/90 font-bold">{match.gold_share.toFixed(1)} Gold%</span>
                      <span className="text-[10px] text-rose-400/90 font-bold">{match.dmg_share.toFixed(1)} Damage%</span>
                      <span className="text-[10px] text-yellow-400 font-bold">{match.challenges?.goldPerMinute?.toFixed(1) || "0.0"} G/M</span>
                      <span className="text-[10px] text-indigo-400 font-bold">{match.challenges?.visionScorePerMinute?.toFixed(2) || "0.00"} VS/M</span>
                    </div>
                    <div className="flex-1 px-4 flex flex-wrap content-center gap-1 overflow-hidden">
                      {match.timePlayed > 180 ? (
                        getPerformanceTags(match).map((tag, idx) => (
                          <span 
                            key={idx} 
                            className="px-1.5 py-0.5 rounded bg-slate-950/60 border border-slate-800 text-[8px] font-bold text-blue-400/80 uppercase tracking-tighter whitespace-nowrap"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-950/40 border border-rose-500/50 text-[10px] font-black text-rose-500 uppercase tracking-widest">
                          REMAKE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-4 border-l border-slate-800/50">
                      <div className="grid grid-cols-2 gap-1">
                        <img src={`https://ddragon.leagueoflegends.com/cdn/15.24.1/img/spell/${getSpellName(match.spell1)}.png`} className="w-5 h-5 rounded" title="Spell 1" />
                        <img src={`https://ddragon.leagueoflegends.com/cdn/15.24.1/img/spell/${getSpellName(match.spell2)}.png`} className="w-5 h-5 rounded" title="Spell 2" />
                        <img src={`https://ddragon.leagueoflegends.com/cdn/img/${getKeystoneInfo(match.keystoneId).icon}`} className="w-5 h-5 bg-slate-950 rounded-full p-0.5 border border-slate-800" title="Keystone" />
                        <img src={getRuneStyleIcon(match.subStyle)} className="w-4 h-4 opacity-70 m-auto" title="Secondary Tree" />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 px-4 flex-shrink-0 border-l border-slate-800/50 h-full">
                      <div className="grid grid-cols-3 grid-rows-2 gap-0.5">
                        {match.items.slice(0, 6).map((id, idx) => (
                          <div key={idx} className="w-6 h-6 bg-slate-950 rounded-sm border border-slate-800 overflow-hidden">
                            {id !== 0 && <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/item/${id}.png`} className="w-full h-full" alt="item" />}
                          </div>
                        ))}
                      </div>
                      <div className="w-6 h-6 bg-slate-950 rounded-full border border-slate-800 flex-shrink-0 overflow-hidden">
                        {match.items[6] !== 0 && <img src={`https://ddragon.leagueoflegends.com/cdn/15.23.1/img/item/${match.items[6]}.png`} className="w-full h-full rounded-full" alt="trinket" />}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-slate-900/60 p-8 rounded-lg border border-slate-800 w-full max-w-4xl text-center">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Player match history unretrievable.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveGame;