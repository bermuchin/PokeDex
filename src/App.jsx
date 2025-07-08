import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import './App.css'

const API_BASE_URL = 'https://pokedex-1ult.onrender.com/api';

const GENERATION_LIST = [
  { id: 'all', label: '전국도감' },
  { id: 1, label: '1세대(관동)' },
  { id: 2, label: '2세대(성도)' },
  { id: 3, label: '3세대(호연)' },
  { id: 4, label: '4세대(신오)' },
  { id: 5, label: '5세대(하나)' },
  { id: 6, label: '6세대(칼로스)' },
  { id: 7, label: '7세대(알로라)' },
  { id: 8, label: '8세대(가라르)' },
  { id: 9, label: '9세대(팔데아)' },
]

// 세대별 지방 이름 매핑
const getRegionName = (generationId) => {
  const regionNames = {
    'all': '범박사의 포켓몬 도감',
    1: '관동지방',
    2: '성도지방',
    3: '호연지방',
    4: '신오지방',
    5: '하나지방',
    6: '칼로스지방',
    7: '알로라지방',
    8: '가라르지방',
    9: '팔데아지방'
  };
  return regionNames[generationId] || '범박사의 포켓몬 도감';
};

// 포켓몬 상세 페이지 컴포넌트
function PokemonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pokemon, setPokemon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('abilities');

  useEffect(() => {
    const fetchPokemon = async () => {
      try {
        setLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL;
        const response = await fetch(`${apiUrl}/api/pokemons/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch pokemon');
        }
        const data = await response.json();
        setPokemon(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pokemon:', err);
        setError('포켓몬 정보를 불러오는데 실패했습니다.');
        setLoading(false);
      }
    };

    fetchPokemon();
  }, [id]);

  const handleBack = () => {
    // URL에서 세대 정보를 가져오거나, 기본값으로 'all' 사용
    const searchParams = new URLSearchParams(window.location.search);
    const generation = searchParams.get('generation') || 'all';
    navigate(`/?generation=${generation}`);
  };

  // 상성 정보 계산
  // 타입 상성 차트를 상수로 분리
  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
  };

  const getTypeEffectiveness = (attackingType, defendingTypes) => {
    let effectiveness = 1;
    defendingTypes.forEach(defendingType => {
      if (TYPE_CHART[attackingType] && TYPE_CHART[attackingType][defendingType] !== undefined) {
        effectiveness *= TYPE_CHART[attackingType][defendingType];
      }
    });
    return effectiveness;
  };

  // 모든 타입 배열을 상수로 분리
  const ALL_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

  const getOffensiveMatchups = () => {
    if (!pokemon) return [];
    
    const matchups = [];
    
    pokemon.types.forEach(attackingType => {
      ALL_TYPES.forEach(defendingType => {
        const effectiveness = getTypeEffectiveness(attackingType, [defendingType]);
        if (effectiveness !== 1) {
          matchups.push({
            attackingType,
            defendingType,
            effectiveness,
            koreanAttackingType: getKoreanTypeName(attackingType),
            koreanDefendingType: getKoreanTypeName(defendingType)
          });
        }
      });
    });
    
    return matchups.sort((a, b) => b.effectiveness - a.effectiveness);
  };

  const getDefensiveMatchups = () => {
    if (!pokemon) return [];
    
    // 한국어 타입명을 미리 계산
    const koreanDefendingTypes = pokemon.types.map(type => getKoreanTypeName(type)).join(', ');
    
    return ALL_TYPES.map(attackingType => ({
      attackingType,
      effectiveness: getTypeEffectiveness(attackingType, pokemon.types),
      koreanAttackingType: getKoreanTypeName(attackingType),
      koreanDefendingType: koreanDefendingTypes
    })).sort((a, b) => b.effectiveness - a.effectiveness);
  };

  if (loading) {
    return (
      <div className="app">
        <button className="back-btn" onClick={handleBack}>← 뒤로 가기</button>
        <div className="loading">로딩 중...</div>
      </div>
    );
  }

  if (error || !pokemon) {
    return (
      <div className="app">
        <button className="back-btn" onClick={handleBack}>← 뒤로 가기</button>
        <div className="error">{error || '포켓몬을 찾을 수 없습니다.'}</div>
      </div>
    );
  }

  return (
    <div className={`app pokemon-detail-page type-${pokemon.types[0]}`}>
      <button className="back-btn" onClick={handleBack}>← 뒤로 가기</button>
      <div className="pokemon-detail-container">
        <div className="pokemon-detail-header">
          <img src={pokemon.image} alt={pokemon.koreanName} />
          <div className="pokemon-detail-info">
            <h2>{pokemon.koreanName}</h2>
            <p className="pokemon-number">#{pokemon.id.toString().padStart(3, '0')}</p>
            <div className="types">
              {pokemon.types.map((type) => (
                <span key={type} className={`type ${type}`}>
                  {getKoreanTypeName(type)}
                </span>
              ))}
            </div>
          </div>
        </div>
        
        {/* 기본 정보 */}
        <div className="basic-info">
          <div className="stat-row">
            <span className="stat-label">키:</span>
            <span className="stat-value">{pokemon.height}m</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">몸무게:</span>
            <span className="stat-value">{pokemon.weight}kg</span>
          </div>
        </div>

        {/* 탭 시스템 */}
        <div className="tab-container">
          <div className="tab-buttons">
            <button 
              className={`tab-button ${activeTab === 'abilities' ? 'active' : ''}`}
              onClick={() => setActiveTab('abilities')}
            >
              특성
            </button>
            <button 
              className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              능력치
            </button>
            <button 
              className={`tab-button ${activeTab === 'matchups' ? 'active' : ''}`}
              onClick={() => setActiveTab('matchups')}
            >
              배틀 상성
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'abilities' && (
              <div className="abilities">
                {pokemon.abilities.map((ability, index) => (
                  <div key={index} className={`ability ${ability.isHidden ? 'hidden' : 'normal'}`}>
                    <div className="ability-header">
                      <span className="ability-name">{getKoreanAbilityName(ability.name)}</span>
                      {ability.isHidden && <span className="hidden-badge">숨겨진 특성</span>}
                    </div>
                    <div className="ability-description">{ability.description}</div>
                  </div>
                ))}
              </div>
            )}
            
            {activeTab === 'stats' && (
              <div className="stats-content">
                {pokemon.stats.map((stat) => (
                  <div key={stat.name} className="stat-row">
                    <span className="stat-label">{getKoreanStatName(stat.name)}:</span>
                    <span className="stat-value">{stat.value}</span>
                    <div className="stat-bar">
                      <div
                        className={`stat-bar-fill ${pokemon.types[0]}`}
                        style={{ width: `${(stat.value / 255) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
                <div className="stat-row stat-total-row">
                  <span className="stat-label">총합:</span>
                  <span className="stat-value stat-total-value">{pokemon.stats.reduce((sum, stat) => sum + stat.value, 0)}</span>
                </div>
              </div>
            )}
            
            {activeTab === 'matchups' && (
              <div className="matchups-content">
                <div className="matchups-section">
                  <h4>공격 시 상성</h4>
                  <div className="matchups-grid">
                    {getOffensiveMatchups().map((matchup, index) => (
                      <div key={index} className={`matchup-item ${matchup.effectiveness > 1 ? 'offensive' : matchup.effectiveness < 1 && matchup.effectiveness > 0 ? 'resistant' : matchup.effectiveness === 0 ? 'immune' : 'normal'}`}>
                        <div className="matchup-info">
                          <span className="matchup-type">{matchup.koreanDefendingType}</span>
                          {pokemon.types.length > 1 && (
                            <span className="attacking-type">- {matchup.koreanAttackingType} 타입으로 공격 시</span>
                          )}
                        </div>
                        <span className="matchup-effectiveness">×{matchup.effectiveness}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="matchups-section">
                  <h4>방어 시 상성</h4>
                  <div className="matchups-grid">
                    {getDefensiveMatchups().map((matchup, index) => (
                      <div key={index} className={`matchup-item ${matchup.effectiveness > 1 ? 'weak' : matchup.effectiveness < 1 && matchup.effectiveness > 0 ? 'resistant' : matchup.effectiveness === 0 ? 'immune' : 'normal'}`}>
                        <span className="matchup-type">{matchup.koreanAttackingType}</span>
                        <span className="matchup-effectiveness">×{matchup.effectiveness}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 메인 포켓몬 목록 컴포넌트
function PokemonList() {
  const navigate = useNavigate();
  const [pokemons, setPokemons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTypes, setSelectedTypes] = useState(['all'])
  const [selectedGeneration, setSelectedGeneration] = useState(null)
  const [showDex, setShowDex] = useState(false)

  // URL에서 세대 정보를 읽어오기
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const generationFromUrl = searchParams.get('generation');
    if (generationFromUrl) {
      setSelectedGeneration(generationFromUrl);
      setShowDex(true);
    }
  }, []);

  // 세대/전국도감 선택 시 백엔드 API에서 포켓몬 정보 가져오기
  useEffect(() => {
    if (!selectedGeneration) return;
    setLoading(true);
    setPokemons([]);
    
    const apiUrl = import.meta.env.VITE_API_URL;
    const fetchPokemonsFromBackend = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/pokemons?generation=${selectedGeneration}&limit=1025`);
        if (!response.ok) {
          throw new Error('Failed to fetch pokemons');
        }
        const data = await response.json();
        setPokemons(data.pokemons);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pokemons:', err);
        setError('포켓몬 리스트를 불러오는데 실패했습니다.');
        setLoading(false);
      }
    };
    
    fetchPokemonsFromBackend();
  }, [selectedGeneration]);

  // 검색/필터 적용
  const filteredPokemons = pokemons.filter(pokemon => {
    const matchesName =
      pokemon.koreanName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pokemon.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 타입 필터링: 'all'이 선택되었거나, 선택된 모든 타입을 모두 가진 포켓몬만 통과
    const matchesType = 
      selectedTypes.includes('all') || 
      selectedTypes.every(selectedType => pokemon.types.includes(selectedType));
    
    return matchesName && matchesType;
  });

  const handlePokemonClick = (pokemon) => {
    navigate(`/pokemon/${pokemon.id}?generation=${selectedGeneration}`);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedTypes(['all']);
  };

  const handleGenerationClick = (id) => {
    setSelectedGeneration(id);
    setSearchTerm('');
    setSelectedTypes(['all']);
    setShowDex(true);
    setPokemons([]);
    // URL 업데이트
    navigate(`/?generation=${id}`);
  };

  const handleBackToGeneration = () => {
    setShowDex(false);
    setSelectedGeneration(null);
    setSearchTerm('');
    setSelectedTypes(['all']);
    setPokemons([]);
    navigate('/');
  };

  const typeOptions = [
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
    { value: 'fairy', label: '페어리' }
  ];

  if (!showDex) {
    return (
      <div className="app generation-select-screen generation-select">
        <h1>범박사의 포켓몬 도감</h1>
        <GenerationButtons selected={selectedGeneration} onClick={handleGenerationClick} vertical />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`app generation-${selectedGeneration}`}>
        <button className="back-btn" onClick={handleBackToGeneration}>← 세대 선택으로 돌아가기</button>
        <h1>{getRegionName(selectedGeneration)}</h1>
        <div className="loading">로딩 중...</div>
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
      <div className="search-container">
        <input
          type="text"
          placeholder="포켓몬 이름을 검색하세요..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="filter-container">
          <div className="type-selector">
            <label>타입 선택 (최대 2개):</label>
            <div className="type-buttons">
              {typeOptions.map(option => (
                <button
                  key={option.value}
                  className={`type-button ${option.value} ${selectedTypes.includes(option.value) ? 'selected' : ''}`}
                  onClick={() => {
                    if (option.value === 'all') {
                      setSelectedTypes(['all']);
                    } else {
                      const newTypes = selectedTypes.includes('all') 
                        ? [option.value]
                        : selectedTypes.includes(option.value)
                        ? selectedTypes.filter(t => t !== option.value)
                        : selectedTypes.length < 2 
                        ? [...selectedTypes, option.value]
                        : selectedTypes;
                      setSelectedTypes(newTypes.length === 0 ? ['all'] : newTypes);
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {(searchTerm || !selectedTypes.includes('all')) && (
            <button onClick={resetFilters} className="reset-button">
              필터 초기화
            </button>
          )}
        </div>
        {(searchTerm || !selectedTypes.includes('all')) && (
          <div className="search-results">
            검색 결과: {filteredPokemons.length}마리
            {!selectedTypes.includes('all') && (
              <span className="selected-types">
                (선택된 타입: {selectedTypes.map(type => 
                  typeOptions.find(opt => opt.value === type)?.label
                ).join(', ')})
              </span>
            )}
          </div>
        )}
      </div>
      <div className="pokemon-grid">
        {filteredPokemons.map((pokemon) => (
          <div
            key={pokemon.id}
            className="pokemon-card"
            onClick={() => handlePokemonClick(pokemon)}
          >
            <img src={pokemon.image} alt={pokemon.koreanName} />
            <h3>{pokemon.koreanName}</h3>
            <div className="types">
              {pokemon.types.map((type) => (
                <span key={type} className={`type ${type}`}>
                  {getKoreanTypeName(type)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {filteredPokemons.length === 0 && (
        <div className="no-results">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}

// 메인 App 컴포넌트
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PokemonList />} />
        <Route path="/pokemon/:id" element={<PokemonDetail />} />
      </Routes>
    </Router>
  );
}

function GenerationButtons({ selected, onClick, vertical }) {
  return (
    <div className={`generation-buttons${vertical ? ' vertical' : ''}`}>
      {GENERATION_LIST.map(gen => (
        <button
          key={gen.id}
          className={`generation-btn${selected === gen.id ? ' selected' : ''}`}
          onClick={() => onClick(gen.id)}
        >
          {gen.label}
        </button>
      ))}
    </div>
  );
}

function getKoreanTypeName(type) {
  const typeNames = {
    normal: '노말',
    fire: '불꽃',
    water: '물',
    electric: '전기',
    grass: '풀',
    ice: '얼음',
    fighting: '격투',
    poison: '독',
    ground: '땅',
    flying: '비행',
    psychic: '에스퍼',
    bug: '벌레',
    rock: '바위',
    ghost: '고스트',
    dragon: '드래곤',
    dark: '악',
    steel: '강철',
    fairy: '페어리'
  };
  return typeNames[type] || type;
}

function getKoreanStatName(stat) {
  const statNames = {
    hp: 'HP',
    attack: '공격',
    defense: '방어',
    'special-attack': '특수공격',
    'special-defense': '특수방어',
    speed: '속도'
  };
  return statNames[stat] || stat;
}

function getKoreanAbilityName(ability) {
  const abilityNames = {
    'stench': '악취',
    'drizzle': '잔비',
    'speed-boost': '가속',
    'battle-armor': '전투 무장',
    'sturdy': '옹골참',
    'damp': '습기',
    'limber': '유연',
    'sand-veil': '모래숨기',
    'static': '정전기',
    'volt-absorb': '축전',
    'water-absorb': '저수',
    'oblivious': '둔감',
    'cloud-nine': '날씨 부정',
    'compound-eyes': '복안',
    'insomnia': '불면',
    'color-change': '변색',
    'immunity': '면역',
    'flash-fire': '타오르는 불꽃',
    'shield-dust': '인분',
    'own-tempo': '마이페이스',
    'suction-cups': '흡반',
    'intimidate': '위협',
    'shadow-tag': '그림자 밟기',
    'rough-skin': '까칠한 피부',
    'wonder-guard': '불가사의 부적',
    'levitate': '부유',
    'effect-spore': '포자',
    'synchronize': '싱크로',
    'clear-body': '클리어 바디',
    'natural-cure': '자연회복',
    'lightning-rod': '피뢰침',
    'serene-grace': '하늘의 은총',
    'swift-swim': '쓱쓱',
    'chlorophyll': '엽록소',
    'illuminate': '발광',
    'trace': '트레이스',
    'huge-power': '천하장사',
    'poison-point': '독가시',
    'inner-focus': '정신력',
    'magma-armor': '마그마의 무장',
    'water-veil': '수의 베일',
    'magnet-pull': '자력',
    'soundproof': '방음',
    'rain-dish': '젖은접시',
    'sand-stream': '모래날림',
    'pressure': '프레셔',
    'thick-fat': '두꺼운 지방',
    'early-bird': '일찍 기상',
    'flame-body': '불꽃몸',
    'run-away': '도주',
    'keen-eye': '날카로운 눈',
    'hyper-cutter': '괴력집게',
    'pickup': '픽업',
    'truant': '게으름',
    'hustle': '의욕',
    'cute-charm': '헤롱헤롱 바디',
    'plus': '플러스',
    'minus': '마이너스',
    'forecast': '기분파',
    'sticky-hold': '점착',
    'shed-skin': '탈피',
    'guts': '근성',
    'marvel-scale': '이상한 비늘',
    'liquid-ooze': '해감액',
    'overgrow': '심록',
    'blaze': '맹화',
    'torrent': '급류',
    'swarm': '벌레의 알림',
    'rock-head': '돌머리',
    'drought': '가뭄',
    'arena-trap': '개미지옥',
    'vital-spirit': '의기양양',
    'white-smoke': '하얀연기',
    'pure-power': '순수한 힘',
    'shell-armor': '조가비 갑옷',
    'air-lock': '에어록',
    'tangled-feet': '갈지자걸음',
    'motor-drive': '전기엔진',
    'rivalry': '투쟁심',
    'steadfast': '불굴의 마음',
    'snow-cloak': '눈숨기',
    'gluttony': '먹보',
    'anger-point': '분노의 경혈',
    'unburden': '곡예',
    'heatproof': '내열',
    'simple': '단순',
    'dry-skin': '건조피부',
    'download': '다운로드',
    'iron-fist': '철주먹',
    'poison-heal': '포이즌힐',
    'adaptability': '적응력',
    'skill-link': '스킬링크',
    'hydration': '촉촉바디',
    'solar-power': '선파워',
    'quick-feet': '속보',
    'normalize': '노말스킨',
    'sniper': '스나이퍼',
    'magic-guard': '매직가드',
    'no-guard': '노가드',
    'stall': '시간벌기',
    'technician': '테크니션',
    'leaf-guard': '리프가드',
    'klutz': '서투름',
    'mold-breaker': '틀깨기',
    'super-luck': '대운',
    'aftermath': '유폭',
    'anticipation': '위험예지',
    'forewarn': '예지몽',
    'unaware': '천진',
    'tinted-lens': '색안경',
    'filter': '필터',
    'slow-start': '슬로스타트',
    'scrappy': '배짱',
    'storm-drain': '마중물',
    'ice-body': '아이스바디',
    'solid-rock': '하드록',
    'snow-warning': '눈퍼뜨리기',
    'honey-gather': '꿀모으기',
    'frisk': '통찰',
    'reckless': '이판사판',
    'multitype': '멀티타입',
    'flower-gift': '플라워기프트',
    'bad-dreams': '나이트메어',
    'pickpocket': '나쁜손버릇',
    'sheer-force': '우격다짐',
    'contrary': '심술꾸러기',
    'unnerve': '긴장감',
    'defiant': '오기',
    'defeatist': '무기력',
    'cursed-body': '저주받은 바디',
    'healer': '치유의 마음',
    'friend-guard': '프렌드가드',
    'weak-armor': '깨어진 갑옷',
    'heavy-metal': '헤비메탈',
    'light-metal': '라이트메탈',
    'multiscale': '멀티스케일',
    'toxic-boost': '독부스트',
    'flare-boost': '플레어부스트',
    'harvest': '수확',
    'telepathy': '텔레파시',
    'moody': '변덕쟁이',
    'overcoat': '오버코트',
    'poison-touch': '독수',
    'regenerator': '재생력',
    'big-pecks': '큰부리',
    'sand-rush': '모래허리',
    'wonder-skin': '원더스킨',
    'analytic': '애널라이즈',
    'illusion': '일루전',
    'imposter': '임포스터',
    'infiltrator': '침투',
    'mummy': '미라',
    'moxie': '자기과신',
    'justified': '정의의 마음',
    'rattled': '주눅',
    'magic-bounce': '매직미러',
    'sap-sipper': '초식',
    'prankster': '장난꾸러기',
    'sand-force': '모래의 힘',
    'iron-barbs': '철가시',
    'zen-mode': '달마모드',
    'victory-star': '승리의 별',
    'turboblaze': '터보블레이즈',
    'teravolt': '테라볼트',
    'aroma-veil': '아로마베일',
    'flower-veil': '플라워베일',
    'cheek-pouch': '볼주머니',
    'protean': '변환자재',
    'fur-coat': '퍼코트',
    'magician': '매지션',
    'bulletproof': '불릿프루프',
    'competitive': '경쟁심',
    'strong-jaw': '강한 턱',
    'refrigerate': '프리즈스킨',
    'sweet-veil': '스위트베일',
    'stance-change': '배틀스위치',
    'gale-wings': '질풍날개',
    'mega-launcher': '메가런처',
    'grass-pelt': '그래스펠트',
    'symbiosis': '공생',
    'tough-claws': '단단한 발톱',
    'pixilate': '페어리스킨',
    'gooey': '점성',
    'aerilate': '스카이스킨',
    'parental-bond': '부모의 애',
    'dark-aura': '다크오라',
    'fairy-aura': '페어리오라',
    'aura-break': '오라브레이크',
    'primordial-sea': '시작의 바다',
    'desolate-land': '끝의 대지',
    'delta-stream': '델타스트림',
    'stakeout': '잠복',
    'slush-rush': '눈치우기',
    'long-reach': '원격',
    'liquid-voice': '촉촉보이스',
    'triage': '응급처치',
    'galvanize': '일렉트릭스킨',
    'surge-surfer': '서핑테일',
    'schooling': '어군',
    'disguise': '변장',
    'battle-bond': '유대변화',
    'power-construct': '파워컨스트럭트',
    'corrosion': '부식',
    'comatose': '절대수면',
    'queenly-majesty': '여왕의 위엄',
    'innards-out': '내용물 분출',
    'dancer': '무희',
    'battery': '배터리',
    'fluffy': '복슬복슬',
    'dazzling': '환상',
    'soul-heart': '소울하트',
    'tangling-hair': '엉킨 머리',
    'receiver': '리시버',
    'power-of-alchemy': '연금술',
    'beast-boost': '비스트부스트',
    'rks-system': 'AR시스템',
    'electric-surge': '일렉트릭메이커',
    'psychic-surge': '사이코메이커',
    'grassy-surge': '그래스메이커',
    'misty-surge': '미스트메이커',
    'intrepid-sword': '불요의 검',
    'dauntless-shield': '불굴의 방패',
    'libero': '리베로',
    'ball-fetch': '볼줍기',
    'cotton-down': '솜털',
    'propeller-tail': '프로펠러테일',
    'mirror-armor': '미러아머',
    'gulp-missile': '꿀꺽미사일',
    'stalwart': '불굴의 의지',
    'steam-engine': '증기기관',
    'punk-rock': '펑크록',
    'sand-spit': '모래뿜기',
    'ice-scales': '얼음비늘',
    'ripen': '숙성',
    'ice-face': '아이스페이스',
    'power-spot': '파워스팟',
    'mimicry': '모방',
    'screen-cleaner': '스크린클리너',
    'steely-spirit': '강철정신',
    'perish-body': '멸망의 바디',
    'wandering-spirit': '떠도는 영혼',
    'gorilla-tactics': '고릴라전술',
    'neutralizing-gas': '화학변화가스',
    'pastel-veil': '파스텔베일',
    'hunger-switch': '꼬르륵스위치',
    'quick-draw': '빠른손',
    'unseen-fist': '보이지 않는 주먹',
    'curious-medicine': '기묘한 약',
    'transistor': '트랜지스터',
    'dragons-maw': '용의 턱',
    'chilling-neigh': '백의 울음',
    'grim-neigh': '흑의 울음',
    'as-one-glastrier': '하나가 된 글라스티어',
    'as-one-spectrier': '하나가 된 스펙트리어',
    'lingering-aroma': '가시지 않는 향기',
    'seed-sower': '씨뿌리기',
    'thermal-exchange': '열교환',
    'anger-shell': '분노의 껍질',
    'purifying-salt': '정화의 소금',
    'well-baked-body': '노릇노릇 바디',
    'wind-rider': '바람타기',
    'guard-dog': '파수견',
    'rocky-payload': '바위화물',
    'wind-power': '풍력발전',
    'zero-to-hero': '제로투히어로',
    'commander': '총대장',
    'electromorphosis': '전기로 바꾸기',
    'protosynthesis': '고대활성',
    'quark-drive': '쿼크차지',
    'good-as-gold': '황금몸',
    'vessel-of-ruin': '재앙의 그릇',
    'sword-of-ruin': '재앙의 검',
    'tablets-of-ruin': '재앙의 목간',
    'beads-of-ruin': '재앙의 구슬',
    'orichalcum-pulse': '진홍빛 고동',
    'hadron-engine': '하드론엔진',
    'opportunist': '기회주의',
    'cud-chew': '되새김질',
    'sharpness': '예리함',
    'supreme-overlord': '최고지배자',
    'costar': '편승',
    'toxic-debris': '독치장',
    'armor-tail': '테일아머',
    'earth-eater': '흙먹기',
    'mycelium-might': '균사의 힘',
    'minds-eye': '심안',
    'supersweet-syrup': '초스위트시럽',
    'hospitality': '환대',
    'toxic-chain': '독사슬',
    'embody-aspect': '측면 구현',
    'tera-shift': '테라체인지',
    'tera-shell': '테라셸',
    'teraform-zero': '제로포밍',
    'poison-puppeteer': '독조종',
    'mountaineer': '등산가',
    'wave-rider': '파도타기',
    'skater': '스케이터',
    'thrust': '추진',
    'perception': '지각',
    'parry': '막기',
    'instinct': '본능',
    'dodge': '회피',
    'jagged-ear': '뾰족귀',
    'divine-blessing': '신의 축복',
    'blaze-of-glory': '영광의 불꽃',
    'artificial': '인공',
    'sea-incarnate': '바다화신',
    'land-incarnate': '대지화신',
    'sky-incarnate': '하늘화신',
    'ability-all': '특성올',
    'cacophony': '시끄러운소리',
  };
  return abilityNames[ability] || ability;
}

export default App
