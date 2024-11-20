import React from 'react';
import InstallPWA from './components/InstallPWA';

function App() {
  // Your existing code...

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        {/* Your existing JSX */}
        
        {session && <InstallPWA />} {/* Only show when user is logged in */}
      </div>
    </ToastProvider>
  );
}
