from pydantic import BaseModel
from typing import List, Optional, Any

class MatchHistory(BaseModel):
    win: bool
    champion: str
    gold_earned: int
    cs_per_min: float
    turret_kills: int
    kda: float
    items: List[int]

class Participant(BaseModel):
    puuid: Optional[str]
    teamId: int
    championId: int
    summonerName: str
    tagLine: str
    spell1Id: int
    spell2Id: int
    perks: dict  
    perkStyle: Optional[int] = None      
    perkSubStyle: Optional[int] = None   
    keystoneId: Optional[int] = None     
    history: List[MatchHistory]

class LiveGameResponse(BaseModel):
    in_game: bool
    game_id: Optional[int] = None
    game_mode: Optional[str] = None
    game_queue_id: Optional[int] = None  
    game_start_time: Optional[int] = None
    game_length: Optional[int] = None
    banned_champions: List[dict] = []
    participants: List[Participant] = []