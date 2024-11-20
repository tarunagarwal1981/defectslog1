import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Service Worker Registration with better error handling and update management
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        updateViaCache: 'none' // Prevent caching of service worker
      });

      console.log('ServiceWorker registered:', registration.scope);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Show update notification
            const updateConfirmed = window.confirm(
              'A new version of Defect Manager is available. Update now?'
            );
            
            if (updateConfirmed) {
              // Send skip waiting message
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              // Reload all tabs after update
              window.location.reload();
            }
          }
        });
      });

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 1000 * 60 * 60); // Check every hour

    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
    }
  });

  // Handle page reload when service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Cache management utility
export const clearAppCache = async () => {
  if ('caches' in window) {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys.map(key => caches.delete(key))
      );
      console.log('Cache cleared successfully');
      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }
  return false;
};

// Handle network status
window.addEventListener('online', () => {
  document.dispatchEvent(new CustomEvent('app-online'));
});

window.addEventListener('offline', () => {
  document.dispatchEvent(new CustomEvent('app-offline'));
});

// Create and render root
const root = ReactDOM.createRoot(document.getElementById('root'));

// Development logging
if (process.env.NODE_ENV === 'development') {
  // Log PWA status
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      console.log('Active service workers:', registrations.length);
    });
  }

  // Log storage usage
  if ('storage' in navigator && 'estimate' in navigator.estimate) {
    navigator.storage.estimate().then(({ usage, quota }) => {
      console.log(`Using ${Math.round(usage / 1024 / 1024)}MB of ${Math.round(quota / 1024 / 1024)}MB`);
    });
  }
}

// Render app with loading fallback
root.render(
  <React.StrictMode>
    <React.Suspense fallback={
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0B1623',
        color: 'white'
      }}>
        Loading Defect Manager...
      </div>
    }>
      <App />
    </React.Suspense>
  </React.StrictMode>
);
