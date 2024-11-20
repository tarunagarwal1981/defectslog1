import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Store the install prompt event for later use
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Optionally, send the event to your App component
  document.dispatchEvent(new CustomEvent('installAvailable'));
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.confirm('A new version of the app is available. Would you like to update?')) {
                registration.waiting.postMessage('skipWaiting');
                window.location.reload();
              }
            }
          });
        });

        setInterval(() => {
          registration.update();
        }, 1000 * 60 * 60);
      })
      .catch(error => {
        console.error('ServiceWorker registration failed:', error);
      });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Export function to show install prompt
export const showInstallPrompt = async () => {
  if (deferredPrompt) {
    try {
      // Show the prompt
      await deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      // Clear the deferredPrompt
      deferredPrompt = null;
      return outcome;
    } catch (error) {
      console.error('Error showing install prompt:', error);
      return 'error';
    }
  }
  return 'unavailable';
};

// Check if app is installed
export const isAppInstalled = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
};

// Clear cache helper
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

const root = ReactDOM.createRoot(document.getElementById('root'));

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
