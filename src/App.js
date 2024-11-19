import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './components/ui/toast';
import { useToast } from './components/ui/use-toast';
import { AlertDialog, AlertDialogContent } from './components/ui/alert-dialog';
import Auth from './components/Auth';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import SearchBar from './components/SearchBar';
import DefectsTable from './components/DefectsTable';
import DefectDialog from './components/DefectDialog';
import ChatBot from './components/ChatBot/ChatBot';
import { supabase } from './supabaseClient';
import OfflineSync from './services/OfflineSync';

function App() {
  const { toast } = useToast();
  
  // State Management
  const [session, setSession] = useState(null);
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

  // Offline sync states
  const [offlineSync] = useState(() => new OfflineSync());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Initialize app with auth and data loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Get initial session
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        
        if (session?.user?.id) {
          await loadUserData(session.user.id);
        }
        
      } catch (error) {
        console.error('Error initializing app:', error);
        toast({
          title: "Initialization Error",
          description: "Failed to start app properly. Please refresh.",
          variant: "destructive",
        });
      } finally {
        setDataInitialized(true);
      }
    };

    initializeApp();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        await loadUserData(session.user.id);
      } else {
        // Clear data on logout
        setData([]);
        setAssignedVessels([]);
        setVesselNames({});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user data function
  const loadUserData = async (userId) => {
    try {
      setLoading(true);

      // First try to load cached data
      const cachedData = await offlineSync.getInitialData();
      if (cachedData) {
        const { defects, vessels } = cachedData;
        if (defects?.length) setData(defects);
        if (vessels) {
          setAssignedVessels(vessels.map(v => v.vessel_id));
          setVesselNames(vessels.reduce((acc, v) => {
            acc[v.vessel_id] = v.vessel_name;
            return acc;
          }, {}));
        }
      }

      // Get user's vessels
      const { data: userVessels, error: vesselError } = await supabase
        .from('user_vessels')
        .select(`
          vessel_id,
          vessels!inner(vessel_id, vessel_name)
        `)
        .eq('user_id', userId);

      if (vesselError) throw vesselError;

      // Process vessel data
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
          // Store in IndexedDB for offline access
          await offlineSync.storeData('defects', defects);
          await offlineSync.storeData('vessels', 
            vesselIds.map(id => ({ vessel_id: id, vessel_name: vesselsMap[id] }))
          );
          setData(defects);
        }
      }

      // Update pending sync count
      const pendingCount = await offlineSync.getPendingSyncCount();
      setPendingSyncCount(pendingCount);

    } catch (error) {
      console.error('Error loading user data:', error);
      toast({
        title: "Error",
        description: "Failed to load some data. Please try refreshing.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      try {
        // Sync pending changes
        const syncResult = await offlineSync.syncWithServer(supabase);
        
        if (syncResult.success) {
          if (session?.user) {
            await loadUserData(session.user.id);
          }
          toast({
            title: "Sync Complete",
            description: "All changes have been synchronized",
          });
        } else {
          throw new Error(syncResult.error);
        }
      } catch (error) {
        console.error('Sync error:', error);
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
        description: "Changes will be saved locally and synced when online",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session, offlineSync]);

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
        description: "No vessels assigned. Please contact administrator.",
        variant: "destructive",
      });
      return;
    }

    setCurrentDefect({
      id: `temp-${Date.now()}`,
      vessel_id: '',
      Equipments: '',
      Description: '',
      'Action Planned': '',
      Criticality: '',
      'Status (Vessel)': 'OPEN',
      'Date Reported': new Date().toISOString().split('T')[0],
      'Date Completed': '',
      Comments: ''
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
        Comments: updatedDefect.Comments || ''
      };

      let savedDefect;

      if (navigator.onLine) {
        // Online save
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

        // Update offline storage
        await offlineSync.storeData('defects', [savedDefect]);
      } else {
        // Offline save
        savedDefect = {
          ...defectData,
          id: isNewDefect ? `offline_${Date.now()}` : updatedDefect.id,
          _syncStatus: 'pending'
        };
        await offlineSync.storeData('defects', [savedDefect]);
        
        // Update pending sync count
        const pendingCount = await offlineSync.getPendingSyncCount();
        setPendingSyncCount(pendingCount);
      }

      // Update local state
      setData(prevData => {
        const newData = isNewDefect
          ? [savedDefect, ...prevData]
          : prevData.map(d => d.id === savedDefect.id ? savedDefect : d);
        return newData.sort((a, b) => 
          new Date(b['Date Reported']) - new Date(a['Date Reported'])
        );
      });

      toast({
        title: isNewDefect ? "Defect Added" : "Defect Updated",
        description: navigator.onLine 
          ? "Saved successfully" 
          : "Saved offline - will sync when online",
      });

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

  // Handle logout
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear offline data
      await offlineSync.clearAll();
      
      // Clear local state
      setData([]);
      setAssignedVessels([]);
      setVesselNames({});
      setCurrentVessel([]);
      setPendingSyncCount(0);
      
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Error",
        description: "Failed to log out properly",
        variant: "destructive",
      });
    }
  };

  // Handle PDF generation
  const handleGeneratePdf = async () => {
    setIsPdfGenerating(true);
    try {
      // Your PDF generation logic here
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Loading state
  if (!dataInitialized) {
    return (
      <div className="min-h-screen bg-[#0B1623] flex items-center justify-center">
        <div className="text-white text-lg">Loading Defect Manager...</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-2 text-center z-50">
            Working Offline 
            {pendingSyncCount > 0 && ` - ${pendingSyncCount} changes pending sync`}
          </div>
        )}
        
        {/* Syncing Dialog */}
        {isSyncing && (
          <AlertDialog open={true}>
            <AlertDialogContent className="bg-background text-white">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Syncing changes...</span>
              </div>
            </AlertDialogContent>
          </AlertDialog>
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
                searchTerm={searchTerm}
                statusFilter={statusFilter}
                criticalityFilter={criticalityFilter}
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
                vesselName={currentVessel.length === 0 
                  ? 'All Vessels' 
                  : currentVessel.length === 1 
                    ? vesselNames[currentVessel[0]] 
                    : `${currentVessel.length} Vessels Selected`}
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
