@echo off
echo 🚀 포켓몬 도감 서버 시작 중...
echo.

echo 📡 백엔드 서버 시작...
start "Backend Server" cmd /k "cd backend && npm start"

echo ⏳ 백엔드 서버 시작 대기 중...
timeout /t 3 /nobreak > nul

echo 🌐 프론트엔드 서버 시작...
echo.
npm run dev

echo.
echo ✅ 모든 서버가 시작되었습니다!
echo 🌐 프론트엔드: http://localhost:5173
echo 📡 백엔드 API: http://localhost:3002
echo.
pause 