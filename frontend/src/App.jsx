import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import LiveGame from './components/LiveGame.jsx';
import SearchBar from './components/SearchBar';
import IoniaWallpaper from './assets/IoniaWallpaper.jpg';

function App() {
  return (
    <BrowserRouter>
      <div className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${IoniaWallpaper})`, backgroundAttachment: 'fixed' }} />
      <div className="fixed inset-0 z-[-1] bg-slate-950/70" />
      
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/live-game/:region/:name/:tag" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

function MainLayout() {
  const { region, name, tag } = useParams();
  const navigate = useNavigate();
  const [gameData, setGameData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef("");

  const fetchRiotData = async (n, t, r) => {
    const regionMapping = {
      'na': { routing: 'americas', platform: 'na1' },
      'euw': { routing: 'europe', platform: 'euw1' },
      'kr': { routing: 'asia', platform: 'kr' },
    };
    const selectedRegion = regionMapping[r.toLowerCase()] || regionMapping['na'];
    const response = await fetch(`http://localhost:8000/api/live-game-history?name=${n}&tag=${t}&routing=${selectedRegion.routing}&platform=${selectedRegion.platform}`);
    
    if (!response.ok) throw new Error("Could not connect to game server.");

    const data = await response.json();
    if (data.in_game === false) {
      throw new Error("This player is not currently in an active game.");
    }
    return data;
  };

  const handleSearch = async ({ name: newName, tag: newTag, region: newRegion }) => {
    setLoading(true);
    setError(null);
    setGameData(null);
    try {
      const data = await fetchRiotData(newName, newTag, newRegion);
      setGameData(data);
      lastFetched.current = `${newRegion}-${newName}-${newTag}`;
      navigate(`/live-game/${newRegion}/${newName}/${newTag}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const currentPath = `${region}-${name}-${tag}`;
    // If theres URL params and havent fetched player yet
    if (name && tag && region && currentPath !== lastFetched.current) {
      const initLoad = async () => {
        setLoading(true);
        setError(null); 
        try {
          const data = await fetchRiotData(name, tag, region);
          setGameData(data);
          lastFetched.current = currentPath;
        } catch (err) {
          setError(err.message);
          setGameData(null);
          lastFetched.current = currentPath; 
        } finally {
          setLoading(false);
        }
      };
      initLoad();
    } else if (!name) {
      setGameData(null);
      setError(null);
      lastFetched.current = "";
    }
  }, [name, tag, region]);

  return (
    <div className="min-h-screen flex flex-col items-center">
      <div className={gameData || name ? "w-full py-6" : "mt-[35vh]"}>
        <SearchBar 
          onSearch={handleSearch} 
          error={error} 
          loading={loading} 
          initialRegion={region?.toUpperCase() || 'NA'} 
          initialQuery={name && tag ? `${name}#${tag}` : ""}
        />
      </div>
      {gameData && !loading && <LiveGame data={gameData} />}
    </div>
  );
}

export default App;