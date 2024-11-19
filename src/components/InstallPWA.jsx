import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setPromptInstall(e);
      // Update UI notify the user they can install the PWA
      setSupportsPWA(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!promptInstall) {
      return;
    }
    // Show the install prompt
    promptInstall.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await promptInstall.userChoice;
    // Clear the saved prompt since it can't be used twice
    setPromptInstall(null);
    // Optionally, send analytics event based on outcome
    console.log(`User response to the install prompt: ${outcome}`);
  };

  if (!supportsPWA) {
    return null;
  }

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-2 px-4 py-2 bg-[#3BADE5] text-white rounded-lg hover:bg-[#3BADE5]/90 transition-colors"
    >
      <Download className="h-4 w-4" />
      <span>Install App</span>
    </button>
  );
};

export default InstallPWA;
