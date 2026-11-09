import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePokemonList } from '../hooks/usePokemonList';
import InfiniteScrollTrigger from './InfiniteScrollTrigger';
import PokemonCard from './PokemonCard';
import SearchBar from './SearchBar';
import GenerationButtons from './GenerationButtons';

const TYPE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'normal', label: '노말' },
  { value: 'fire', label: '불꽃' },
  { value: 'water', label: '물' },
  { value: 'electric', label: '전기' },
  { value: 'grass', label: '풀' },
  { value: 'ice', label: '얼음' },
  { value: 'fighting', label: '격투' },
  { value: 'poison', label: '독' },
  { value: 'ground', label: '땅' },
  { value: 'flying', label: '비행' },
  { value: 'psychic', label: '에스퍼' },
  { value: 'bug', label: '벌레' },
  { value: 'rock', label: '바위' },
  { value: 'ghost', label: '고스트' },
  { value: 'dragon', label: '드래곤' },
  { value: 'dark', label: '악' },
  { value: 'steel', label: '강철' },
  { value: 'fairy', label: '페어리' },
];

const REGION_NAMES = {
  all: '범박사의 포켓몬 도감',
  1: '관동지방',
  2: '성도지방',
  3: '호연지방',
  4: '신오지방',
  5: '하나지방',
  6: '칼로스지방',
  7: '알로라지방',
  8: '가라르지방',
  9: '팔데아지방',
};

const TYPE_NAMES = Object.fromEntries(
  TYPE_OPTIONS.slice(1).map((type) => [type.value, type.label]),
);

function getRegionName(generation) {
  return REGION_NAMES[generation] || REGION_NAMES.all;
}

function getKoreanTypeName(type) {
  return TYPE_NAMES[type] || type;
}

function PokemonList() {
  const navigate = useNavigate();
  const [selectedGeneration, setSelectedGeneration] = useState(null);
  const [showDex, setShowDex] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(['all']);
  const {
    pokemons,
    isLoading,
    isFetching,
    hasMore,
    error,
    loadMore,
  } = usePokemonList(selectedGeneration);

  useEffect(() => {
    const generationFromUrl = new URLSearchParams(window.location.search).get('generation');
    if (!generationFromUrl) return;

    setSelectedGeneration(generationFromUrl === 'all' ? 'all' : Number(generationFromUrl));
    setShowDex(true);
  }, []);

  const filteredPokemons = useMemo(() => pokemons.filter((pokemon) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesName = pokemon.koreanName.toLowerCase().includes(normalizedSearch)
      || pokemon.name.toLowerCase().includes(normalizedSearch);
    const matchesType = selectedTypes.includes('all')
      || selectedTypes.every((type) => pokemon.types.includes(type));
    return matchesName && matchesType;
  }), [pokemons, searchTerm, selectedTypes]);

  useEffect(() => {
    const pokemonId = new URLSearchParams(window.location.search).get('pokemonId');
    if (!pokemonId || filteredPokemons.length === 0) return;

    const card = document.querySelector(`[data-pokemon-id="${pokemonId}"]`);
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const params = new URLSearchParams(window.location.search);
    params.delete('pokemonId');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [filteredPokemons]);

  const handleGenerationClick = (generation) => {
    setSelectedGeneration(generation);
    setSearchTerm('');
    setSelectedTypes(['all']);
    setShowDex(true);
    navigate(`/?generation=${generation}`);
  };

  const handleTypeToggle = (type) => {
    setSelectedTypes((previous) => {
      if (type === 'all' || previous.includes('all')) return [type];
      if (previous.includes(type)) {
        const remaining = previous.filter((selectedType) => selectedType !== type);
        return remaining.length ? remaining : ['all'];
      }
      if (previous.length < 2) return [...previous, type];
      return previous;
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedTypes(['all']);
  };

  const handleBackToGeneration = () => {
    setShowDex(false);
    setSelectedGeneration(null);
    setSearchTerm('');
    setSelectedTypes(['all']);
    navigate('/');
  };

  const handlePokemonClick = (pokemon) => {
    navigate(`/pokemon/${pokemon.id}?generation=${selectedGeneration}&pokemonId=${pokemon.id}`);
  };

  if (!showDex) {
    return (
      <div className="app generation-select-screen generation-select">
        <h1>범박사의 포켓몬 도감</h1>
        <GenerationButtons selected={selectedGeneration} onClick={handleGenerationClick} vertical />
      </div>
    );
  }

  if (isLoading && pokemons.length === 0) {
    return (
      <div className={`app generation-${selectedGeneration}`}>
        <button className="back-btn" onClick={handleBackToGeneration}>← 세대 선택으로 돌아가기</button>
        <h1>{getRegionName(selectedGeneration)}</h1>
        <div className="loading">포켓몬 데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`app generation-${selectedGeneration}`}>
        <button className="back-btn" onClick={handleBackToGeneration}>← 세대 선택으로 돌아가기</button>
        <h1>{getRegionName(selectedGeneration)}</h1>
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className={`app generation-${selectedGeneration}`}>
      <button className="back-btn" onClick={handleBackToGeneration}>← 세대 선택으로 돌아가기</button>
      <h1>{getRegionName(selectedGeneration)}</h1>
      <SearchBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedTypes={selectedTypes}
        typeOptions={TYPE_OPTIONS}
        onTypeToggle={handleTypeToggle}
        onReset={resetFilters}
        resultCount={filteredPokemons.length}
      />
      <div className="pokemon-grid">
        {filteredPokemons.map((pokemon) => (
          <PokemonCard
            key={pokemon.id}
            pokemon={pokemon}
            onClick={handlePokemonClick}
            getKoreanTypeName={getKoreanTypeName}
          />
        ))}
      </div>
      {isFetching && <div className="loading">로딩 중...</div>}
      <InfiniteScrollTrigger enabled={!isFetching && hasMore} onIntersect={loadMore} />
      {filteredPokemons.length === 0 && !isFetching && (
        <div className="no-results">검색 결과가 없습니다.</div>
      )}
    </div>
  );
}

export default PokemonList;
