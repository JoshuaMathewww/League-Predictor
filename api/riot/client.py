import httpx
import asyncio
from config import RIOT_API_KEY

class RiotClient:
    def __init__(self):
        # Attach key as request header
        self.headers = {"X-Riot-Token": RIOT_API_KEY}
        self.connection_limit = asyncio.Semaphore(10)
        self.client = httpx.AsyncClient(headers=self.headers, timeout=30, http2=True)

    async def _request(self, url, params=None):
        # Semaphore to limit concurrent network connections
        async with self.connection_limit:
            for attempt in range(3):
                # Send GET request and package as json 
                response = await self.client.get(url, headers=self.headers, params=params)
                # if response.is_error:
                #     print(f"DEBUG: Riot API Error {response.status_code} at {url}")
                if response.status_code == 429:
                    wait_time = int(response.headers.get("Retry-After", 2))
                    await asyncio.sleep(wait_time)
                    continue
                response.raise_for_status()
                return response.json()
    
    async def get_league_entries_harvester(self, tier: str, division: str = "I", platform: str = "na1", page: int = 1):
        queue = "RANKED_SOLO_5x5"
        url = f"https://{platform}.api.riotgames.com/lol/league/v4/entries/{queue}/{tier}/{division}"
        params = {"page": page}
        return await self._request(url, params=params)
    
    async def get_account_by_riot_id(self, name: str, tag: str, routing: str = "americas"):
        # Build Account-V1 endpoint URL by name tag 
        url = f"https://{routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{name}/{tag}"
        return await self._request(url)

    async def get_active_game_by_puuid(self, puuid: str, platform: str = "na1"):
        # Build Spectator-V5 endpoint URL by puuid 
        url = f"https://{platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/{puuid}"
        try:
            return await self._request(url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_league_entries(self, puuid: str, platform: str = "na1"):
        # Build League-V4 endpoint URL by puuid 
        url = f"https://{platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}"
        return await self._request(url)

    async def get_match_ids_by_puuid(self, puuid: str, routing: str = "americas", start: int = 0, count: int = 5, queue: int = None):
        # Build Match-V5 endpoint URL by puuid 
        url = f"https://{routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"start": start, "count": count, "queue": queue}
        return await self._request(url, params=params)

    async def get_match(self, match_id: str, routing: str = "americas"):
        # Build Match-V5 endpoint URL by match_id 
        url = f"https://{routing}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        return await self._request(url)
            
            