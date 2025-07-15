const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cron = require('node-cron');
const pLimit = require('p-limit').default;

const app = express();
const PORT = 3002;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 캐시를 위한 메모리 저장소
const generationCache = new Map();
const evolutionCache = new Map();

// 세대별 전체 포켓몬 데이터 캐싱
const generationPokemonCache = new Map();

// 캐시 set/만료 함수
function setCacheWithExpiry(cache, key, value, ttlMs) {
  cache.set(key, value);
  setTimeout(() => cache.delete(key), ttlMs);
}

// 다음 새벽 5시(KST)까지 남은 ms 계산 함수 추가
function getMsUntilNext5amKST() {
  const now = new Date();
  // KST = UTC+9
  const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const next5amKST = new Date(nowKST);
  next5amKST.setHours(5, 0, 0, 0);
  if (nowKST >= next5amKST) {
    next5amKST.setDate(next5amKST.getDate() + 1);
  }
  // 다시 UTC 기준 ms로 변환
  return next5amKST - nowKST;
}

// 캐시 상태 확인 함수
function logCacheStatus() {
  console.log(`📊 Cache Status:`);
  console.log(`   - Generation cache: ${generationCache.size} entries`);
  console.log(`   - Generation Pokemon cache: ${generationPokemonCache.size} entries`);
  console.log(`   - Evolution cache: ${evolutionCache.size} entries`);
}

// 폼 정보 fetch/파싱 유틸 함수 분리
async function getPokemonForms(pokemonData, speciesData) {
  const forms = [];
  if (speciesData.varieties && speciesData.varieties.length > 1) {
    for (const variety of speciesData.varieties) {
      if (variety.is_default) continue;
      const formName = variety.pokemon.name.split('-').slice(1).join('-') || 'default';
      // 메테노(774) 폼 필터링: orange-meteor부터 violet-meteor까지 제외
      if (pokemonData.id === 774) {
        const formsToRemove = ['orange-meteor', 'yellow-meteor', 'green-meteor', 
                              'indigo-meteor', 'blue-meteor', 'violet-meteor'];
        if (formsToRemove.includes(formName)) {
          continue; // 이 폼은 건너뛰기
        }
      }
      // 지가르데(718) 폼 필터링: 10, 50, complete만 허용
      if (pokemonData.id === 718 && !['10', '50', 'complete'].includes(formName)) continue;
      try {
        const formResponse = await fetch(variety.pokemon.url);
        const formData = await formResponse.json();
        const koreanFormName = getKoreanFormName(formName, pokemonData.id);
        // 지가르데(718) 폼별 특성 처리
        let abilities = formData.abilities.map(ability => ({
          name: ability.ability.name,
          isHidden: ability.is_hidden,
          slot: ability.slot,
          description: getAbilityDescription(ability.ability.name)
        }));
        if (pokemonData.id === 718) {
          if (["10", "50"].includes(formName)) {
            const names = abilities.map(a => a.name);
            if (!names.includes("aura-break")) {
              abilities.push({
                name: "aura-break",
                isHidden: false,
                slot: abilities.length + 1,
                description: getAbilityDescription("aura-break")
              });
            }
            if (!names.includes("power-construct")) {
              abilities.push({
                name: "power-construct",
                isHidden: false,
                slot: abilities.length + 1,
                description: getAbilityDescription("power-construct")
              });
            }
            abilities = abilities.filter(a => a.name === "aura-break" || a.name === "power-construct");
          }
          if (["100", "complete"].includes(formName)) {
            abilities = abilities.filter(a => a.name === "power-construct");
          }
        }
        forms.push({
          name: formName,
          koreanName: koreanFormName,
          image: formData.sprites.other["official-artwork"].front_default || formData.sprites.front_default,
          types: formData.types.map(type => type.type.name),
          height: formData.height / 10,
          weight: formData.weight / 10,
          abilities: abilities,
          stats: formData.stats.map(stat => ({
            name: stat.stat.name,
            value: stat.base_stat
          }))
        });
      } catch (error) {
        console.error(`Error fetching form ${formName}:`, error);
      }
    }
  }
  return forms;
}

// getPokemonDetails에서 폼 정보 fetch/파싱 함수 사용
async function getPokemonDetails(id) {
  try {
    const [pokemonResponse, speciesResponse] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`)
    ]);
    const pokemonData = await pokemonResponse.json();
    const speciesData = await speciesResponse.json();
    const koreanName = speciesData.names.find(name => name.language.name === 'ko')?.name || pokemonData.name;
    // 폼 정보 가져오기 (함수 사용)
    const forms = await getPokemonForms(pokemonData, speciesData);
    const pokemonInfo = {
      id: pokemonData.id,
      name: pokemonData.name,
      koreanName: koreanName,
      image: pokemonData.sprites.other['official-artwork'].front_default || pokemonData.sprites.front_default,
      types: pokemonData.types.map(type => type.type.name),
      height: pokemonData.height / 10,
      weight: pokemonData.weight / 10,
      abilities: pokemonData.abilities.map(ability => ({
        name: ability.ability.name,
        isHidden: ability.is_hidden,
        slot: ability.slot,
        description: getAbilityDescription(ability.ability.name)
      })),
      stats: pokemonData.stats.map(stat => ({
        name: stat.stat.name,
        value: stat.base_stat
      })),
      forms: forms // 폼 정보 추가
    };
    return pokemonInfo;
  } catch (error) {
    console.error(`Error fetching pokemon ${id}:`, error);
    throw error;
  }
}

// 세대별 포켓몬 species만 받아오는 함수 분리
async function fetchGenerationSpecies(generation) {
  try {
    let species = [];
    if (generation === 'all') {
      const response = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025');
      const data = await response.json();
      species = data.results;
    } else {
      const response = await fetch(`https://pokeapi.co/api/v2/generation/${generation}/`);
      const data = await response.json();
      species = data.pokemon_species.sort((a, b) => {
        const getId = url => parseInt(url.split('/').filter(Boolean).pop());
        return getId(a.url) - getId(b.url);
      });
    }
    return species;
  } catch (error) {
    console.error(`Error fetching generation ${generation}:`, error);
    throw error;
  }
}

