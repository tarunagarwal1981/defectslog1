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
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    
    // Format dates properly
    const reportedDate = updatedDefect['Date Reported'] ? 
      new Date(updatedDefect['Date Reported']).toISOString().split('T')[0] : null;
    
    const completedDate = updatedDefect['Date Completed'] ? 
      new Date(updatedDefect['Date Completed']).toISOString().split('T')[0] : null;

    // Prepare data for Supabase
    const defectData = {
      vessel_id: updatedDefect.vessel_id,
      vessel_name: vesselNames[updatedDefect.vessel_id],
      "Status (Vessel)": updatedDefect['Status (Vessel)'],
      Equipments: updatedDefect.Equipments,
      Description: updatedDefect.Description,
      "Action Planned": updatedDefect['Action Planned'],
      Criticality: updatedDefect.Criticality,
      "Date Reported": reportedDate,
      "Date Completed": completedDate,
      Comments: updatedDefect.Comments || ''
    };

    let result;

    // Handle saving based on online/offline status
    if (navigator.onLine) {
      if (isNewDefect) {
        // For new defects
        const { data: insertedData, error: insertError } = await supabase
          .from('defects register')
          .insert(defectData)
          .select()
          .single();

        if (insertError) {
          console.error('Insert Error:', insertError);
          throw insertError;
        }
        result = insertedData;

        // Add to local state and offline storage
        await offlineSync.storeData({
          ...result,
          localId: `server_${result.id}`
        });

        setData(prevData => [result, ...prevData]);
      } else {
        // For existing defects
        const { data: updatedData, error: updateError } = await supabase
          .from('defects register')
          .update(defectData)
          .eq('id', updatedDefect.id)
          .select()
          .single();

        if (updateError) {
          console.error('Update Error:', updateError);
          throw updateError;
        }
        result = updatedData;

        // Update local state and offline storage
        await offlineSync.storeData({
          ...result,
          localId: `server_${result.id}`
        });

        setData(prevData => 
          prevData.map(d => d.id === result.id ? result : d)
            .sort((a, b) => new Date(b['Date Reported']) - new Date(a['Date Reported']))
        );
      }

      toast({
        title: isNewDefect ? "Defect Added" : "Defect Updated",
        description: "Successfully saved to server",
      });
    } else {
      // Offline mode
      const tempDefect = {
        ...defectData,
        id: isNewDefect ? `temp-${Date.now()}` : updatedDefect.id,
        localId: `offline_${Date.now()}`,
        _syncStatus: 'pending'
      };

      await offlineSync.storeData(tempDefect);

      if (isNewDefect) {
        setData(prevData => [tempDefect, ...prevData]);
      } else {
        setData(prevData => 
          prevData.map(d => d.id === updatedDefect.id ? tempDefect : d)
        );
      }

      const pendingCount = await offlineSync.getPendingSyncCount();
      setPendingSyncCount(pendingCount);

      toast({
        title: isNewDefect ? "Defect Added" : "Defect Updated",
        description: "Saved offline. Will sync when connection is restored",
      });
    }

    // Close dialog and reset state
    setIsDefectDialogOpen(false);
    setCurrentDefect(null);

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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await offlineSync.clearAll();
    } catch (error) {
      console.error("Error logging out:", error);
      toast({
        title: "Error",
        description: error.message,
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
      <div className="min-h-screen bg-background">
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

        {session ? (
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
          </>
        ) : (
          <Auth onLogin={setSession} />
        )}
      </div>
    </ToastProvider>
  );
}

export default App;
