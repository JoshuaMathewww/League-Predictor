import pandas as pd
import asyncio
from app.riot.client import RiotClient

ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]

# All  numeric fields to diff in the model row
# Exclude match_id, team_id, role, win, rank_context
DIFF_KEYS = [
    # --- COMBAT IMPACT ---
    "kills_pm", "deaths_pm", "assists_pm", "kda", "kp", "dmg_share",
    "total_dmg_pm", "true_dmg_pm", "killing_sprees", "bounty_level",

    # --- ECONOMY & GROWTH ---
    "gold_pm", "gold_share", "gold_spent_pm", "cspm", "lane_cs_10", "items_purchased",

    # --- DEFENSE & SAFETY ---
    "survived_low_hp", "self_mitigated_pm", "dmg_taken_percentage",
    "time_dead_percentage", "total_heal_pm",

    # --- OBJECTIVES & PRESSURE ---
    "dmg_to_buildings", "dmg_to_objectives", "turret_kills", "obj_stolen",
    "dragon_kills", "baron_kills", "first_blood_kill", "first_tower_kill",
    "turret_plates",

    # --- UTILITY & VISION ---
    "vspm", "vision_adv", "wards_placed", "wards_killed", "pink_wards",
    "save_ally", "total_cc_pm",

    # --- SKILL & PINGS ---
    "skillshots_hit", "skillshots_dodged", "enemy_missing_pings",
    "on_my_way_pings", "assist_me_pings",

    # --- GAP METRICS ---
    "max_cs_adv_lane", "max_lvl_adv_lane", "lane_gold_exp_adv",
]


