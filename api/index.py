from fastapi import FastAPI
from riot.client import RiotClient
from fastapi.middleware.cors import CORSMiddleware
from schemas import LiveGameResponse
import pandas as pd
import itertools
import asyncio
import joblib
import json
import os

app = FastAPI(title="League Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

riot = RiotClient()

RANK_BASELINES = {}
WIN_MODEL = None
WIN_MODEL_COLS = None
WIN_SCALER = None


# Helper to load lane data from local JSON 
def load_lanes_data():
    path = os.path.dirname(__file__)
    file_path = os.path.join(path, "lanes.json")
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        print(f"Warning: {file_path} not found.")
        return {}
    
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/account")
async def account(name: str, tag: str, routing: str = "americas"):
    return await riot.get_account_by_riot_id(name=name, tag=tag, routing=routing)

@app.get("/api/live-game")
async def live_game(name: str, tag: str, routing: str = "americas", platform: str = "na1"):
    # Get account info (PUUID)
    account = await riot.get_account_by_riot_id(name=name, tag=tag, routing=routing)

    puuid = account["puuid"]

    # Check if player is in a live game
    game = await riot.get_active_game_by_puuid(puuid=puuid, platform=platform)

    # Not in game
    if game is None:
        return {
            "in_game": False,
            "gameName": account["gameName"],
            "tagLine": account["tagLine"]
        }

    # In game
    return {
        "in_game": True,
        "game": game
    }

# Helper function for processing match history for a single player in the active game 
async def get_player_stats(p_puuid, routing, platform, count, queue):
    if p_puuid is None:
        return None, [], {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0}
    try:
        # Fetch a list of match IDs and league entries for the specific PUUID
        m_ids_data = riot.get_match_ids_by_puuid(puuid=p_puuid, routing=routing, count=count, queue=queue)
        league_data = riot.get_league_entries(puuid=p_puuid, platform=platform)
        m_ids, league_data = await asyncio.gather(m_ids_data, league_data)

        # Process Rank Info (Solo/Duo)
        solo_duo = next((item for item in league_data if item["queueType"] == "RANKED_SOLO_5x5"), None)
        if solo_duo:
            wins = solo_duo["wins"]
            losses = solo_duo["losses"]
            total_games = wins + losses
            winrate = round((wins / total_games) * 100, 1) if total_games > 0 else 0
            
            rank_info = {
                "tier": solo_duo["tier"],
                "rank": solo_duo["rank"],
                "lp": solo_duo["leaguePoints"],
                "wins": wins,
                "losses": losses,
                "winrate": winrate 
            }
        else:
            rank_info = {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0}

        # Send match detail requests at once for this player using the get_match semaphores gatekeeping under Riots rate limit 
        match_details = await asyncio.gather(*[riot.get_match(match_id=mid, routing=routing) for mid in m_ids])
        
        player_history = []
        # Process each match found in the details list
        for m_data in match_details:
            if m_data:
                # Find only the data for current player out of the 10 in that match
                stats = next(p for p in m_data["info"]["participants"] if p["puuid"] == p_puuid)
                # Calculate team total gold, damage, and kills 
                team_id = stats["teamId"]
                team_members = [p for p in m_data["info"]["participants"] if p["teamId"] == team_id]
                total_team_gold = sum(p["goldEarned"] for p in team_members)
                total_team_damage = sum(p["totalDamageDealtToChampions"] for p in team_members)
                total_team_kills = sum(p["kills"] for p in team_members)

                # Gold Share % 
                gold_share = round((stats["goldEarned"] / max(1, total_team_gold)) * 100, 1)
                
                # Damage Share % 
                dmg_share = round((stats["totalDamageDealtToChampions"] / max(1, total_team_damage)) * 100, 1)
                
                # Kill Participation %
                kp = round(((stats["kills"] + stats["assists"]) / max(1, total_team_kills)) * 100, 1)
                game_duration_mins = m_data["info"]["gameDuration"] / 60
                cs_per_min = (stats["totalMinionsKilled"] + stats["neutralMinionsKilled"]) / max(1, game_duration_mins)

                enemyChampId = -1
                current_pos = stats.get("teamPosition")
                if current_pos and current_pos != "" and current_pos != "NONE":
                    enemyLaner = next((p for p in m_data["info"]["participants"] if p["teamPosition"] == current_pos and p["teamId"] != team_id), None)
                    if enemyLaner:
                        enemyChampId = enemyLaner["championId"]

                player_history.append({
                    "win": stats["win"],
                    "champion": stats["championName"],
                    "championId": stats["championId"],
                    "teamPosition": stats["teamPosition"],
                    "enemyLaner": enemyChampId,
                    "champLevel": stats["champLevel"],
                    "kills": stats["kills"],
                    "deaths": stats["deaths"],
                    "assists": stats["assists"],
                    "kill_participation": kp,
                    "gold_earned": stats["goldEarned"],
                    "gold_share": gold_share,
                    "cs_per_min": cs_per_min,
                    "dmg_share": dmg_share,
                    "turret_kills": stats["turretKills"],
                    "wards_placed": stats["wardsPlaced"],
                    "wards_killed": stats["wardsKilled"],
                    "total_damage_dealt_to_champions": stats["totalDamageDealtToChampions"],
                    "true_damage_dealt_to_champions": stats["trueDamageDealtToChampions"],
                    "total_time_cc_dealt": stats["totalTimeCCDealt"],
                    "kda": (stats["kills"] + stats["assists"]) / max(1, stats["deaths"]),
                    "items": [stats[f"item{i}"] for i in range(7)],
                    "spell1": stats["summoner1Id"],
                    "spell2": stats["summoner2Id"],
                    "primaryStyle": stats["perks"]["styles"][0]["style"],
                    "subStyle": stats["perks"]["styles"][1]["style"],
                    "keystoneId": stats["perks"]["styles"][0]["selections"][0]["perk"],
                    "challenges": stats.get("challenges", {}),
                    "timePlayed": stats["timePlayed"],
                    "game_duration": m_data["info"]["gameDuration"], 
                    "game_end_timestamp": m_data["info"]["gameEndTimestamp"]
                })    
        # Return a tuple so the main function can map history and rank to the correct PUUID
        return p_puuid, player_history, rank_info
    except Exception as e:
        print(f"Error fetching stats for {p_puuid}: {e}")
        return p_puuid, [], {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0}
    
MODEL_FEATURES = [
    "kills_pm", "deaths_pm", "assists_pm", "kda", "kp", 
    "total_dmg_pm", "true_dmg_pm", "cspm", "lane_cs_10", 
    "vspm", "wards_placed", "wards_killed", "total_cc_pm",
    "skillshots_hit", "skillshots_dodged"
]

MODEL_FEATURES = [
    "kills_pm", "deaths_pm", "assists_pm", "kda", "kp", 
    "total_dmg_pm", "true_dmg_pm", "cspm", "lane_cs_10", 
    "vspm", "wards_placed", "wards_killed", "total_cc_pm",
    "skillshots_hit", "skillshots_dodged"
]

def load_rank_baselines():
    global RANK_BASELINES
    try:    
        gold_averages_path = os.path.join(os.path.dirname(__file__), "gold_averages.csv")
        df = pd.read_csv(gold_averages_path)
        RANK_BASELINES = df.groupby("role")[MODEL_FEATURES].mean().to_dict('index')
        print(f"DEBUG: Baselines loaded successfully.")
    except Exception as e:
        print(f"ERROR: Could not load baselines: {e}")

def calculate_player_average(history, target_role, rank_avgs):
    role_matches = [m for m in history if m["teamPosition"] == target_role]
    autofilled = not any(m.get("teamPosition") == target_role for m in history)
    if len(role_matches) < 1:
        if rank_avgs:
            return rank_avgs, True
        return None

    averages = {}
    total_weight = 0
   
    # Decay weighting: most recent games (start of list) carry more weight
    for i, match in enumerate(role_matches):
        weight = 1.0 / (i + 1)  # Simple decay 1, 0.5, 0.33...
        total_weight += weight
        ch = match.get("challenges", {})
        dur = max(1, match.get("game_duration", 0) / 60)
        
        # Mapping live match history fields to model features
        match_stats = {
            "kills_pm": match["kills"] / dur,
            "deaths_pm": match["deaths"] / dur,
            "assists_pm": match["assists"] / dur,
            "kda": ch.get("kda", 0),
            "kp": ch.get("killParticipation", 0),
            "total_dmg_pm": match["total_damage_dealt_to_champions"] / dur,
            "true_dmg_pm": match["true_damage_dealt_to_champions"] / dur,
            "cspm": match["cs_per_min"],
            "lane_cs_10": ch.get("laneMinionsFirst10Minutes", 0),
            "vspm": ch.get("visionScorePerMinute", 0),
            "wards_placed": match.get("wards_placed", 0),
            "wards_killed": match.get("wards_killed", 0),
            "total_cc_pm": match.get("total_time_cc_dealt", 0) / dur,
            "skillshots_hit": ch.get("skillshotsHit", 0),
            "skillshots_dodged": ch.get("skillshotsDodged", 0)
        }

        for feature in MODEL_FEATURES:
            averages[feature] = averages.get(feature, 0) + (match_stats.get(feature, 0) * weight)

    # Finalize weighted mean
    return {k: v / total_weight for k, v in averages.items()}, autofilled
    
# Helper to sort participants 
def sort_participants_by_lane(participants):
    # sorted = { TOP: null, JNG: null, MID: null, BOT: null, SUP: null }
    sorted_map = {"TOP": None, "JNG": None, "MID": None, "BOT": None, "SUP": None}
    remaining = list(participants)

    # Lock jungle remove first smite user from remaining
    jng_idx = next((i for i, p in enumerate(remaining) if p.get("spell1Id") == 11 or p.get("spell2Id") == 11), -1)
     # If no smite pick best JNG probability
    if jng_idx == -1 and remaining:
        jng_idx = max(range(len(remaining)), key=lambda i: float((remaining[i].get("laneProbabilities") or {}).get("JNG", 0) or 0))
    if jng_idx != -1:
        sorted_map["JNG"] = remaining.pop(jng_idx)

    roles = ["TOP", "MID", "BOT", "SUP"]

    # the 4 non jungle players (preserve their current order)
    players = remaining[:4]

    best_order = roles
    best_score = float("-inf")

    # permute roles, not players (matches JS)
    for order in itertools.permutations(roles):
        score = 0.0
        for i in range(len(players)):
            score += float((players[i].get("laneProbabilities") or {}).get(order[i], 0) or 0)
        if score > best_score:
            best_score = score
            best_order = list(order)

    # Assign based on best role permutation
    for i in range(len(players)):
        sorted_map[best_order[i]] = players[i]

    # Return in fixed lane order + any leftovers
    final_list = [sorted_map["TOP"], sorted_map["JNG"], sorted_map["MID"], sorted_map["BOT"], sorted_map["SUP"]]
    final_list = [p for p in final_list if p is not None]

    return final_list + remaining[len(players):] if len(final_list) < 5 else final_list

def load_prediction_model():
    global WIN_MODEL, WIN_MODEL_COLS,  WIN_SCALER  
    try:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        
        model_path = os.path.join(BASE_DIR, "gold_model.pkl")
        cols_path = os.path.join(BASE_DIR, "gold_model_cols.pkl")
        scaler_path = os.path.join(BASE_DIR, "gold_scaler.pkl")
        if os.path.exists(model_path) and os.path.exists(cols_path):
            WIN_MODEL = joblib.load(model_path)
            WIN_MODEL_COLS = joblib.load(cols_path)
            WIN_SCALER = joblib.load(scaler_path)
            print(f"SUCCESS: Win model loaded ({len(WIN_MODEL_COLS)} cols).")
    except Exception as e:
        print(f"ERROR loading model: {e}")

def calculate_win_probability(participants):
    if WIN_MODEL is None or WIN_MODEL_COLS is None:
        return 0.5

    blue_team = {p["assignedRole"]: p["averages"] for p in participants if p["teamId"] == 100}
    red_team = {p["assignedRole"]: p["averages"] for p in participants if p["teamId"] == 200}
    roles_order = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
    
    row = {}
    for role in roles_order:
        for feat in MODEL_FEATURES:
            col = f"diff_{role.lower()}_{feat}"
            b_val = blue_team.get(role, {}).get(feat, 0)
            r_val = red_team.get(role, {}).get(feat, 0)
            row[col] = b_val - r_val

    X = pd.DataFrame([row])
    X = X.reindex(columns=WIN_MODEL_COLS, fill_value=0.0)
    X_scaled = WIN_SCALER.transform(X)
    try:
        pred = WIN_MODEL.predict_proba(X_scaled)[0][1]
        return float(round(pred, 4))
    except Exception as e:
        print(f"Prediction Error: {e}")
        return 0.5

# Load avg ranks immediately at startup
load_rank_baselines()
load_prediction_model()
# @app.get("/api/live-game-history", response_model=LiveGameResponse)
@app.get("/api/live-game-history")
async def live_game_history(name: str, tag: str, routing: str = "americas", platform: str = "na1", count: int = 7, queue: int = 420):
    global WIN_MODEL, RANK_BASELINES
    if WIN_MODEL is None:
        load_prediction_model()
    if not RANK_BASELINES:
        load_rank_baselines()
    account = await riot.get_account_by_riot_id(name=name, tag=tag, routing=routing)
    game = await riot.get_active_game_by_puuid(puuid=account["puuid"], platform=platform)
    
    if game is None:    
        return {"in_game": False}

    lane_probs = load_lanes_data()

    tasks = []
    for p in game["participants"]:
        # Returns None or an empty string for hidden players
        current_p_puuid = p.get("puuid")
        if current_p_puuid:
            tasks.append(get_player_stats(current_p_puuid, routing, platform, count, queue))
    
    results = await asyncio.gather(*tasks)

    # Build the map using the PUUID 
    player_data_map = {}
    for puuid, hist, rank in results:
        if puuid:
            player_data_map[puuid] = {"history": hist, "rank": rank}

    # Formatting to attach lane probabilities for the sorter
    for p in game["participants"]:
        champ_id_str = str(p["championId"])
        p["laneProbabilities"] = lane_probs.get(champ_id_str, {"TOP": 0, "JNG": 0, "MID": 0, "BOT": 0, "SUP": 0})


    # Split into teams and sort
    blue_raw = [p for p in game["participants"] if p["teamId"] == 100]
    red_raw = [p for p in game["participants"] if p["teamId"] == 200]
    blue_sorted = sort_participants_by_lane(blue_raw)
    red_sorted = sort_participants_by_lane(red_raw)

    formatted_participants = []
    role_labels = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
    for team in [blue_sorted, red_sorted]:
        for i, p in enumerate(team):
            # Define PUUID for this specific iteration of the loop
            p_puuid = p.get("puuid")
            riot_id = p.get("riotId", "")
            name_part, tag_part = riot_id.split("#") if ("#" in riot_id) else (riot_id or "Hidden Player", "Hidden")

            this_role = role_labels[i]
            p_data = player_data_map.get(p_puuid, {"history": [], "rank": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "winrate": 0}})
            # Load rank averages from hidden players
            rank_avgs_role = RANK_BASELINES.get(this_role)
            avg_stats, autofilled = calculate_player_average(p_data["history"], this_role, rank_avgs_role)
            # print(f"DEBUG: Calculated averages for role {this_role} : {avg_stats}")
            
            formatted_participants.append({
                "puuid": p_puuid ,
                "teamId": p["teamId"],
                "championId": p["championId"],
                "summonerName": name_part,
                "tagLine": tag_part,
                "assignedRole": this_role,
                "bot": p.get("bot", False),
                "spell1Id": p["spell1Id"],
                "spell2Id": p["spell2Id"],
                "perks": p.get("perks", {}),
                "perkStyle": p.get("perks", {}).get("perkStyle"),
                "perkSubStyle": p.get("perks", {}).get("perkSubStyle"),
                "keystoneId": p.get("perks", {}).get("perkIds", [0])[0],
                "history": p_data["history"], 
                "rank": p_data["rank"],
                "averages": avg_stats,
                "autofilled": autofilled,
                "laneProbabilities": p["laneProbabilities"]
            })

    for team_id in (100, 200):
        roles = [p["assignedRole"] for p in formatted_participants if p["teamId"] == team_id]
        if sorted(roles) != sorted(["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"]):
            print("ROLE ASSIGNMENT BAD:", team_id, roles)

    win_prob = calculate_win_probability(formatted_participants)
    print(win_prob)

    return {
        "in_game": True,
        "prediction": win_prob,
        "game_id": game["gameId"],
        "game_mode": game["gameMode"],
        "game_queue_id": game["gameQueueConfigId"],
        "game_start_time": game["gameStartTime"],
        "game_length": game["gameLength"],
        "banned_champions": game.get("bannedChampions", []),
        "participants": formatted_participants 
    }

