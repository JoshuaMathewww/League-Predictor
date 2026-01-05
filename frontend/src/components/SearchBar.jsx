import { useState, useEffect } from 'react';

function SearchBar({ onSearch, error, loading, initialRegion = 'NA', initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [region, setRegion] = useState(initialRegion);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!query.includes('#')) {
      setLocalError("Please enter Name#TAG");
      return;
    }

    const [name, tag] = query.split('#');
    if (name && tag) {
        setLocalError(null);
        onSearch({ name, tag, region: region.toLowerCase() });
    } else {
        setLocalError("Invalid format. Use Name#TAG");
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <form onSubmit={handleSubmit} className="w-full max-w-xl px-4 flex">
        <div className="relative">
          <button 
            type="button" 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="h-full px-4 bg-slate-900 border border-slate-800 rounded-s-lg font-mono text-white hover:bg-slate-800 transition-colors"
          >
            {region}
          </button>
          {isDropdownOpen && (
            <div className="absolute top-full font-mono left-0 mt-2 bg-slate-900 border border-slate-800 rounded-lg z-50 text-white min-w-[80px]">
              {['NA', 'EUW', 'KR'].map(r => (
                <button 
                  key={r}
                  className="block w-full px-4 py-2 hover:bg-blue-600 text-left first:rounded-t-lg last:rounded-b-lg"
                  onClick={() => { setRegion(r); setIsDropdownOpen(false); }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
        <input 
          className="w-full p-4 bg-slate-900 border-y border-r border-slate-800 outline-none focus:bg-slate-800 text-slate-100"
          placeholder="Name#TAG"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={loading} className="bg-blue-600 px-6 font-mono rounded-e-lg hover:bg-blue-500 text-white transition-colors disabled:bg-blue-800">
          Search
        </button>
      </form>
      <div className="h-6 mt-2 flex items-center justify-center">
        {loading ? (
          <p className="text-blue-400 text-xs font-mono font-bold tracking-wide">Searching for active game...</p>
        ) : (error || localError) ? (
          <p className="text-red-500 text-xs font-mono font-bold text-center">{error || localError}</p>
        ) : null}
      </div>
    </div>
  );
}

export default SearchBar;