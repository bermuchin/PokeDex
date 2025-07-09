const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = 3002;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 캐시를 위한 메모리 저장소
const pokemonCache = new Map();
const generationCache = new Map();

// 포켓몬 상세 정보 가져오기 (캐시 포함)
async function getPokemonDetails(id) {
  const cacheKey = `pokemon_${id}`;
  
  if (pokemonCache.has(cacheKey)) {
    return pokemonCache.get(cacheKey);
  }

  try {
    const [pokemonResponse, speciesResponse] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`)
    ]);

    const pokemonData = await pokemonResponse.json();
    const speciesData = await speciesResponse.json();

    const koreanName = speciesData.names.find(name => name.language.name === 'ko')?.name || pokemonData.name;

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
      }))
    };

    // 캐시에 저장 (30분간 유효)
    pokemonCache.set(cacheKey, pokemonInfo);
    setTimeout(() => pokemonCache.delete(cacheKey), 30 * 60 * 1000);

    return pokemonInfo;
  } catch (error) {
    console.error(`Error fetching pokemon ${id}:`, error);
    throw error;
  }
}

// 세대별 포켓몬 목록 가져오기
async function getGenerationPokemons(generation) {
  const cacheKey = `generation_${generation}`;
  
  if (generationCache.has(cacheKey)) {
    return generationCache.get(cacheKey);
  }

  try {
    let species = [];
    
    if (generation === 'all') {
      // 전국도감: 모든 포켓몬 가져오기 (1025마리)
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

    // 캐시에 저장 (60분간 유효)
    generationCache.set(cacheKey, species);
    setTimeout(() => generationCache.delete(cacheKey), 60 * 60 * 1000);

    return species;
  } catch (error) {
    console.error(`Error fetching generation ${generation}:`, error);
    throw error;
  }
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

// 1. 세대별 포켓몬 목록 (상세 정보 포함)
app.get('/api/pokemons', async (req, res) => {
  try {
    const { generation, limit = 50, offset = 0 } = req.query;
    
    if (!generation) {
      return res.status(400).json({ error: 'generation parameter is required' });
    }

    const species = await getGenerationPokemons(generation);
    
    // offset과 limit을 정수로 변환
    const offsetInt = parseInt(offset);
    const limitInt = parseInt(limit);
    
    // 페이지네이션 적용 - 범위 체크 추가
    const startIndex = offsetInt;
    const endIndex = offsetInt + limitInt;
    
    // 범위가 유효한지 확인
    if (startIndex >= species.length) {
      return res.json({
        pokemons: [],
        total: species.length,
        limit: limitInt,
        offset: offsetInt,
        cached: 0
      });
    }
    
    const paginatedSpecies = species.slice(startIndex, endIndex);
    
    // 캐시된 포켓몬과 새로 가져올 포켓몬 분리
    const pokemonPromises = paginatedSpecies.map(async (species) => {
      const id = species.url.split('/').filter(Boolean).pop();
      return await getPokemonDetails(id);
    });
    
    // 병렬 처리로 상세 정보 가져오기
    const pokemonDetails = await Promise.all(pokemonPromises);

    res.json({
      pokemons: pokemonDetails,
      total: species.length,
      limit: limitInt,
      offset: offsetInt,
      cached: pokemonDetails.filter(p => pokemonCache.has(`pokemon_${p.id}`)).length
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
    pokemonCacheSize: pokemonCache.size,
    generationCacheSize: generationCache.size,
    memoryUsage: process.memoryUsage()
  });
});

// 7. 캐시 초기화
app.post('/api/cache/clear', (req, res) => {
  pokemonCache.clear();
  generationCache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// 특성 설명 함수
function getAbilityDescription(abilityName) {
  const descriptions = {
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
    'intrepid-sword': '상대를 기절시키면 공격이 올라간다.',
    'dauntless-shield': '상대를 기절시키면 방어가 올라간다.',
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

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 Pokemon API Server running on http://localhost:${PORT}`);
  console.log(`📚 Available endpoints:`);
  console.log(`   GET /api/pokemons?generation=1&limit=50&offset=0`);
  console.log(`   GET /api/pokemons/ids?ids=1,2,3,4`);
  console.log(`   GET /api/pokemons/:id`);
  console.log(`   GET /api/generations`);
  console.log(`   GET /api/types`);
  console.log(`   GET /api/cache/status`);
  console.log(`   POST /api/cache/clear`);
}); 