import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './components/ui/toast';
import { useToast } from './components/ui/use-toast';
import Auth from './components/Auth';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import SearchBar from './components/SearchBar';
import DefectsTable from './components/DefectsTable';
import DefectDialog from './components/DefectDialog';
import ChatBot from './components/ChatBot/ChatBot';
import { supabase } from './supabaseClient';
import OfflineSync from './services/OfflineSync';
import { clearAppCache } from './index';
import InstallPWA from './components/InstallPWA';

const withTimeout = (promise, timeout = 10000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), timeout)
    )
  ]);
};

// Utility function for fetching user's vessels
const getUserVessels = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_vessels')
      .select(`
        vessel_id,
        vessels!inner (
          vessel_id,
          vessel_name
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user vessels:', error);
    throw error;
  }
};

function App() {
  const { toast } = useToast();
  
  // User and auth states
  const [session, setSession] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  // Data states
  const [data, setData] = useState([]);
  const [assignedVessels, setAssignedVessels] = useState([]);
  const [vesselNames, setVesselNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [dataInitialized, setDataInitialized] = useState(false);
  
  // Filter states
  const [currentVessel, setCurrentVessel] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState('');
  
  // Dialog states
  const [isDefectDialogOpen, setIsDefectDialogOpen] = useState(false);
  const [currentDefect, setCurrentDefect] = useState(null);

  // Offline states
  const [offlineSync] = useState(() => new OfflineSync());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // First, add these utility functions at the top level of your App.js, after imports
const withTimeout = (promise, timeout = 10000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), timeout)
    )
  ]);
};

const retryOperation = async (operation, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries - 1) throw error;
      const delay = 1000 * Math.pow(2, attempt); // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Then replace your loadData function with this improved version
const loadData = async (userId) => {
  return retryOperation(async () => {
    try {
      setLoading(true);
      setIsDataLoading(true);

      // First try to get cached data
      let cachedDefects = await withTimeout(offlineSync.getDefects(), 5000);
      if (cachedDefects?.length) {
        setData(cachedDefects);
        console.log('Loaded cached data:', cachedDefects.length, 'records');
      }

      // Fetch vessels with timeout
      const vesselPromise = supabase
        .from('user_vessels')
        .select(`
          vessel_id,
          vessels!inner(vessel_id, vessel_name)
        `)
        .eq('user_id', userId);

      const { data: userVessels, error: vesselError } = await withTimeout(vesselPromise, 10000);

      if (vesselError) {
        throw new Error(`Failed to fetch vessels: ${vesselError.message}`);
      }

      if (!userVessels || userVessels.length === 0) {
        console.warn('No vessels found for user:', userId);
      }

      const vesselIds = userVessels.map(v => v.vessel_id);
      const vesselsMap = userVessels.reduce((acc, v) => {
        if (v.vessels) {
          acc[v.vessel_id] = v.vessels.vessel_name;
        }
        return acc;
      }, {});

      setAssignedVessels(vesselIds);
      setVesselNames(vesselsMap);

      // If online, fetch fresh defects
      if (navigator.onLine && vesselIds.length > 0) {
        const defectsPromise = supabase
          .from('defects register')
          .select('*')
          .in('vessel_id', vesselIds)
          .order('Date Reported', { ascending: false });

        const { data: defects, error: defectsError } = await withTimeout(defectsPromise, 15000);

        if (defectsError) {
          throw new Error(`Failed to fetch defects: ${defectsError.message}`);
        }

        if (defects) {
          // Add localId to defects before storing
          const defectsWithLocalId = defects.map(defect => ({
            ...defect,
            localId: `server_${defect.id}`
          }));

          // Store in IndexedDB
          await withTimeout(offlineSync.storeData(defectsWithLocalId), 5000);
          console.log('Stored', defectsWithLocalId.length, 'defects in IndexedDB');
          
          setData(defects);
        }
      } else if (!navigator.onLine) {
        console.log('Offline mode - using cached data');
        // If offline and no cached data, try one more time
        if (!cachedDefects?.length) {
          cachedDefects = await withTimeout(offlineSync.getDefects(), 5000);
          if (cachedDefects?.length) {
            console.log('Retrieved backup cached data:', cachedDefects.length, 'records');
            setData(cachedDefects);
          }
        }
      }

      // Update pending sync count if offline
      if (!navigator.onLine) {
        const pendingCount = await withTimeout(offlineSync.getPendingSyncCount(), 3000);
        setPendingSyncCount(pendingCount);
      }

    } catch (error) {
      console.error('Error in loadData:', error);
      // Show different toast messages based on error type
      if (error.message.includes('timeout')) {
        toast({
          title: "Connection Timeout",
          description: "The operation took too long. Please check your connection.",
          variant: "destructive",
        });
      } else if (!navigator.onLine) {
        toast({
          title: "Offline Mode",
          description: "Loading from cached data. Some features may be limited.",
        });
      } else {
        toast({
          title: "Error Loading Data",
          description: "Failed to load some data. Please try again.",
          variant: "destructive",
        });
      }
      throw error; // Propagate error for retry mechanism
    } finally {
      setLoading(false);
      setIsDataLoading(false);
      setDataInitialized(true);
    }
  });
};

  // Initialize app
  useEffect(() => {
  let mounted = true;

  const initializeApp = async () => {
    try {
      setIsAuthChecking(true);

      // Add timeout to auth check
      const authResult = await withTimeout(supabase.auth.getSession());
      
      if (!mounted) return;
      
      const session = authResult.data.session;
      setSession(session);
      
      if (session?.user?.id) {
        setIsDataLoading(true);
        await loadData(session.user.id);
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      // If auth check fails, reset states
      setSession(null);
      setData([]);
      setAssignedVessels([]);
      setVesselNames({});
      
      toast({
        title: "Error",
        description: "Failed to check authentication. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      if (mounted) {
        setIsAuthChecking(false);
        setIsDataLoading(false);
        setDataInitialized(true);
      }
    }
  };

  initializeApp();

  // Auth state subscription with timeout
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!mounted) return;
    
    try {
      setIsAuthChecking(true);
      setSession(session);

      if (session?.user?.id) {
        setIsDataLoading(true);
        await withTimeout(loadData(session.user.id));
      } else {
        setData([]);
        setAssignedVessels([]);
        setVesselNames({});
      }
    } catch (error) {
      console.error('Error in auth state change:', error);
      toast({
        title: "Error",
        description: "Failed to update session. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      if (mounted) {
        setIsAuthChecking(false);
        setIsDataLoading(false);
      }
    }
  });

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, [toast]);


  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      
      const userVessels = await getUserVessels(session.user.id);
      
      const vesselIds = userVessels.map(v => v.vessel_id);
      const vesselsMap = userVessels.reduce((acc, v) => {
        if (v.vessels) {
          acc[v.vessel_id] = v.vessels.vessel_name;
        }
        return acc;
      }, {});

      const { data: defects, error: defectsError } = await supabase
        .from('defects register')
        .select('*')
        .in('vessel_id', vesselIds)
        .order('Date Reported', { ascending: false });

      if (defectsError) throw defectsError;

      if (defects) {
        const defectsWithLocalId = defects.map(defect => ({
          ...defect,
          localId: `server_${defect.id}`
        }));
        await offlineSync.storeData(defectsWithLocalId);
      }

      setAssignedVessels(vesselIds);
      setVesselNames(vesselsMap);
      setData(defects || []);
      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, toast, offlineSync]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      try {
        await offlineSync.syncWithServer();
        if (session?.user) {
          await fetchUserData();
        }
        const pendingCount = await offlineSync.getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        toast({
          title: "Back Online",
          description: "All changes have been synchronized",
        });
      } catch (error) {
        toast({
          title: "Sync Error",
          description: "Some changes failed to sync. Will retry later.",
          variant: "destructive",
        });
      } finally {
        setIsSyncing(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Offline Mode",
        description: "Changes will be saved locally and synced when back online",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineSync, fetchUserData, session, toast]);

  // Filter data
  const filteredData = React.useMemo(() => {
    return data.filter(defect => {
      const matchesVessel = currentVessel.length === 0 || currentVessel.includes(defect.vessel_id);
      const matchesStatus = !statusFilter || defect['Status (Vessel)'] === statusFilter;
      const matchesCriticality = !criticalityFilter || defect.Criticality === criticalityFilter;
      const matchesSearch = !searchTerm || 
        Object.values(defect).some(value => 
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );

      return matchesVessel && matchesStatus && matchesCriticality && matchesSearch;
    });
  }, [data, currentVessel, statusFilter, criticalityFilter, searchTerm]);

  // Handle adding new defect
  const handleAddDefect = () => {
    if (assignedVessels.length === 0) {
      toast({
        title: "Error",
        description: "No vessels assigned to you. Contact administrator.",
        variant: "destructive",
      });
      return;
    }

    setCurrentDefect({
      id: `temp-${Date.now()}`,
      SNo: data.length + 1,
      vessel_id: '',
      Equipments: '',
      Description: '',
      'Action Planned': '',
      Criticality: '',
      'Status (Vessel)': 'OPEN',
      'Date Reported': new Date().toISOString().split('T')[0],
      'Date Completed': '',
    });
    setIsDefectDialogOpen(true);
  };

  // Handle saving defect
  const handleSaveDefect = async (updatedDefect) => {
    try {
      if (!assignedVessels.includes(updatedDefect.vessel_id)) {
        throw new Error("Not authorized for this vessel");
      }

      const isNewDefect = updatedDefect.id?.startsWith('temp-');
      
      const defectData = {
        vessel_id: updatedDefect.vessel_id,
        vessel_name: vesselNames[updatedDefect.vessel_id],
        "Status (Vessel)": updatedDefect['Status (Vessel)'],
        Equipments: updatedDefect.Equipments,
        Description: updatedDefect.Description,
        "Action Planned": updatedDefect['Action Planned'],
        Criticality: updatedDefect.Criticality,
        "Date Reported": updatedDefect['Date Reported'],
        "Date Completed": updatedDefect['Date Completed'] || null,
        Comments: updatedDefect.Comments || '',
        "SNo": updatedDefect.SNo || null
      };

      let savedDefect;

      if (navigator.onLine) {
        const { data, error } = isNewDefect
          ? await supabase
              .from('defects register')
              .insert([defectData])
              .select()
              .single()
          : await supabase
              .from('defects register')
              .update(defectData)
              .eq('id', updatedDefect.id)
              .select()
              .single();

        if (error) throw error;
        savedDefect = data;
        await offlineSync.storeData(savedDefect);
      } else {
        savedDefect = {
          ...defectData,
          id: isNewDefect ? `offline_${Date.now()}` : updatedDefect.id,
          _syncStatus: 'pending'
        };
        await offlineSync.storeData(savedDefect);
        setPendingSyncCount(await offlineSync.getPendingSyncCount());
      }

      setData(prevData => {
        const newData = isNewDefect 
          ? [savedDefect, ...prevData]
          : prevData.map(d => d.id === savedDefect.id ? savedDefect : d);
        return newData.sort((a, b) => new Date(b['Date Reported']) - new Date(a['Date Reported']));
      });

      setIsDefectDialogOpen(false);
      setCurrentDefect(null);

      toast({
        title: isNewDefect ? "Defect Added" : "Defect Updated",
        description: navigator.onLine ? "Saved successfully" : "Saved offline - will sync when online",
      });

    } catch (error) {
      console.error("Error saving defect:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save defect",
        variant: "destructive",
      });
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await clearAppCache();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await offlineSync.clearAll();
      setData([]);
      setAssignedVessels([]);
      setVesselNames({});
      setCurrentVessel([]);
      
      toast({
        title: "Logged Out",
        description: "Successfully logged out and cleared cache",
      });
    } catch (error) {
      console.error("Error during logout:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to logout properly",
        variant: "destructive",
      });
    }
  };

  // Handle PDF generation
  const handleGeneratePdf = useCallback(async () => {
    setIsPdfGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPdfGenerating(false);
    }
  }, [toast]);

  // Get vessel display name
  const getSelectedVesselsDisplay = () => {
    if (currentVessel.length === 0) return 'All Vessels';
    if (currentVessel.length === 1) {
      return vesselNames[currentVessel[0]] || 'All Vessels';
    }
    return `${currentVessel.length} Vessels Selected`;
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background relative">
        {!isOnline && (
          <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-2 text-center z-50">
            Working Offline 
            {pendingSyncCount > 0 && ` - ${pendingSyncCount} changes pending sync`}
          </div>
        )}
        
        {isSyncing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-4 rounded-lg shadow-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span className="text-white">Syncing changes...</span>
              </div>
            </div>
          </div>
        )}

        {isAuthChecking ? (
          <div className="min-h-screen bg-[#0B1623] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
              <div className="text-white">Checking authentication...</div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-[#3BADE5] text-white rounded-md hover:bg-[#3BADE5]/90 text-sm"
              >
                Refresh Page
              </button>
            </div>
          </div>
        ) : !session ? (
          <>
            <Auth onLogin={setSession} />
            <InstallPWA />
          </>
        ) : isDataLoading ? (
          <div className="min-h-screen bg-[#0B1623] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
              <div className="text-white">Loading Defect Manager...</div>
              {!isOnline && (
                <div className="text-white/60 text-sm">Loading from cached data...</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <Header 
              user={session.user}
              vessels={Object.entries(vesselNames)}
              currentVessel={currentVessel}
              onVesselChange={setCurrentVessel}
              onLogout={handleLogout}
            />
            
            <main className="container mx-auto pt-20">
              <StatsCards data={filteredData} />
              
              <SearchBar 
                onSearch={setSearchTerm}
                onFilterStatus={setStatusFilter}
                onFilterCriticality={setCriticalityFilter}
                status={statusFilter}
                criticality={criticalityFilter}
              />
              
              <DefectsTable
                data={filteredData}
                onAddDefect={handleAddDefect}
                onEditDefect={(defect) => {
                  setCurrentDefect(defect);
                  setIsDefectDialogOpen(true);
                }}
                loading={loading}
              />

              <DefectDialog
                isOpen={isDefectDialogOpen}
                onClose={() => {
                  setIsDefectDialogOpen(false);
                  setCurrentDefect(null);
                }}
                defect={currentDefect}
                onChange={(field, value) => 
                  setCurrentDefect(prev => ({ ...prev, [field]: value }))
                }
                onSave={handleSaveDefect}
                vessels={vesselNames}
                isNew={currentDefect?.id?.startsWith('temp-')}
              />

              <ChatBot 
                data={filteredData}
                vesselName={getSelectedVesselsDisplay()}
                filters={{
                  status: statusFilter,
                  criticality: criticalityFilter,
                  search: searchTerm
                }}
                isPdfGenerating={isPdfGenerating}
                onGeneratePdf={handleGeneratePdf}
              />

              <InstallPWA />
            </main>
          </>
        )}
      </div>
    </ToastProvider>
  );
}

export default App;