// 실패한 포켓몬만 1~2회 재시도하는 fetch 함수
async function fetchPokemonDetailWithRetry(id, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const [pokemonResponse, speciesResponse] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`)
      ]);
      const pokemonData = await pokemonResponse.json();
      const speciesData = await speciesResponse.json();
      const koreanName = speciesData.names.find(name => name.language.name === 'ko')?.name || pokemonData.name;
      return {
        id: pokemonData.id,
        name: pokemonData.name,
        koreanName,
        image: pokemonData.sprites.other['official-artwork'].front_default || pokemonData.sprites.front_default,
        types: pokemonData.types.map(type => type.type.name)
      };
    } catch (e) {
      if (i === retries) {
        console.error(`[프리페치] 포켓몬 ${id} fetch 실패 (최종)`);
        return null;
      }
      // 잠깐 대기 후 재시도 (100ms)
      await new Promise(res => setTimeout(res, 100));
    }
  }
}

// 프리페치 함수 분리 (상세 정보까지 캐싱, 전국도감은 1~9세대 합성)
async function prefetchAllGenerations() {
  const generations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let allPokemons = [];
  for (const gen of generations) {
    try {
      const cacheKey = `generation_${gen}`;
      const species = await fetchGenerationSpecies(gen);
      // 각 포켓몬의 이름, 타입, 이미지만 미리 캐싱 (실패한 포켓몬만 2회 재시도, 동시 20개 제한)
      const limit = pLimit(20);
      const pokemonDetails = await Promise.all(species.map(s => {
        const id = s.url.split('/').filter(Boolean).pop();
        return limit(() => fetchPokemonDetailWithRetry(id, 2));
      }));
      const filteredDetails = pokemonDetails.filter(Boolean);
      const msUntil5am = getMsUntilNext5amKST();
      setCacheWithExpiry(generationPokemonCache, cacheKey, filteredDetails, msUntil5am);
      allPokemons = allPokemons.concat(filteredDetails);
      // 진단 로그 추가
      console.log(`[프리페치] 세대 ${gen} species 원본 개수: ${species.length}, 실제 캐시된 포켓몬 수: ${filteredDetails.length}`);
      console.log(`[프리페치] 세대 ${gen} 상세 목록 캐시 완료 (${filteredDetails.length}마리)`);
    } catch (e) {
      console.error(`[프리페치] 세대 ${gen} 상세 목록 캐시 실패:`, e);
    }
  }
  // 전국도감(all)은 1~9세대 캐시를 합쳐서 중복 없이 생성
  const uniqueAllPokemons = Array.from(new Map(allPokemons.map(p => [p.id, p])).values());
  const msUntil5am = getMsUntilNext5amKST();
  setCacheWithExpiry(generationPokemonCache, 'generation_all', uniqueAllPokemons, msUntil5am);
  console.log(`[프리페치] 전국도감(all) 상세 목록 캐시 완료 (${uniqueAllPokemons.length}마리)`);
  console.log('[프리페치] 모든 세대 상세 목록 캐시 완료!');
}

// 매일 새벽 5시(KST)에 세대별 포켓몬 목록 캐시 미리 생성
cron.schedule('0 0 5 * * *', prefetchAllGenerations, { timezone: 'Asia/Seoul' });

// 세대별 포켓몬 목록 가져오기
async function getGenerationPokemons(generation) {
  const cacheKey = `generation_${generation}`;
  
  if (generationCache.has(cacheKey)) {
    return generationCache.get(cacheKey);
  }

  try {
    const species = await fetchGenerationSpecies(generation);
    
    // 캐시에 저장 (다음 새벽 5시(KST)까지 유효)
    const msUntil5am = getMsUntilNext5amKST();
    setCacheWithExpiry(generationCache, cacheKey, species, msUntil5am);

    return species;
  } catch (error) {
    console.error(`Error fetching generation ${generation}:`, error);
    throw error;
  }
}



function getKoreanFormName(formName, pokemonId = null) {
  if (pokemonId) {
    if (formName === 'dusk') {
      if (pokemonId === 745) return '황혼의 모습'; //루가루암
      if (pokemonId === 800) return '황혼의 갈기'; //네크로즈마
    }
    // 지가르데 폼 처리
    if (pokemonId === 718) {
      if (formName === '10') return '10%폼';
      if (formName === '100' || formName === 'complete') return '퍼펙트폼';
    }
    // 자시안과 자마젠타의 crowned 폼 처리
    if (formName === 'crowned') {
      if (pokemonId === 888) return '검왕의 모습'; // 자시안
      if (pokemonId === 889) return '방패왕의 모습'; // 자마젠타
    }
  }
  const formNames = {
    'mega': '메가진화',
    'mega-x': '메가진화 X',
    'mega-y': '메가진화 Y',
    'alola': '알로라폼',
    'galar': '가라르폼',
    'hisui': '히스이폼',
    'paldea': '팔데아폼',
    'gmax': '거다이맥스',         // 'gmax'만 남기고 'gigantamax'는 아래에
    'gigantamax': '거다이맥스',   // 혹시 PokeAPI에서 둘 다 쓸 수 있으니 남겨둠
    'therian': '영물폼',
    'incarnate': '화신폼',
    'land': '랜드폼',
    'sky': '스카이폼',
    'ash': '지우폼',
    'belle': '벨폼',
    'libre': '리브레폼',
    'phd': '박사폼',
    'pop-star': '팝스타폼',
    'rock-star': '락스타폼',
    'cosplay': '코스프레폼',
    'original': '오리지널폼',
    'attack': '어택폼',
    'defense': '디펜스폼',
    'speed': '스피드폼',
    'plant': '플랜트폼',
    'sandy': '샌디폼',
    'trash': '트래시폼',
    'red': '빨간색코어',
    'orange': '주황색코어',
    'yellow': '노란색코어',
    'green': '초록색코어',
    'indigo': '옥색코어',
    'blue': '파란색코어',
    'violet': '보라색코어',
    'white': '화이트폼',
    'black': '블랙폼',
    'standard': '스탠다드폼',
    'resolute': '리졸루트폼',
    'pirouette': '피루엣폼',
    'aria': '아리아폼',
    'step': '스텝폼',
    'baile': '바일폼',
    'pom-pom': '폼폼폼',
    'pa\'u': '파우폼',
    'sensu': '센스폼',
    'midnight': '한밤중의 모습',
    'dawn': '새벽의 날개',
    'ultra': '울트라폼',
    'eternal': '이터널폼',
    'unbound': '언바운드폼',
    'complete': '컴플리트폼',
    '10': '10%폼',
    '50': '50%폼',
    '100': '퍼펙트폼',
    'complete': '퍼펙트폼',
    'full': '풀폼',
    'small': '스몰폼',
    'large': '라지폼',
    'super': '슈퍼폼',
    'ordinary': '오디너리폼',
    'blade': '블레이드폼',
    'shield': '실드폼',
    'sun': '선폼',
    'moon': '문폼',
    'rainy': '레인니폼',
    'snowy': '스노위폼',
    'sunny': '선니폼',
    'overcast': '오버캐스트폼',
    'thunder': '썬더폼',
    'fog': '포그폼',
    'windy': '윈디폼',
    'leaves': '리브스폼',
    'fan': '팬폼',
    'frost': '프로스트폼',
    'heat': '히트폼',
    'mow': '모우폼',
    'wash': '워시폼',
    'cherry': '체리폼',
    'vanilla': '바닐라폼',
    'mint': '민트폼',
    'lemon': '레몬폼',
    'salted': '솔티드폼',
    'ruby': '루비폼',
    'sapphire': '사파이어폼',
    'emerald': '에메랄드폼',
    'amethyst': '아메시스트폼',
    'diamond': '다이아몬드폼',
    'pearl': '펄폼',
    'star': '스타폼',
    'heart': '하트폼',
    'spring': '스프링폼',
    'summer': '섬머폼',
    'autumn': '오텀폼',
    'winter': '윈터폼',
    'male': '수컷',
    'female': '암컷',
    'rapid-strike': '연격의 태세',
    'single-strike': '일격의 태세',
    'primal': '원시회귀',
    'origin': '오리진폼',
    'family-of-three':'세가족',
    'roaming':'도보폼',
    'galar-standard': '가라르폼',
    'galar-zen': '가라르 달마모드',
    'zen': '달마모드',
    'school':'군집의 모습',
    'low-key':'로우한 모습',
    'low-key-gmax':'로우한 모습 거다이맥스',
    'amped-gmax':'하이한 모습 거다이맥스',
    'noice': '나이스페이스',
    'hangry':'배고픈 모양',
    'single-strike-gmax': '일격의 태세 거다이맥스',
    'rapid-strike-gmax': '연격의 태세 거다이맥스',
    'hero':'마이티폼',
    'droopy':'늘어진 모습',
    'stretchy':'뻗은 모습',
    'wellspring-mask':'우물의 가면',
    'hearthflame-mask':'화덕의 가면',
    'cornerstone-mask':'주춧돌의 가면',
    'terastal':'테라스탈폼',
    'stellar':'스텔라폼',
    'default': '기본폼'
  };
  // 특정 포켓몬의 특수 폼 처리
  
  
  return formNames[formName] || formName;
}

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    message: 'Pokemon API Server',
    version: '1.0.0',
    endpoints: {
      pokemons: '/api/pokemons?generation=1&limit=50&offset=0',
      pokemonByIds: '/api/pokemons/ids?ids=1,2,3,4',
      singlePokemon: '/api/pokemons/:id',
      generations: '/api/generations',
      types: '/api/types',
      cacheStatus: '/api/cache/status',
      clearCache: 'POST /api/cache/clear'
    }
  });
});

// API 엔드포인트들

// 1. 세대별 포켓몬 목록 (상세 정보 포함) - 고성능 버전
app.get('/api/pokemons', async (req, res) => {
  try {
    const { generation, limit = 50, offset = 0 } = req.query;
    if (!generation) {
      return res.status(400).json({ error: 'generation parameter is required' });
    }
    const cacheKey = `generation_${generation}`;
    let pokemons = generationPokemonCache.get(cacheKey);
    if (!pokemons) {
      // 캐시가 없으면 프리페치 실행 후 재시도
      await prefetchAllGenerations();
      pokemons = generationPokemonCache.get(cacheKey) || [];
    }
    const offsetInt = parseInt(offset);
    const limitInt = parseInt(limit);
    // /api/pokemons에서 slice 방어적 처리
    const paginated = pokemons.slice(offsetInt, Math.min(offsetInt + limitInt, pokemons.length));
    res.json({
      pokemons: paginated,
      total: pokemons.length,
      limit: limitInt,
      offset: offsetInt
    });
  } catch (error) {
    console.error('Error in /api/pokemons:', error);
    res.status(500).json({ error: 'Failed to fetch pokemons' });
  }
});

// 2. 특정 ID들의 포켓몬 정보
app.get('/api/pokemons/ids', async (req, res) => {
  try {
    const { ids } = req.query;
    
    if (!ids) {
      return res.status(400).json({ error: 'ids parameter is required (comma-separated)' });
    }

    const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    if (idList.length === 0) {
      return res.status(400).json({ error: 'No valid IDs provided' });
    }

    // 최대 50개까지만 처리 (성능상 제한)
    const limitedIds = idList.slice(0, 50);
    
    const pokemonDetails = await Promise.all(
      limitedIds.map(id => getPokemonDetails(id))
    );

    res.json({
      pokemons: pokemonDetails,
      requested: idList.length,
      returned: pokemonDetails.length
    });
  } catch (error) {
    console.error('Error in /api/pokemons/ids:', error);
    res.status(500).json({ error: 'Failed to fetch pokemons by IDs' });
  }
});

// 3. 단일 포켓몬 정보
app.get('/api/pokemons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pokemon = await getPokemonDetails(id);
    res.json(pokemon);
  } catch (error) {
    console.error(`Error fetching pokemon ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch pokemon' });
  }
});

