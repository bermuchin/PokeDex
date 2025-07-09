# 포켓몬 도감 (Pokédex)

React + Node.js로 만든 포켓몬 도감 애플리케이션입니다.

## 🚀 주요 기능

- **세대별 포켓몬 조회**: 1세대부터 9세대까지, 전국도감 지원
- **실시간 검색**: 포켓몬 이름으로 검색 (한글/영문)
- **타입 필터링**: 18가지 타입별 필터링
- **상세 정보**: 포켓몬의 능력치, 키, 몸무게 등 상세 정보
- **백엔드 API**: Node.js + Express로 구현된 효율적인 API 서버
- **캐싱 시스템**: 메모리 캐시로 성능 최적화

## 🛠️ 기술 스택

### Frontend
- React 19
- Vite
- CSS3

### Backend
- Node.js
- Express.js
- node-fetch
- CORS

## 📦 설치 및 실행

### 1. 의존성 설치
```bash
# 루트 디렉토리에서
npm install

# 백엔드 디렉토리에서
cd backend
npm install
```

### 2. 서버 실행

#### 방법 1: npm 스크립트 (권장)
```bash
# 모든 운영체제에서 작동
npm start
# 또는
npm run dev-full
```

#### 방법 2: 배치 파일 (Windows 전용)
```bash
# Windows에서만 작동
.\start.bat
```

#### 방법 3: 따로 실행
```bash
# 백엔드 서버 실행 (포트 3002)
npm run backend

# 프론트엔드 개발 서버 실행 (포트 5173)
npm run dev
```

### 3. 환경 변수 설정 (선택사항)
로컬 개발 시 백엔드 API URL을 설정하려면 `.env.local` 파일을 생성하세요:
```bash
# .env.local
VITE_API_URL=http://localhost:3002
```

### 4. 브라우저에서 확인
- 프론트엔드: http://localhost:5173
- 백엔드 API: http://localhost:3002

## 🔌 API 엔드포인트

### 포켓몬 관련
- `GET /api/pokemons?generation=1&limit=50&offset=0` - 세대별 포켓몬 목록
- `GET /api/pokemons/ids?ids=1,2,3,4` - 특정 ID들의 포켓몬 정보
- `GET /api/pokemons/:id` - 단일 포켓몬 정보

### 메타데이터
- `GET /api/generations` - 세대 목록
- `GET /api/types` - 타입 목록

### 캐시 관리
- `GET /api/cache/status` - 캐시 상태 확인
- `POST /api/cache/clear` - 캐시 초기화

## 🎯 사용 예시

### 세대별 포켓몬 조회
```javascript
// 1세대 포켓몬 50마리 조회
fetch('http://localhost:3002/api/pokemons?generation=1&limit=50')
  .then(response => response.json())
  .then(data => console.log(data.pokemons));
```

### 특정 포켓몬들 조회
```javascript
// ID 1, 4, 7번 포켓몬 조회
fetch('http://localhost:3002/api/pokemons/ids?ids=1,4,7')
  .then(response => response.json())
  .then(data => console.log(data.pokemons));
```

## 🔧 성능 최적화

- **메모리 캐싱**: 포켓몬 정보 5분, 세대 정보 10분 캐시
- **병렬 처리**: Promise.all을 사용한 동시 요청 처리
- **페이지네이션**: 대용량 데이터 처리 지원
- **CORS 설정**: 프론트엔드와 백엔드 통신 최적화

## 📊 데이터 소스

- [PokeAPI](https://pokeapi.co/) - 포켓몬 데이터 제공
- 한국어 이름 및 상세 정보 포함

## 🎨 UI/UX 특징

- 반응형 디자인
- 모던한 카드 레이아웃
- 모달을 통한 상세 정보 표시
- 직관적인 필터링 시스템
- 로딩 상태 및 에러 처리

## 🌐 배포

### Vercel (프론트엔드)
- **URL**: https://poke-dex-beta-seven.vercel.app/
- **Beta URL**: https://poke-dex-beta-seven.vercel.app/
- **배포 방법**: GitHub 연동으로 자동 배포
- **환경 변수**: `VITE_API_URL=https://pokedex-1ult.onrender.com`

### Render (백엔드)
- **URL**: https://pokedex-1ult.onrender.com
- **배포 방법**: GitHub 연동으로 자동 배포
- **포트**: 3002

## 🔄 업데이트 내역

- v1.0.0: 기본 포켓몬 도감 기능
- v1.1.0: 백엔드 API 서버 추가
- v1.2.0: 캐싱 시스템 및 성능 최적화
- v1.3.0: 무한 스크롤 페이지네이션 버그 수정
