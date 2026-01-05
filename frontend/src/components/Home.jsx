import { useState } from 'react';

function Home({ onSearch, error, setError }) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('NA');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const regions = [
    { name: 'NA', value: 'na1' },
    { name: 'EUW', value: 'euw1' },
    { name: 'KR', value: 'kr' },
    // ... add others as needed
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const [name, tag] = query.split('#');
    if (name && tag) {
      onSearch({ name, tag, region: region.toLowerCase() });
    } else {
      setError("Please enter Name#Tag");
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col justify-center items-center">
      <form onSubmit={handleSubmit} className="w-full max-w-xl px-4 flex shadow-2xl">
        <div className="relative">
          <button 
            type="button" 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="h-full px-4 bg-slate-900 border border-slate-800 rounded-s-lg font-bold"
          >
            {region}
          </button>
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 bg-slate-900 border border-slate-800 rounded-lg z-50">
              {regions.map(r => (
                <button 
                  key={r.value}
                  className="block w-full px-4 py-2 hover:bg-blue-600 text-left"
                  onClick={() => { setRegion(r.name); setIsDropdownOpen(false); }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <input 
          className="w-full p-4 bg-slate-900 border-y border-r border-slate-800 outline-none focus:bg-slate-800 text-slate-100"
          placeholder="SummonerName#TAG"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 px-6 font-bold rounded-e-lg hover:bg-blue-500">Search</button>
      </form>
      {error && (
        <p className="text-red-500 text-sm mt-4 font-bold animate-pulse text-center">
            {error}
        </p>
      )}
    </div>
  );
}

export default Home;