async def harvest_rank_data():
    client = RiotClient()
    ranks = ["GOLD"]
    target_players = 500
    # ranks = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"]

    for rank_idx, tier in enumerate(ranks, 1):
        print(f"\n--- HARVESTING {tier} ---")

        all_entries = []
        current_page = 1

        while len(all_entries) < target_players:
            page_entries = await client.get_league_entries_harvester(tier, division="III", page=current_page)
            if not page_entries: 
                print(f"No more players found for {tier} at page {current_page}.")
                break
            all_entries.extend(page_entries)
            current_page += 1

        seen_matches = set()
        avg_rows = []
        model_rows = []
        

        for entry in all_entries[:target_players]:
            puuid = entry["puuid"]
            match_ids = await client.get_match_ids_by_puuid(puuid, count=10, queue=420)
            if len(match_ids) < 10:
                print(f"[PUUID<10] puuid={puuid} got={len(match_ids)} expected=10")

            for m_id in match_ids:
                if m_id in seen_matches:
                    continue

                try:
                    match = await client.get_match(m_id)
                    if not match or match["info"]["gameMode"] != "CLASSIC":
                        continue

                    duration_sec = match["info"]["gameDuration"]
                    duration_min = duration_sec / 60
                    if duration_min < 15:
                        continue

                    participants = match["info"]["participants"]
                    # Discard match ID if any participant doesnt have valid teamPosition
                    if any(p.get("teamPosition") not in ROLES for p in participants):
                        bad = [(p.get("teamId"), p.get("teamPosition")) for p in participants if p.get("teamPosition") not in ROLES]
                        print(f"[SKIP ROLELESS] match_id={m_id} puuid={puuid} bad_roles={bad}")
                        continue
                    seen_matches.add(m_id)
                    
                    team_gold = {100: 0, 200: 0}
                    team_dmg = {100: 0, 200: 0}
                    for p in participants:
                        team_gold[p["teamId"]] += p["goldEarned"]
                        team_dmg[p["teamId"]] += p["totalDamageDealtToChampions"]

                    # Lookup team+role for lane diffs
                    by_team_role = {100: {}, 200: {}}

                    # AVERAGE row for all 10 players 
                    for p in participants:
                        role = p.get("teamPosition")
                        if role not in ROLES:
                            continue

                        ch = p.get("challenges", {})
                        t_id = p["teamId"]

                        row = {
                            "rank_context": rank_idx,
                            "match_id": m_id,
                            "team_id": t_id,
                            "role": role,
                            "win": 1 if p["win"] else 0,

                            # --- COMBAT IMPACT ---
                            "kills_pm": p["kills"] / duration_min,
                            "deaths_pm": p["deaths"] / duration_min,
                            "assists_pm": p["assists"] / duration_min,
                            "kda": ch.get("kda", 0),
                            "kp": ch.get("killParticipation", 0),
                            "dmg_share": (
                                p["totalDamageDealtToChampions"] / team_dmg[t_id]
                                if team_dmg[t_id] > 0 else 0
                            ),
                            "total_dmg_pm": p["totalDamageDealtToChampions"] / duration_min,
                            "true_dmg_pm": p["trueDamageDealtToChampions"] / duration_min,
                            "killing_sprees": p.get("killingSprees", 0),
                            "bounty_level": p.get("bountyLevel", 0),

                            # --- ECONOMY & GROWTH ---
                            "gold_pm": ch.get("goldPerMinute", 0),
                            "gold_share": (
                                p["goldEarned"] / team_gold[t_id]
                                if team_gold[t_id] > 0 else 0
                            ),
                            "gold_spent_pm": p.get("goldSpent", 0) / duration_min,
                            "cspm": (p.get("totalMinionsKilled", 0) + p.get("neutralMinionsKilled", 0)) / duration_min,
                            "lane_cs_10": ch.get("laneMinionsFirst10Minutes", 0),
                            "items_purchased": p.get("itemsPurchased", 0),

                            # --- DEFENSE & SAFETY ---
                            "survived_low_hp": ch.get("survivedSingleDigitHpCount", 0),
                            "self_mitigated_pm": p.get("damageSelfMitigated", 0) / duration_min,
                            "dmg_taken_percentage": ch.get("damageTakenOnTeamPercentage", 0),
                            "time_dead_percentage": p.get("totalTimeSpentDead", 0) / duration_sec if duration_sec > 0 else 0,
                            "total_heal_pm": p.get("totalHeal", 0) / duration_min,

                            # --- OBJECTIVES & PRESSURE ---
                            "dmg_to_buildings": p.get("damageDealtToBuildings", 0),
                            "dmg_to_objectives": p.get("damageDealtToObjectives", 0),
                            "turret_kills": p.get("turretKills", 0),
                            "obj_stolen": p.get("objectivesStolen", 0) + p.get("objectivesStolenAssists", 0),
                            "dragon_kills": p.get("dragonKills", 0),
                            "baron_kills": p.get("baronKills", 0),
                            "first_blood_kill": 1 if p.get("firstBloodKill", False) else 0,
                            "first_tower_kill": 1 if p.get("firstTowerKill", False) else 0,
                            "turret_plates": ch.get("turretPlatesTaken", 0),

                            # --- UTILITY & VISION ---
                            "vspm": ch.get("visionScorePerMinute", 0),
                            "vision_adv": ch.get("visionScoreAdvantageLaneOpponent", 0),
                            "wards_placed": p.get("wardsPlaced", 0),
                            "wards_killed": p.get("wardsKilled", 0),
                            "pink_wards": ch.get("controlWardsPlaced", 0),
                            "save_ally": ch.get("saveAllyFromDeath", 0),
                            "total_cc_pm": p.get("totalTimeCCDealt", 0) / duration_min,

                            # --- SKILL & PINGS ---
                            "skillshots_hit": ch.get("skillshotsHit", 0),
                            "skillshots_dodged": ch.get("skillshotsDodged", 0),
                            "enemy_missing_pings": p.get("enemyMissingPings", 0),
                            "on_my_way_pings": p.get("onMyWayPings", 0),
                            "assist_me_pings": p.get("assistMePings", 0),

                            # --- GAP METRICS ---
                            "max_cs_adv_lane": ch.get("maxCsAdvantageOnLaneOpponent", 0),
                            "max_lvl_adv_lane": ch.get("maxLevelLeadLaneOpponent", 0),
                            "lane_gold_exp_adv": ch.get("laningPhaseGoldExpAdvantage", 0),
                        }

                        avg_rows.append(row)
                        by_team_role[t_id][role] = row

                    # MODEL row 
                    # Need full 5v5 roles to calc diffs 
                    missing_blue = [r for r in ROLES if r not in by_team_role[100]]
                    missing_red  = [r for r in ROLES if r not in by_team_role[200]]
                    if missing_blue or missing_red:
                        print(f"[SKIP INCOMPLETE ROLES] match_id={m_id} puuid={puuid} missing_blue={missing_blue} missing_red={missing_red}")
                        continue

                    model_row = {
                        # label for training
                        "rank_context": rank_idx,
                        "match_id": m_id,
                        "blue_win": int(any(p["win"] for p in participants if p["teamId"] == 100)),
                    }

                    for role in ROLES:
                        blue = by_team_role[100][role]
                        red = by_team_role[200][role]

                        for k in DIFF_KEYS:
                            model_row[f"diff_{role.lower()}_{k}"] = blue[k] - red[k]

                    model_rows.append(model_row)

                except Exception as e:
                    print(f"[ERROR] puuid={puuid} match_id={m_id} err={type(e).__name__}: {e}")
                    continue

        # Save two files per rank
        avg_file = f"{tier.lower()}_averages.csv"
        model_file = f"{tier.lower()}_model.csv"

        pd.DataFrame(avg_rows).to_csv(avg_file, index=False)
        pd.DataFrame(model_rows).to_csv(model_file, index=False)

        print(f"SAVED {tier}:")
        print(f"  averages → {avg_file} ({len(avg_rows)} rows)")
        print(f"  model    → {model_file} ({len(model_rows)} rows)")


if __name__ == "__main__":
    asyncio.run(harvest_rank_data())