// 4. 세대 목록
app.get('/api/generations', (req, res) => {
  const generations = [
    { id: 'all', label: '전국도감' },
    { id: 1, label: '1세대(관동)' },
    { id: 2, label: '2세대(성도)' },
    { id: 3, label: '3세대(호연)' },
    { id: 4, label: '4세대(신오)' },
    { id: 5, label: '5세대(하나)' },
    { id: 6, label: '6세대(칼로스)' },
    { id: 7, label: '7세대(알로라)' },
    { id: 8, label: '8세대(가라르)' },
    { id: 9, label: '9세대(팔데아)' }
  ];
  res.json(generations);
});

// 5. 타입 목록
app.get('/api/types', (req, res) => {
  const types = [
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
  res.json(types);
});

// 6. 캐시 상태 확인
app.get('/api/cache/status', (req, res) => {
  res.json({
    generationCacheSize: generationCache.size,
    generationPokemonCacheSize: generationPokemonCache.size,
    evolutionCacheSize: evolutionCache.size,
    memoryUsage: process.memoryUsage(),
    cachedGenerations: Array.from(generationPokemonCache.keys())
  });
});

// 7. 캐시 초기화
app.post('/api/cache/clear', (req, res) => {
  generationCache.clear();
  generationPokemonCache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// 특성 설명 함수
function getAbilityDescription(abilityName) {
  const descriptions = {
    'shields-down':'껍질이 있을 때는 방어가 우수하고 모든 상태이상에 걸리지 않sms다. HP가 절반 이하가 되면 껍질을 버리고 공격에 특화된 폼이 된다.',
    'stench': '악취로 인해 상대가 도망칠 확률이 높아진다.',
    'drizzle': '배틀 시작 시 비를 내리게 한다.',
    'speed-boost': '매 턴마다 스피드가 올라간다.',
    'battle-armor': '급소에 맞지 않는다.',
    'sturdy': '한 번의 공격으로 기절하지 않는다.',
    'damp': '자폭이나 대폭발을 막는다.',
    'limber': '마비 상태가 되지 않는다.',
    'sand-veil': '모래바람에서 회피율이 올라간다.',
    'static': '접촉 공격을 받으면 상대를 마비시킬 수 있다.',
    'volt-absorb': '전기 타입 공격을 받으면 HP를 회복한다.',
    'water-absorb': '물 타입 공격을 받으면 HP를 회복한다.',
    'oblivious': '헤롱헤롱 상태가 되지 않는다.',
    'cloud-nine': '날씨 효과를 무시한다.',
    'compound-eyes': '기술의 명중률이 올라간다.',
    'insomnia': '잠듦 상태가 되지 않는다.',
    'color-change': '받은 공격의 타입으로 변한다.',
    'immunity': '독 상태가 되지 않는다.',
    'flash-fire': '불꽃 타입 공격을 받으면 불꽃 타입 기술의 위력이 올라간다.',
    'shield-dust': '상대 기술의 추가 효과를 받지 않는다.',
    'own-tempo': '혼란 상태가 되지 않는다.',
    'suction-cups': '교체되지 않는다.',
    'intimidate': '상대의 공격을 낮춘다.',
    'shadow-tag': '상대가 도망칠 수 없다.',
    'rough-skin': '접촉 공격을 받으면 상대에게 데미지를 준다.',
    'wonder-guard': '효과가 뛰어난 공격만 받는다.',
    'levitate': '땅 타입 공격을 받지 않는다.',
    'effect-spore': '접촉 공격을 받으면 상대를 독, 마비, 잠듦 상태로 만들 수 있다.',
    'synchronize': '상대에게 받은 상태이상을 상대에게도 건다.',
    'clear-body': '상대에게 능력이 낮아지지 않는다.',
    'natural-cure': '교체하면 상태이상이 회복된다.',
    'lightning-rod': '전기 타입 공격을 받으면 특공이 올라간다.',
    'serene-grace': '기술의 추가 효과 발생 확률이 올라간다.',
    'swift-swim': '비가 내릴 때 스피드가 올라간다.',
    'chlorophyll': '맑음일 때 스피드가 올라간다.',
    'illuminate': '야생 포켓몬과 만날 확률이 올라간다.',
    'trace': '상대의 특성을 복사한다.',
    'huge-power': '공격이 2배가 된다.',
    'poison-point': '접촉 공격을 받으면 상대를 독 상태로 만들 수 있다.',
    'inner-focus': '풀죽음 상태가 되지 않는다.',
    'magma-armor': '얼음 상태가 되지 않는다.',
    'water-veil': '화상 상태가 되지 않는다.',
    'magnet-pull': '강철 타입 포켓몬이 도망칠 수 없다.',
    'soundproof': '소리 기술을 받지 않는다.',
    'rain-dish': '비가 내릴 때 HP를 회복한다.',
    'sand-stream': '배틀 시작 시 모래바람을 일으킨다.',
    'pressure': '상대의 PP를 많이 소모시킨다.',
    'thick-fat': '불꽃과 얼음 타입 공격의 데미지를 절반으로 받는다.',
    'early-bird': '잠듦 상태에서 빨리 깨어난다.',
    'flame-body': '접촉 공격을 받으면 상대를 화상 상태로 만들 수 있다.',
    'run-away': '도망칠 수 있다.',
    'keen-eye': '명중률이 낮아지지 않는다.',
    'hyper-cutter': '공격이 낮아지지 않는다.',
    'pickup': '아이템을 주울 수 있다.',
    'truant': '한 번 공격하면 다음 턴에 쉰다.',
    'hustle': '공격이 올라가지만 명중률이 떨어진다.',
    'cute-charm': '접촉 공격을 받으면 상대를 헤롱헤롱 상태로 만들 수 있다.',
    'plus': '플러스나 마이너스 특성을 가진 포켓몬과 있을 때 특공이 올라간다.',
    'minus': '플러스나 마이너스 특성을 가진 포켓몬과 있을 때 특공이 올라간다.',
    'forecast': '날씨에 따라 타입이 변한다.',
    'sticky-hold': '아이템을 빼앗기지 않는다.',
    'shed-skin': '매 턴마다 상태이상이 회복될 수 있다.',
    'guts': '상태이상일 때 공격이 올라간다.',
    'marvel-scale': '상태이상일 때 방어가 올라간다.',
    'liquid-ooze': 'HP를 흡수하는 기술을 받으면 상대에게 데미지를 준다.',
    'overgrow': 'HP가 1/3 이하일 때 풀 타입 기술의 위력이 올라간다.',
    'blaze': 'HP가 1/3 이하일 때 불꽃 타입 기술의 위력이 올라간다.',
    'torrent': 'HP가 1/3 이하일 때 물 타입 기술의 위력이 올라간다.',
    'swarm': 'HP가 1/3 이하일 때 벌레 타입 기술의 위력이 올라간다.',
    'rock-head': '반동 데미지를 받지 않는다.',
    'drought': '배틀 시작 시 맑음을 만든다.',
    'arena-trap': '상대가 도망칠 수 없다.',
    'vital-spirit': '잠듦 상태가 되지 않는다.',
    'white-smoke': '상대에게 능력이 낮아지지 않는다.',
    'pure-power': '공격이 2배가 된다.',
    'shell-armor': '급소에 맞지 않는다.',
    'air-lock': '날씨 효과를 무시한다.',
    'tangled-feet': '혼란 상태일 때 회피율이 올라간다.',
    'motor-drive': '전기 타입 공격을 받으면 스피드가 올라간다.',
    'rivalry': '같은 성별의 상대에게는 공격이 올라가고, 다른 성별의 상대에게는 공격이 떨어진다.',
    'steadfast': '풀죽음 상태가 되면 스피드가 올라간다.',
    'snow-cloak': '우박이 내릴 때 회피율이 올라간다.',
    'gluttony': 'HP가 1/2 이하일 때 나무열매를 사용한다.',
    'anger-point': '급소에 맞으면 공격이 최대가 된다.',
    'unburden': '아이템을 사용하면 스피드가 올라간다.',
    'heatproof': '불꽃 타입 공격의 데미지를 절반으로 받는다.',
    'simple': '능력 변화가 2배가 된다.',
    'dry-skin': '비가 내릴 때 HP를 회복하고, 맑을 때 HP가 줄어든다.',
    'download': '상대의 방어가 특방보다 높으면 특공이, 그렇지 않으면 공격이 올라간다.',
    'iron-fist': '주먹 기술의 위력이 올라간다.',
    'poison-heal': '독 상태일 때 HP를 회복한다.',
    'adaptability': '자신의 타입 기술의 위력이 올라간다.',
    'skill-link': '연속 기술이 항상 최대 횟수로 나간다.',
    'hydration': '비가 내릴 때 상태이상이 회복된다.',
    'solar-power': '맑을 때 특공이 올라가지만 매 턴 HP가 줄어든다.',
    'quick-feet': '상태이상일 때 스피드가 올라간다.',
    'normalize': '모든 기술이 노말 타입이 되고 위력이 올라간다.',
    'sniper': '급소에 맞으면 데미지가 3배가 된다.',
    'magic-guard': '공격 기술이 아닌 데미지를 받지 않는다.',
    'no-guard': '모든 기술의 명중률이 100%가 된다.',
    'stall': '마지막에 행동한다.',
    'technician': '위력이 낮은 기술의 위력이 올라간다.',
    'leaf-guard': '맑을 때 상태이상이 되지 않는다.',
    'klutz': '아이템의 효과를 받지 않는다.',
    'mold-breaker': '상대의 특성을 무시하고 공격한다.',
    'super-luck': '급소에 맞을 확률이 올라간다.',
    'aftermath': '기절할 때 상대에게 데미지를 준다.',
    'anticipation': '상대에게 위험한 기술이 있으면 알 수 있다.',
    'forewarn': '상대의 가장 위력이 높은 기술을 알 수 있다.',
    'unaware': '상대의 능력 변화를 무시한다.',
    'tinted-lens': '효과가 별로인 기술의 위력이 올라간다.',
    'filter': '효과가 뛰어난 공격의 데미지를 절반으로 받는다.',
    'slow-start': '5턴 동안 공격과 스피드가 절반이 된다.',
    'scrappy': '고스트 타입에게도 노말과 격투 타입 기술이 맞는다.',
    'storm-drain': '물 타입 공격을 받으면 특공이 올라간다.',
    'ice-body': '우박이 내릴 때 HP를 회복한다.',
    'solid-rock': '효과가 뛰어난 공격의 데미지를 절반으로 받는다.',
    'snow-warning': '배틀 시작 시 우박을 내린다.',
    'honey-gather': '꿀을 주울 수 있다.',
    'frisk': '상대의 아이템을 알 수 있다.',
    'reckless': '반동 데미지를 주는 기술의 위력이 올라간다.',
    'multitype': '플레이트에 따라 타입이 변한다.',
    'flower-gift': '맑을 때 아군의 공격과 특방이 올라간다.',
    'bad-dreams': '잠듦 상태의 상대에게 매 턴 데미지를 준다.',
    'pickpocket': '아이템을 빼앗긴 후 상대의 아이템을 훔친다.',
    'sheer-force': '추가 효과를 없애고 기술의 위력을 올린다.',
    'contrary': '능력 변화가 반대로 된다.',
    'unnerve': '상대가 나무열매를 사용할 수 없다.',
    'defiant': '상대에게 능력이 낮아지면 공격이 올라간다.',
    'defeatist': 'HP가 절반 이하일 때 공격과 특공이 절반이 된다.',
    'cursed-body': '공격을 받으면 상대의 기술을 봉인할 수 있다.',
    'healer': '아군의 상태이상을 회복시킬 수 있다.',
    'friend-guard': '아군이 받는 데미지를 줄인다.',
    'weak-armor': '물리 공격을 받으면 방어가 떨어지고 스피드가 올라간다.',
    'heavy-metal': '무게가 2배가 된다.',
    'light-metal': '무게가 절반이 된다.',
    'multiscale': 'HP가 최대일 때 받는 데미지를 절반으로 받는다.',
    'toxic-boost': '독 상태일 때 물리 기술의 위력이 올라간다.',
    'flare-boost': '화상 상태일 때 특수 기술의 위력이 올라간다.',
    'harvest': '나무열매를 사용한 후 다시 가질 수 있다.',
    'telepathy': '아군의 공격을 받지 않는다.',
    'moody': '매 턴마다 능력이 올라가거나 떨어진다.',
    'overcoat': '모래바람, 우박, 포자에 데미지를 받지 않는다.',
    'poison-touch': '접촉 공격을 하면 상대를 독 상태로 만들 수 있다.',
    'regenerator': '교체할 때 HP를 회복한다.',
    'big-pecks': '방어가 낮아지지 않는다.',
    'sand-rush': '모래바람이 불 때 스피드가 올라간다.',
    'wonder-skin': '상태이상 기술의 명중률이 떨어진다.',
    'analytic': '마지막에 행동하면 기술의 위력이 올라간다.',
    'illusion': '마지막으로 교체한 포켓몬으로 보인다.',
    'imposter': '상대의 모습으로 변한다.',
    'infiltrator': '상대의 방어막을 무시하고 공격한다.',
    'mummy': '접촉 공격을 하면 상대의 특성을 뮤미로 바꾼다.',
    'moxie': '상대를 기절시키면 공격이 올라간다.',
    'justified': '악 타입 공격을 받으면 공격이 올라간다.',
    'rattled': '벌레, 고스트, 악 타입 공격을 받으면 스피드가 올라간다.',
    'magic-bounce': '상태이상 기술을 받으면 상대에게 되돌린다.',
    'sap-sipper': '풀 타입 공격을 받으면 공격이 올라간다.',
    'prankster': '상태이상 기술을 우선적으로 사용한다.',
    'sand-force': '모래바람이 불 때 땅, 바위, 강철 타입 기술의 위력이 올라간다.',
    'iron-barbs': '접촉 공격을 받으면 상대에게 데미지를 준다.',
    'zen-mode': 'HP가 절반 이하일 때 폼이 변한다.',
    'victory-star': '자신과 아군의 명중률이 올라간다.',
    'turboblaze': '상대의 특성을 무시하고 공격한다.',
    'teravolt': '상대의 특성을 무시하고 공격한다.',
    'aroma-veil': '아군이 헤롱헤롱 상태가 되지 않는다.',
    'flower-veil': '아군이 능력이 낮아지지 않는다.',
    'cheek-pouch': '나무열매를 사용하면 HP를 더 회복한다.',
    'protean': '기술을 사용할 때 자신의 타입이 그 기술의 타입이 된다.',
    'fur-coat': '물리 공격의 데미지를 절반으로 받는다.',
    'magician': '공격을 하면 상대의 아이템을 훔친다.',
    'bulletproof': '구슬과 폭탄 기술을 받지 않는다.',
    'competitive': '상대에게 능력이 낮아지면 특공이 올라간다.',
    'strong-jaw': '입을 사용하는 기술의 위력이 올라간다.',
    'refrigerate': '노말 타입 기술이 얼음 타입이 되고 위력이 올라간다.',
    'sweet-veil': '아군이 잠듦 상태가 되지 않는다.',
    'stance-change': '공격 기술을 사용하면 블레이드 폼이, 방어 기술을 사용하면 실드 폼이 된다.',
    'gale-wings': 'HP가 최대일 때 비행 타입 기술을 우선적으로 사용한다.',
    'mega-launcher': '파동 기술의 위력이 올라간다.',
    'grass-pelt': '그래스필드에서 방어가 올라간다.',
    'symbiosis': '아군이 아이템을 사용하면 자신의 아이템을 건네준다.',
    'tough-claws': '접촉 공격의 위력이 올라간다.',
    'pixilate': '노말 타입 기술이 페어리 타입이 되고 위력이 올라간다.',
    'gooey': '접촉 공격을 받으면 상대의 스피드를 떨어뜨린다.',
    'aerilate': '노말 타입 기술이 비행 타입이 되고 위력이 올라간다.',
    'parental-bond': '공격을 두 번 한다.',
    'dark-aura': '악 타입 기술의 위력이 올라간다.',
    'fairy-aura': '페어리 타입 기술의 위력이 올라간다.',
    'aura-break': '오라 특성의 효과를 반대로 만든다.',
    'primordial-sea': '불꽃 타입 공격을 받지 않는다.',
    'desolate-land': '물 타입 공격을 받지 않는다.',
    'delta-stream': '얼음 타입 공격을 받지 않는다.',
    'stakeout': '상대가 교체할 때 공격의 위력이 2배가 된다.',
    'slush-rush': '우박이 내릴 때 스피드가 올라간다.',
    'long-reach': '접촉하지 않고 공격한다.',
    'liquid-voice': '소리 기술이 물 타입이 된다.',
    'triage': '회복 기술을 우선적으로 사용한다.',
    'galvanize': '노말 타입 기술이 전기 타입이 되고 위력이 올라간다.',
    'surge-surfer': '일렉트릭필드에서 스피드가 2배가 된다.',
    'schooling': 'HP가 1/4 이상일 때 폼이 변한다.',
    'disguise': '한 번의 공격을 받지 않는다.',
    'battle-bond': '상대를 기절시키면 폼이 변한다.',
    'power-construct': 'HP가 절반 이하일 때 폼이 변한다.',
    'corrosion': '강철과 독 타입 포켓몬도 독 상태로 만들 수 있다.',
    'comatose': '잠듦 상태이지만 공격할 수 있다.',
    'queenly-majesty': '우선도가 높은 기술을 받지 않는다.',
    'innards-out': '기절할 때 상대에게 자신의 최대 HP만큼 데미지를 준다.',
    'dancer': '춤 기술을 사용하면 자신도 같은 기술을 사용한다.',
    'battery': '아군의 특수 기술의 위력이 올라간다.',
    'fluffy': '접촉 공격의 데미지를 절반으로 받지만 불꽃 타입 공격의 데미지는 2배로 받는다.',
    'dazzling': '우선도가 높은 기술을 받지 않는다.',
    'soul-heart': '상대를 기절시키면 특공이 올라간다.',
    'tangling-hair': '접촉 공격을 받으면 상대의 스피드를 떨어뜨린다.',
    'receiver': '아군이 기절하면 그 아군의 특성을 받는다.',
    'power-of-alchemy': '아군이 기절하면 그 아군의 특성을 받는다.',
    'beast-boost': '상대를 기절시키면 가장 높은 능력이 올라간다.',
    'rks-system': '메모리에 따라 타입이 변한다.',
    'electric-surge': '배틀 시작 시 일렉트릭필드를 만든다.',
    'psychic-surge': '배틀 시작 시 사이킥필드를 만든다.',
    'grassy-surge': '배틀 시작 시 그래스필드를 만든다.',
    'misty-surge': '배틀 시작 시 미스트필드를 만든다.',
    'intrepid-sword': '등장하자마자자 공격이 올라간다.',
    'dauntless-shield': '등장하자마자 방어가 올라간다.',
    'libero': '기술을 사용할 때 자신의 타입이 그 기술의 타입이 된다.',
    'ball-fetch': '포켓볼을 사용하면 다시 가질 수 있다.',
    'cotton-down': '공격을 받으면 상대의 스피드를 떨어뜨린다.',
    'propeller-tail': '아군의 공격을 받지 않는다.',
    'mirror-armor': '상대에게 능력이 낮아지면 상대에게 되돌린다.',
    'gulp-missile': 'HP가 절반 이하일 때 공격을 받으면 상대에게 데미지를 준다.',
    'stalwart': '아군의 공격을 받지 않는다.',
    'steam-engine': '불꽃이나 물 타입 공격을 받으면 스피드가 올라간다.',
    'punk-rock': '소리 기술의 위력이 올라가고 소리 기술의 데미지를 절반으로 받는다.',
    'sand-spit': '공격을 받으면 모래바람을 일으킨다.',
    'ice-scales': '특수 공격의 데미지를 절반으로 받는다.',
    'ripen': '나무열매의 효과가 2배가 된다.',
    'ice-face': '한 번의 공격을 받지 않는다.',
    'power-spot': '아군의 공격의 위력이 올라간다.',
    'mimicry': '필드의 타입이 자신의 타입이 된다.',
    'screen-cleaner': '필드의 효과를 없앤다.',
    'steely-spirit': '아군의 강철 타입 기술의 위력이 올라간다.',
    'perish-body': '접촉 공격을 받으면 3턴 후에 기절한다.',
    'wandering-spirit': '접촉 공격을 하면 상대와 특성을 바꾼다.',
    'gorilla-tactics': '공격이 올라가지만 한 번에 하나의 기술만 사용할 수 있다.',
    'neutralizing-gas': '필드의 모든 특성 효과를 없앤다.',
    'pastel-veil': '아군이 독 상태가 되지 않는다.',
    'hunger-switch': '매 턴마다 폼이 변한다.',
    'quick-draw': '선제공격을 할 확률이 올라간다.',
    'unseen-fist': '접촉하지 않는 공격도 접촉 공격으로 취급한다.',
    'curious-medicine': '교체할 때 아군의 능력 변화를 없앤다.',
    'transistor': '전기 타입 기술의 위력이 올라간다.',
    'dragons-maw': '드래곤 타입 기술의 위력이 올라간다.',
    'chilling-neigh': '상대를 기절시키면 공격이 올라간다.',
    'grim-neigh': '상대를 기절시키면 특공이 올라간다.',
    'as-one-glastrier': '언더독과 칠드링의 특성을 모두 가진다.',
    'as-one-spectrier': '언더독과 그림네의 특성을 모두 가진다.',
    'lingering-aroma': '접촉 공격을 하면 상대의 특성을 랭킹아로마로 바꾼다.',
    'seed-sower': '공격을 받으면 그래스필드를 만든다.',
    'thermal-exchange': '불꽃 타입 공격을 받으면 공격이 올라간다.',
    'anger-shell': 'HP가 절반 이하일 때 공격과 특공이 올라가고 방어와 특방이 떨어진다.',
    'purifying-salt': '고스트 타입 공격의 데미지를 절반으로 받고 상태이상이 되지 않는다.',
    'well-baked-body': '불꽃 타입 공격을 받으면 방어가 올라간다.',
    'wind-rider': '바람 기술을 받으면 공격이 올라간다.',
    'guard-dog': '상대에게 능력이 낮아지지 않는다.',
    'rocky-payload': '바위 타입 기술의 위력이 올라간다.',
    'wind-power': '바람 기술을 받으면 특공이 올라간다.',
    'zero-to-hero': '교체할 때 폼이 변한다.',
    'commander': '아군이 기절하면 폼이 변한다.',
    'electromorphosis': '공격을 받으면 다음 전기 타입 기술의 위력이 올라간다.',
    'protosynthesis': '맑을 때 가장 높은 능력이 올라간다.',
    'quark-drive': '일렉트릭필드에서 가장 높은 능력이 올라간다.',
    'good-as-gold': '상태이상이 되지 않는다.',
    'vessel-of-ruin': '상대의 특공을 낮춘다.',
    'sword-of-ruin': '상대의 방어를 낮춘다.',
    'tablets-of-ruin': '상대의 공격을 낮춘다.',
    'beads-of-ruin': '상대의 특방을 낮춘다.',
    'orichalcum-pulse': '맑을 때 공격이 올라가고 불꽃 타입 기술의 위력이 올라간다.',
    'hadron-engine': '일렉트릭필드를 만들고 특공이 올라간다.',
    'opportunist': '상대의 능력이 올라가면 자신도 같은 능력이 올라간다.',
    'cud-chew': '나무열매를 사용한 후 다음 턴에 다시 효과를 받는다.',
    'sharpness': '날카로운 기술의 위력이 올라간다.',
    'supreme-overlord': '기절한 아군이 많을수록 공격과 특공이 올라간다.',
    'costar': '아군의 능력 변화를 복사한다.',
    'toxic-debris': '공격을 받으면 독가루를 뿌린다.',
    'armor-tail': '아군의 공격을 받지 않는다.',
    'earth-eater': '땅 타입 공격을 받으면 HP를 회복한다.',
    'mycelium-might': '상태이상 기술을 사용할 때 특성을 무시한다.',
    'minds-eye': '고스트 타입에게도 노말과 격투 타입 기술이 맞는다.',
    'supersweet-syrup': '상대의 회피율을 떨어뜨린다.',
    'hospitality': '아군이 교체할 때 HP를 회복시킨다.',
    'toxic-chain': '접촉 공격을 하면 상대를 독 상태로 만들 수 있다.',
    'embody-aspect': '테라스탈할 때 폼이 변한다.',
    'tera-shift': '테라스탈할 때 타입이 변한다.',
    'tera-shell': '테라스탈할 때 모든 공격의 데미지를 절반으로 받는다.',
    'teraform-zero': '테라스탈할 때 모든 능력 변화를 없앤다.',
    'poison-puppeteer': '독 상태의 상대를 조종할 수 있다.',
    'mountaineer': '바위 타입 공격을 받지 않는다.',
    'wave-rider': '물 타입 공격을 받으면 스피드가 올라간다.',
    'skater': '얼음 타입 공격을 받으면 스피드가 올라간다.',
    'thrust': '상대의 회피율을 무시하고 공격한다.',
    'perception': '상대의 회피율을 무시하고 공격한다.',
    'parry': '접촉 공격을 받으면 상대를 마비시킬 수 있다.',
    'instinct': '상대의 회피율을 무시하고 공격한다.',
    'dodge': '상대의 회피율을 무시하고 공격한다.',
    'jagged-ear': '상대의 회피율을 무시하고 공격한다.',
    'divine-blessing': '상대의 회피율을 무시하고 공격한다.',
    'blaze-of-glory': '상대의 회피율을 무시하고 공격한다.',
    'artificial': '인공 포켓몬의 특성이다.',
    'sea-incarnate': '바다의 화신이다.',
    'land-incarnate': '대지의 화신이다.',
    'sky-incarnate': '하늘의 화신이다.',
    'ability-all': '모든 특성을 가진다.',
    'cacophony': '소리 기술을 받지 않는다.',
    'air-lock': '날씨 효과를 무시한다.'
  };
  return descriptions[abilityName] || '특성 설명이 없습니다.';
}

// 포켓몬 서식지(작품별/세대별) 정보 API
app.get('/api/pokemons/:id/habitats', async (req, res) => {
  const { id } = req.params;
  try {
    // PokeAPI에서 encounter 정보를 가져옴
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/encounters`);
    if (!response.ok) {
      return res.status(404).json({ error: 'No habitat data found' });
    }
    const data = await response.json();
    // encounter data는 버전별로 배열이 나옴
    // [{ location_area: {name, url}, version_details: [{version, max_chance, encounter_details: [...]}, ...] }, ...]
    // 버전별로 서식지 이름을 정리
    const habitatsByVersion = {};
    data.forEach(encounter => {
      encounter.version_details.forEach(vd => {
        const version = vd.version.name;
        if (!habitatsByVersion[version]) habitatsByVersion[version] = [];
        habitatsByVersion[version].push({
          location_area: encounter.location_area.name,
          location_area_url: encounter.location_area.url,
          max_chance: vd.max_chance
        });
      });
    });
    res.json({
      id,
      habitats: habitatsByVersion
    });
  } catch (error) {
    console.error('Error fetching habitat info:', error);
    res.status(500).json({ error: 'Failed to fetch habitat info' });
  }
});

// 포켓몬 진화체인 정보 API
app.get('/api/pokemons/:id/evolution', async (req, res) => {
  const { id } = req.params;
  
  // 캐시 확인
  const cacheKey = `evolution_${id}`;
  if (evolutionCache.has(cacheKey)) {
    return res.json(evolutionCache.get(cacheKey));
  }
  
  try {
    // 먼저 포켓몬의 species 정보를 가져와서 evolution-chain URL을 얻음
    const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
    if (!speciesResponse.ok) {
      return res.status(404).json({ error: 'Pokemon species not found' });
    }
    const speciesData = await speciesResponse.json();
    
    if (!speciesData.evolution_chain?.url) {
      const result = { evolutionChain: [] };
      setCacheWithExpiry(evolutionCache, cacheKey, result, 30 * 60 * 1000); // 30분 캐시
      return res.json(result);
    }

    // evolution-chain 정보를 가져옴
    const evolutionResponse = await fetch(speciesData.evolution_chain.url);
    if (!evolutionResponse.ok) {
      return res.status(404).json({ error: 'Evolution chain not found' });
    }
    const evolutionData = await evolutionResponse.json();

    // 진화체인을 트리 구조로 구성
    const buildEvolutionTree = async (chain) => {
      if (!chain) return null;
      try {
        // species URL에서 ID 추출
        const speciesId = chain.species.url.split('/').filter(Boolean).pop();
        // 중복 fetch 제거: getPokemonDetails로 통합
        const pokemonInfo = await getPokemonDetails(speciesId);
        const evolutionNode = {
          id: pokemonInfo.id,
          name: pokemonInfo.name,
          koreanName: pokemonInfo.koreanName,
          sprite: pokemonInfo.image,
          types: pokemonInfo.types,
          evolutionDetails: chain.evolution_details || [],
          evolvesTo: []
        };
        if (chain.evolves_to && chain.evolves_to.length > 0) {
          for (const evolution of chain.evolves_to) {
            const childNode = await buildEvolutionTree(evolution);
            if (childNode) {
              evolutionNode.evolvesTo.push(childNode);
            }
          }
        }
        return evolutionNode;
      } catch (error) {
        console.error(`Error processing evolution chain for species ${chain.species.name}:`, error);
        return null;
      }
    };
    
    const evolutionTree = await buildEvolutionTree(evolutionData.chain);
    
    // 트리 구조를 평면 배열로 변환 (분기 진화를 포함)
    // flattenEvolutionTree 제거
    // const evolutionChain = evolutionTree ? flattenEvolutionTree(evolutionTree) : [];
    
    // 진화체인이 비어있거나 현재 포켓몬만 있는 경우 처리
    let resultTree = evolutionTree;
    if (!resultTree) {
      try {
        // 현재 포켓몬 정보를 직접 가져와서 추가
        const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`);
        if (!pokemonResponse.ok) {
          console.error(`Failed to fetch current pokemon ${id}: ${pokemonResponse.status}`);
        } else {
          const pokemonData = await pokemonResponse.json();
          const koreanName = speciesData.names.find(name => name.language.name === 'ko')?.name || pokemonData.name;
          resultTree = {
            id: pokemonData.id,
            name: pokemonData.name,
            koreanName: koreanName,
            sprite: pokemonData.sprites.other['official-artwork'].front_default || pokemonData.sprites.front_default,
            types: pokemonData.types.map(type => type.type.name),
            evolutionDetails: [],
            evolvesTo: []
          };
        }
      } catch (error) {
        console.error(`Error fetching current pokemon ${id}:`, error);
      }
    }
    
    const result = {
      id,
      evolutionChain: resultTree
    };
    
    // 캐시에 저장 (30분간 유효)
    setCacheWithExpiry(evolutionCache, cacheKey, result, 30 * 60 * 1000);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching evolution chain:', error);
    res.status(500).json({ error: 'Failed to fetch evolution chain' });
  }
});

// 서버 시작 시 프리페치 한 번 실행
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  prefetchAllGenerations();
}); 