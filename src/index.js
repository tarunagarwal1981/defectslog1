import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - show update prompt
              if (window.confirm('A new version of the app is available. Would you like to update?')) {
                registration.waiting.postMessage('skipWaiting');
                window.location.reload();
              }
            }
          });
        });

        // Handle automatic updates if needed
        setInterval(() => {
          registration.update();
        }, 1000 * 60 * 60); // Check for updates every hour
      })
      .catch(error => {
        console.error('ServiceWorker registration failed:', error);
      });
  });

  // Handle service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Error handling for service worker
window.addEventListener('unhandledrejection', event => {
  if (event.reason && event.reason.name === 'NetworkError') {
    console.log('Network error occurred. App is running in offline mode.');
  }
});

// Handle offline/online events
window.addEventListener('online', () => {
  console.log('App is online');
  document.dispatchEvent(new CustomEvent('app-online'));
});

window.addEventListener('offline', () => {
  console.log('App is offline');
  document.dispatchEvent(new CustomEvent('app-offline'));
});

// Clear cache helper function (can be used in App.js)
export const clearAppCache = async () => {
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      console.log('App cache cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing app cache:', error);
      return false;
    }
  }
  return false;
};

// Create root and render app
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render with error boundary
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

// Development logging
if (process.env.NODE_ENV === 'development') {
  // Log service worker status
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      console.log('Active service workers:', registrations.length);
    });
  }

  // Log cache storage usage
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate => {
      console.log('Using approximately', Math.round(estimate.usage / 1024 / 1024), 'MB of storage');
      console.log('Has approximately', Math.round(estimate.quota / 1024 / 1024), 'MB of storage available');
    });
  }
}
