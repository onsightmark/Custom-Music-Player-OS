import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WallpaperView } from './desktop/WallpaperView';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URL(location.href).searchParams.get('wallpaper') === '1' ? <WallpaperView /> : <App />}
  </StrictMode>,
);