# Sequential requests 
# @app.get("/api/live-game-history")
# async def live_game_history(name: str, tag: str, routing: str = "americas", platform: str = "na1", count: int = 5):
#     # 1. Get account and live game
#     account = await riot.get_account_by_riot_id(name=name, tag=tag, routing=routing)
#     game = await riot.get_active_game_by_puuid(puuid=account["puuid"], platform=platform)
    
#     if game is None:
#         return {"in_game": False}

#     # 2. Map participants for the AI model
#     # We want to return: { "puuid_1": [match1, match2...], "puuid_2": [...] }
#     player_histories = {}
    
#     for participant in game["participants"]:
#         p_puuid = participant["puuid"]
        
#         # Fetch the last 5 match IDs for THIS specific player
#         m_ids = await riot.get_match_ids_by_puuid(puuid=p_puuid, routing=routing, count=count)
        
#         player_matches = []
#         for mid in m_ids:
#             m_data = await riot.get_match(match_id=mid, routing=routing)
#             if m_data:
#                 # Find this specific player's stats inside the match
#                 stats = next(p for p in m_data["info"]["participants"] if p["puuid"] == p_puuid)
                
#                 player_matches.append({
#                     "win": stats["win"],
#                     "gold_earned": stats["goldEarned"],
#                     "cs_per_min": (stats["totalMinionsKilled"] + stats["neutralMinionsKilled"]) / (m_data["info"]["gameDuration"] / 60),
#                     "turret_kills": stats["turretKills"],
#                     "kda": (stats["kills"] + stats["assists"]) / max(1, stats["deaths"])
#                 })

#         player_histories[p_puuid] = player_matches

#     return {
#         "in_game": True,
#         "game_id": game["gameId"],
#         "player_data": player_histories
#     }