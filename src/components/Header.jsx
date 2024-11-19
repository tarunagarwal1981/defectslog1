import React, { useState, useEffect } from 'react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from './ui/dropdown-menu';
import { User, LogOut, ChevronDown, Download } from 'lucide-react';

// PWA Install Button Component
const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      // Prevent default install prompt
      e.preventDefault();
      console.log('👉 beforeinstallprompt event triggered');
      setPromptInstall(e);
      setSupportsPWA(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if PWA is installable
    const isInstallable = window.matchMedia('(display-mode: standalone)').matches;
    console.log('👉 Is app installable?', isInstallable);

    // Log if already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    console.log('👉 Is app already installed?', isInstalled);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!promptInstall) {
      console.log('👉 No install prompt available');
      return;
    }
    
    console.log('👉 Showing install prompt');
    promptInstall.prompt();
    
    const { outcome } = await promptInstall.userChoice;
    console.log('👉 User choice:', outcome);
    
    if (outcome === 'accepted') {
      console.log('👉 PWA installed successfully');
      setPromptInstall(null);
    }
  };

  // Always show button during development
  const isDev = process.env.NODE_ENV === 'development';
  
  if (!supportsPWA && !isDev) {
    console.log('👉 PWA not supported or already installed');
    return null;
  }

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-2 px-3 py-1.5 bg-[#3BADE5] text-white rounded-md hover:bg-[#3BADE5]/90 transition-colors text-sm"
    >
      <Download className="h-4 w-4" />
      <span>Install App</span>
    </button>
  );
};

const Header = ({ user, vessels, currentVessel, onVesselChange, onLogout }) => {
  // Convert currentVessel to array if it's a string or empty
  const selectedVessels = Array.isArray(currentVessel) 
    ? currentVessel 
    : currentVessel ? [currentVessel] : [];

  const handleVesselToggle = (vesselId) => {
    if (vesselId === '') {
      // If "All Vessels" is clicked, clear selection
      onVesselChange([]);
      return;
    }

    const updatedSelection = selectedVessels.includes(vesselId)
      ? selectedVessels.filter(id => id !== vesselId)
      : [...selectedVessels, vesselId];
    
    onVesselChange(updatedSelection);
  };

  // Get display text for vessel selector
  const getVesselDisplayText = () => {
    if (selectedVessels.length === 0) return 'All Vessels';
    if (selectedVessels.length === 1) {
      const vesselName = vessels.find(([id]) => id === selectedVessels[0])?.[1];
      return vesselName || 'All Vessels';
    }
    return `${selectedVessels.length} Vessels Selected`;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-10 bg-background border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">Defects Manager</h1>
          
          {/* Vessel Multi-select Dropdown */}
          {vessels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-2 bg-background border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 hover:bg-accent/50">
                <span>{getVesselDisplayText()}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Select Vessels
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[300px] overflow-y-auto">
                  {/* All Vessels Option */}
                  <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent">
                    <label className="flex flex-1 items-center">
                      <input
                        type="checkbox"
                        className="mr-2 h-4 w-4 rounded border-gray-300"
                        checked={selectedVessels.length === 0}
                        onChange={() => handleVesselToggle('')}
                      />
                      All Vessels
                    </label>
                  </div>
                  {/* Individual Vessel Options */}
                  {vessels.map(([id, name]) => (
                    <div 
                      key={id}
                      className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent"
                    >
                      <label className="flex flex-1 items-center">
                        <input
                          type="checkbox"
                          className="mr-2 h-4 w-4 rounded border-gray-300"
                          checked={selectedVessels.includes(id)}
                          onChange={() => handleVesselToggle(id)}
                        />
                        {name}
                      </label>
                    </div>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right Section: Install Button and User Menu */}
        <div className="flex items-center space-x-4">
          <InstallPWA />
          
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-2 hover:bg-accent rounded-full p-2">
                <User className="h-5 w-5" />
                <span className="text-sm font-medium">{user.email}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onLogout} className="text-red-500">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
