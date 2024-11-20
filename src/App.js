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
  
  // Data states
  const [data, setData] = useState([]);
  const [assignedVessels, setAssignedVessels] = useState([]);
  const [vesselNames, setVesselNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [dataInitialized, setDataInitialized] = useState(false);
  
  // Filter states - updated for array of vessels
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

  // Initialize auth listener
  // Replace your useEffect and loadData implementations with these:

useEffect(() => {
  const initializeApp = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user?.id) {
        // Load data immediately after auth
        await loadData(session.user.id);
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      toast({
        title: "Error",
        description: "Failed to initialize application",
        variant: "destructive",
      });
    } finally {
      setDataInitialized(true);
    }
  };

  initializeApp();

  // Auth subscription
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    setSession(session);
    if (session?.user?.id) {
      await loadData(session.user.id);
    } else {
      // Clear data when logged out
      setData([]);
      setAssignedVessels([]);
      setVesselNames({});
    }
  });

  return () => subscription.unsubscribe();
}, []); // Empty dependency array

const loadData = async (userId) => {
  try {
    setLoading(true);

    // First try to get cached data
    let cachedDefects = await offlineSync.getDefects();
    if (cachedDefects?.length) {
      setData(cachedDefects);
    }

    // Fetch vessels
    const { data: userVessels, error: vesselError } = await supabase
      .from('user_vessels')
      .select(`
        vessel_id,
        vessels!inner(vessel_id, vessel_name)
      `)
      .eq('user_id', userId);

    if (vesselError) throw vesselError;

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
    if (navigator.onLine) {
      const { data: defects, error: defectsError } = await supabase
        .from('defects register')
        .select('*')
        .in('vessel_id', vesselIds)
        .order('Date Reported', { ascending: false });

      if (defectsError) throw defectsError;

      if (defects) {
        // Update IndexedDB
        await offlineSync.storeData(defects);
        setData(defects);
      }
    }

    // If we still have no data, try one more time to get cached data
    if (!cachedDefects?.length && !navigator.onLine) {
      cachedDefects = await offlineSync.getDefects();
      if (cachedDefects?.length) {
        setData(cachedDefects);
      }
    }

  } catch (error) {
    console.error('Error loading data:', error);
    toast({
      title: "Error",
      description: "Failed to load data. Please try again.",
      variant: "destructive",
    });
  } finally {
    setLoading(false);
  }
};

// Add this useEffect for data refresh on reconnect
useEffect(() => {
  const handleOnline = async () => {
    if (session?.user?.id) {
      await loadData(session.user.id);
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}, [session]);
  
  // Fetch user data

const fetchUserData = useCallback(async () => {
  if (!session?.user?.id) return;

  try {
    setLoading(true);
    
    // Get user's vessels with names
    const userVessels = await getUserVessels(session.user.id);
    
    const vesselIds = userVessels.map(v => v.vessel_id);
    const vesselsMap = userVessels.reduce((acc, v) => {
      if (v.vessels) {
        acc[v.vessel_id] = v.vessels.vessel_name;
      }
      return acc;
    }, {});

    // Fetch defects for assigned vessels
    const { data: defects, error: defectsError } = await supabase
      .from('defects register')
      .select('*')
      .in('vessel_id', vesselIds)
      .order('Date Reported', { ascending: false });

    if (defectsError) throw defectsError;

    // Store fetched data in IndexedDB
    if (defects) {
      // Add localId to each defect before storing
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

  // Load initial data and handle offline
useEffect(() => {
  const initializeData = async () => {
    if (!session?.user) {
      setData([]);
      setAssignedVessels([]);
      setVesselNames({});
      return;
    }

    try {
      // Try to load cached data first
      const cachedDefects = await offlineSync.getDefects();
      if (cachedDefects?.length) {
        setData(cachedDefects);
      }

      // If online, fetch fresh data
      if (navigator.onLine) {
        await fetchUserData();
      }

      // Update pending sync count
      const pendingCount = await offlineSync.getPendingSyncCount();
      setPendingSyncCount(pendingCount);

    } catch (error) {
      console.error('Error initializing data:', error);
      toast({
        title: "Error",
        description: "Some data may not be available offline",
        variant: "destructive",
      });
    }
  };

  initializeData();
}, [session?.user, fetchUserData, offlineSync]);

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
    
    // Prepare data without id for new defects
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
      "SNo": updatedDefect.SNo || null  // Include SNo if it exists
    };

    let savedDefect;

    if (navigator.onLine) {
      let supabaseQuery;
      
      if (isNewDefect) {
        // For new defects, just insert the data without id
        supabaseQuery = supabase
          .from('defects register')
          .insert([defectData])
          .select()
          .single();
      } else {
        // For updates, include the id in the query condition only
        supabaseQuery = supabase
          .from('defects register')
          .update(defectData)
          .eq('id', updatedDefect.id)
          .select()
          .single();
      }

      const { data, error } = await supabaseQuery;
      if (error) throw error;
      savedDefect = data;

      // Store in offline cache
      await offlineSync.storeData(savedDefect);
    } else {
      // Offline handling
      const offlineId = `offline_${Date.now()}`;
      savedDefect = {
        ...defectData,
        id: isNewDefect ? offlineId : updatedDefect.id,
        _syncStatus: 'pending'
      };
      await offlineSync.storeData(savedDefect);
      setPendingSyncCount(await offlineSync.getPendingSyncCount());
    }

    // Update UI state
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
  
  const handleLogout = async () => {
  try {
    // First clear the cache
    await clearAppCache();
    
    // Then proceed with logout
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear offline data
    await offlineSync.clearAll();
    
    // Clear all state
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
  // PDF Generation handler
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

  // Get vessel name for ChatBot
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

        {!dataInitialized ? (
          <div className="min-h-screen bg-[#0B1623] flex items-center justify-center">
            <div className="text-white">Loading Defect Manager...</div>
          </div>
        ) : session ? (
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
            </main>

            {/* Add InstallPWA component */}
            <InstallPWA />
          </>
        ) : (
          <Auth onLogin={setSession} />
        )}

        {/* Render InstallPWA outside the auth check if you want it available before login */}
        {!session && <InstallPWA />}
      </div>
    </ToastProvider>
  );

export default App;
