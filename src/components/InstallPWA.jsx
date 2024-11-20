import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { toast } from './ui/use-toast';

const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    // Check if already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;
    
    if (isInstalled) {
      setSupportsPWA(false);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPromptInstall(e);
      setSupportsPWA(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if installed status changes
    const mediaHandler = (e) => {
      if (e.matches) {
        setSupportsPWA(false);
      }
    };
    
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addListener(mediaHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      mediaQuery.removeListener(mediaHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!promptInstall) {
      return;
    }

    try {
      promptInstall.prompt();
      const { outcome } = await promptInstall.userChoice;
      
      if (outcome === 'accepted') {
        toast({
          title: "App Installation",
          description: "Thank you for installing Defect Manager!",
        });
      }
      
      setPromptInstall(null);
      setSupportsPWA(false);
      console.log(`Install prompt outcome: ${outcome}`);
    } catch (error) {
      console.error('Error installing PWA:', error);
      toast({
        title: "Installation Error",
        description: "Failed to install the app. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!supportsPWA || !showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-4 bg-[#132337] p-4 rounded-lg shadow-lg border border-[#3BADE5]/20 z-50">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-[#3BADE5]" />
        <div className="flex flex-col">
          <span className="text-sm text-white">Install Defect Manager</span>
          <span className="text-xs text-white/60">Get faster access & offline support</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 bg-[#3BADE5] text-white text-xs rounded-md hover:bg-[#3BADE5]/90 transition-colors"
        >
          Install
        </button>
        
        <button
          onClick={() => setShowBanner(false)}
          className="p-1 text-white/60 hover:text-white rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallPWA;
