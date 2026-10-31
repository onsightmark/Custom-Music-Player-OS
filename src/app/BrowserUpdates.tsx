import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function BrowserUpdates() {
  const [error, setError] = useState('');
  const {
    needRefresh: [needsUpdate],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => setError('Offline setup did not finish. Reload to retry when you are online.'),
  });
  return (
    (error || needsUpdate) && (
      <div className="app-notice" role="status">
        <span>{error || 'An update is ready. Reload when you finish listening.'}</span>
        {needsUpdate && (
          <button className="text-button" onClick={() => void updateServiceWorker(true)}>
            Update & reload
          </button>
        )}
      </div>
    )
  );
}
