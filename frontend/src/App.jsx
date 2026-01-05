import { useState } from 'react';
import Home from './components/Home';
import LiveGame from './components/LiveGame.jsx';
import IoniaWallpaper from './assets/IoniaWallpaper.jpg';

function App() {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const performSearch = async ({ name, tag, region }) => {
    setLoading(true);
    setError(null); 
    const regionMapping = {
      'na': { routing: 'americas', platform: 'na1' },
      'euw': { routing: 'europe', platform: 'euw1' },
      'kr': { routing: 'asia', platform: 'kr' },
    };

    const selectedRegion = regionMapping[region.toLowerCase()] || regionMapping['na'];

    try {
      const response = await fetch(`http://localhost:8000/api/live-game-history?name=${name}&tag=${tag}&routing=${selectedRegion.routing}&platform=${selectedRegion.platform}`);
      if (!response.ok) {
          throw new Error("Invalid username or tag.");
      }
      const data = await response.json();
      if (!data.in_game) {
          setError("This player is not currently in an active game.");
          return;
      }
      setGameData(data);
    } catch (err) {
      setError(err.message || "Failed to find game. Please check the name and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${IoniaWallpaper})`,
          backgroundAttachment: 'fixed' 
        }}
      />
      <div className="fixed inset-0 z-[-1] bg-slate-950/70" />
      {loading ? (
        <div className="min-h-screen text-blue-500 flex items-center justify-center font-bold">
          LOADING MATCH DATA (90+ REQUESTS)...
        </div>
      ) : !gameData ? (
        <Home onSearch={performSearch} error={error} setError={setError}/>
      ) : (
        <LiveGame data={gameData} />
      )}
    </>
  );
}

export default App;