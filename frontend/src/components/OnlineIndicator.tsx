import React, { useEffect, useState } from 'react';

const OnlineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <span
      className="online-indicator"
      role="status"
      aria-label={isOnline ? 'Online' : 'Offline'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.75rem',
        color: isOnline ? '#16a34a' : '#dc2626',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isOnline ? '#16a34a' : '#dc2626',
        }}
      />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
};

export default OnlineIndicator;
