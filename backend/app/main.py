from fastapi import FastAPI
from app.riot.client import RiotClient
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import LiveGameResponse
import asyncio
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
                
                # Special modes (ARAM/Mayhem) often have no teamPosition
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
                    "kda": (stats["kills"] + stats["assists"]) / max(1, stats["deaths"]),
                    "items": [stats[f"item{i}"] for i in range(7)],
                    "spell1": stats["summoner1Id"],
                    "spell2": stats["summoner2Id"],
                    "primaryStyle": stats["perks"]["styles"][0]["style"],
                    "subStyle": stats["perks"]["styles"][1]["style"],
                    "keystoneId": stats["perks"]["styles"][0]["selections"][0]["perk"],
                    "challenges": stats.get("challenges", {}),
                    "game_duration": m_data["info"]["gameDuration"], 
                    "game_end_timestamp": m_data["info"]["gameEndTimestamp"]
                })    
        # Return a tuple so the main function can map history and rank to the correct PUUID
        return p_puuid, player_history, rank_info
    except Exception as e:
        print(f"Error fetching stats for {p_puuid}: {e}")
        return p_puuid, [], {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0}
    
# @app.get("/api/live-game-history", response_model=LiveGameResponse)
@app.get("/api/live-game-history")
async def live_game_history(name: str, tag: str, routing: str = "americas", platform: str = "na1", count: int = 7, queue: int = 420):
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

    formatted_participants = []
    for p in game["participants"]:
        # Define PUUID for this specific iteration of the loop
        this_p_puuid = p.get("puuid")
        
        riot_id = p.get("riotId", "")
        if "#" in riot_id:
            name_part, tag_part = riot_id.split("#")
        else:
            name_part, tag_part = (riot_id or "Hidden Player", "Hidden")

        player_stats = player_data_map.get(this_p_puuid, {
            "history": [], 
            "rank": {"tier": "UNRANKED", "rank": "", "lp": 0, "wins": 0, "losses": 0, "winrate": 0}
        })

        champ_id_str = str(p["championId"])
        lane_data = lane_probs.get(champ_id_str, {"TOP": 0, "JNG": 0, "MID": 0, "BOT": 0, "SUP": 0})
        
        formatted_participants.append({
            "puuid": this_p_puuid,
            "teamId": p["teamId"],
            "championId": p["championId"],
            "summonerName": name_part,
            "tagLine": tag_part,
            "bot": p.get("bot", False),
            "spell1Id": p["spell1Id"],
            "spell2Id": p["spell2Id"],
            "perks": p.get("perks", {}),
            "perkStyle": p.get("perks", {}).get("perkStyle"),
            "perkSubStyle": p.get("perks", {}).get("perkSubStyle"),
            "keystoneId": p.get("perks", {}).get("perkIds", [0])[0] if p.get("perks") else 0,
            "history": player_stats["history"], 
            "rank": player_stats["rank"],
            "laneProbabilities": lane_data
        })

    return {
        "in_game": True,
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