import { useEffect, useState } from 'react';

const isVisible = () => !document.hidden && (window.musicaDesktop?.isPlayerVisible() ?? true);

export function usePlayerVisibility() {
  const [visible, setVisible] = useState(isVisible);
  useEffect(() => {
    const update = () => setVisible(isVisible());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('musica-player-visibility', update);
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('musica-player-visibility', update);
    };
  }, []);
  return visible;
}
