import fetch from 'node-fetch';

async function checkArtwork() {
  console.log('공식 아트워크가 없는 포켓몬들을 확인 중...\n');
  
  // 몇 가지 최신 포켓몬들을 테스트
  const testPokemon = [
    { id: 1000, name: 'Gholdengo' },
    { id: 1001, name: 'Great Tusk' },
    { id: 1002, name: 'Brute Bonnet' },
    { id: 1003, name: 'Sandy Shocks' },
    { id: 1004, name: 'Scream Tail' },
    { id: 1005, name: 'Flutter Mane' },
    { id: 1006, name: 'Slither Wing' },
    { id: 1007, name: 'Roaring Moon' },
    { id: 1008, name: 'Iron Treads' },
    { id: 1009, name: 'Iron Moth' },
    { id: 1010, name: 'Iron Hands' },
    { id: 1011, name: 'Iron Jugulis' },
    { id: 1012, name: 'Iron Thorns' },
    { id: 1013, name: 'Iron Bundle' },
    { id: 1014, name: 'Iron Valiant' },
    { id: 1015, name: 'Ting-Lu' },
    { id: 1016, name: 'Chien-Pao' },
    { id: 1017, name: 'Wo-Chien' },
    { id: 1018, name: 'Chi-Yu' },
    { id: 1019, name: 'Koraidon' },
    { id: 1020, name: 'Miraidon' },
    { id: 1021, name: 'Walking Wake' },
    { id: 1022, name: 'Iron Leaves' },
    { id: 1023, name: 'Dipplin' },
    { id: 1024, name: 'Poltchageist' },
    { id: 1025, name: 'Sinistcha' }
  ];

  const noArtwork = [];

  for (const pokemon of testPokemon) {
    try {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon.id}/`);
      const data = await response.json();
      
      const hasArtwork = data.sprites.other['official-artwork']?.front_default;
      
      if (!hasArtwork) {
        noArtwork.push({
          id: pokemon.id,
          name: pokemon.name,
          defaultSprite: data.sprites.front_default
        });
        console.log(`❌ ${pokemon.id}: ${pokemon.name} - 공식 아트워크 없음`);
      } else {
        console.log(`✅ ${pokemon.id}: ${pokemon.name} - 공식 아트워크 있음`);
      }
      
      // API 호출 간격을 두어 서버에 부하를 줄임
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error checking ${pokemon.name}:`, error.message);
    }
  }

  console.log('\n=== 결과 요약 ===');
  console.log(`총 ${testPokemon.length}마리 중 ${noArtwork.length}마리가 공식 아트워크가 없습니다.`);
  
  if (noArtwork.length > 0) {
    console.log('\n공식 아트워크가 없는 포켓몬들:');
    noArtwork.forEach(p => {
      console.log(`- ${p.id}: ${p.name}`);
    });
  }
}

checkArtwork().catch(console.error); 