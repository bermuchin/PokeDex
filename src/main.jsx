import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 자연스러운 배경 확대 애니메이션
window.addEventListener('scroll', () => {
  const app = document.querySelector('.app');
  if (!app) return;
  const scrollY = window.scrollY;
  // 0~500px 구간에서 105%~120%로 확대
  const minSize = 105;
  const maxSize = 120;
  const maxScroll = 500;
  const percent = Math.min(scrollY / maxScroll, 1);
  const bgSize = minSize + (maxSize - minSize) * percent;
  app.style.backgroundSize = `${bgSize}%`;
});
