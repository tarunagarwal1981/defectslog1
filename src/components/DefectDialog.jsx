import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Upload } from 'lucide-react';
import { toast } from './ui/use-toast';

const DefectDialog = ({ 
  isOpen, 
  onClose, 
  defect, 
  onChange, 
  onSave, 
  vessels, 
  isNew 
}) => {
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const validateDefect = (defectData) => {
    const required = [
      'vessel_id',
      'Equipments',
      'Description',
      'Status (Vessel)',
      'Criticality',
      'Date Reported'
    ];
    
    const missing = required.filter(field => !defectData[field]);
    
    if (missing.length > 0) {
      toast({
        title: "Required Fields Missing",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    onChange('associated_files', selectedFiles);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (!validateDefect(defect)) {
        setSaving(false);
        return;
      }

      await onSave(defect);
      setFiles([]);
      
    } catch (error) {
      console.error('Error in DefectDialog save:', error);
      toast({
        title: "Error",
        description: "Failed to save defect. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dialogDescription = isNew ? 'Create a new defect record with the form below.' : 'Edit the defect record details with the form below.';
  const dialogDescriptionId = 'defect-dialog-description';

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={onClose}
    >
      <DialogContent 
        className="max-w-md max-h-[90vh] overflow-y-auto bg-[#0B1623]"
        aria-describedby={dialogDescriptionId}
        description={dialogDescription}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-white">
            {isNew ? 'Add New Defect' : 'Edit Defect'}
          </DialogTitle>
          <p id={dialogDescriptionId} className="text-xs text-white/60">
            {dialogDescription}
          </p>
        </DialogHeader>
        
        <div className="grid gap-3 py-3">
          {/* Vessel Selection */}
          <div className="grid gap-1.5">
            <label htmlFor="vessel" className="text-xs font-medium text-white/80">
              Vessel <span className="text-red-400">*</span>
            </label>
            <select
              id="vessel"
              className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.vessel_id || ''}
              onChange={(e) => onChange('vessel_id', e.target.value)}
              required
              aria-required="true"
            >
              <option value="">Select Vessel</option>
              {Object.entries(vessels).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div className="grid gap-1.5">
            <label htmlFor="equipment" className="text-xs font-medium text-white/80">
              Equipment <span className="text-red-400">*</span>
            </label>
            <select
              id="equipment"
              className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.Equipments || ''}
              onChange={(e) => onChange('Equipments', e.target.value)}
              required
              aria-required="true"
            >
              <option value="">Select Equipment</option>
              <option value="Air System and Air Compressor">Air System and Air Compressor</option>
              <option value="Airconditioning & Refrigeration System">Airconditioning & Refrigeration System</option>
              <option value="Cargo and Ballast System">Cargo and Ballast System</option>
              <option value="Deck Crane and Grab">Deck Crane and Grab</option>
              <option value="BWTS">BWTS</option>
              <option value="Aux Engine">Aux Engine</option>
              <option value="Main Engine">Main Engine</option>
              <option value="LO System">LO System</option>
              <option value="FO System">FO System</option>
              <option value="FW and SW System">FW and SW System</option>
              <option value="Load line Item">Load line Item</option>
              <option value="SOLAS">SOLAS</option>
              <option value="MARPOL">MARPOL</option>
              <option value="Navigation and Radio Equipment">Navigation and Radio Equipment</option>
              <option value="Anchor and Mooring">Anchor and Mooring</option>
              <option value="Steam System">Steam System</option>
              <option value="Steering Gear and Rudder">Steering Gear and Rudder</option>
              <option value="Others">Others</option>
            </select>
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <label htmlFor="description" className="text-xs font-medium text-white/80">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="description"
              className="flex h-16 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.Description || ''}
              onChange={(e) => onChange('Description', e.target.value)}
              placeholder="Enter defect description"
              required
              aria-required="true"
            />
          </div>

          {/* Action Planned */}
          <div className="grid gap-1.5">
            <label htmlFor="action" className="text-xs font-medium text-white/80">
              Action Planned <span className="text-red-400">*</span>
            </label>
            <textarea
              id="action"
              className="flex h-16 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.['Action Planned'] || ''}
              onChange={(e) => onChange('Action Planned', e.target.value)}
              placeholder="Enter planned action"
              required
              aria-required="true"
            />
          </div>

          {/* Status */}
          <div className="grid gap-1.5">
            <label htmlFor="status" className="text-xs font-medium text-white/80">
              Status <span className="text-red-400">*</span>
            </label>
            <select
              id="status"
              className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.['Status (Vessel)'] || ''}
              onChange={(e) => onChange('Status (Vessel)', e.target.value)}
              required
              aria-required="true"
            >
              <option value="">Select Status</option>
              <option value="OPEN">Open</option>
              <option value="IN PROGRESS">In Progress</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Criticality */}
          <div className="grid gap-1.5">
            <label htmlFor="criticality" className="text-xs font-medium text-white/80">
              Criticality <span className="text-red-400">*</span>
            </label>
            <select
              id="criticality"
              className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.Criticality || ''}
              onChange={(e) => onChange('Criticality', e.target.value)}
              required
              aria-required="true"
            >
              <option value="">Select Criticality</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="dateReported" className="text-xs font-medium text-white/80">
                Date Reported <span className="text-red-400">*</span>
              </label>
              <input
                id="dateReported"
                type="date"
                className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
                value={defect?.['Date Reported'] || ''}
                onChange={(e) => onChange('Date Reported', e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="dateCompleted" className="text-xs font-medium text-white/80">
                Date Completed
              </label>
              <input
                id="dateCompleted"
                type="date"
                className="flex h-8 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
                value={defect?.['Date Completed'] || ''}
                onChange={(e) => onChange('Date Completed', e.target.value)}
              />
            </div>
          </div>

          {/* Associated Files */}
          <div className="grid gap-1.5">
            <label htmlFor="files" className="text-xs font-medium text-white/80">
              Associated Files
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] cursor-pointer hover:border-[#3BADE5]/40">
                <Upload className="h-4 w-4 text-white" />
                <span className="text-xs text-white">Upload Files</span>
                <input
                  id="files"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  aria-label="Upload files"
                />
              </label>
              {files.length > 0 && (
                <span className="text-xs text-white/60" role="status">
                  {files.length} file(s) selected
                </span>
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="grid gap-1.5">
            <label htmlFor="comments" className="text-xs font-medium text-white/80">
              Comments
            </label>
            <textarea
              id="comments"
              className="flex h-16 w-full rounded-[4px] border border-[#3BADE5]/20 bg-[#132337] px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#3BADE5] hover:border-[#3BADE5]/40"
              value={defect?.Comments || ''}
              onChange={(e) => onChange('Comments', e.target.value)}
              placeholder="Add any additional comments"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-7 px-3 text-xs font-medium rounded-[4px] border border-[#3BADE5]/20 hover:border-[#3BADE5]/40 text-white disabled:opacity-50"
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-7 px-3 text-xs font-medium rounded-[4px] bg-[#3BADE5] hover:bg-[#3BADE5]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={isNew ? "Add new defect" : "Save changes"}
          >
            {saving ? 'Saving...' : (isNew ? 'Add Defect' : 'Save Changes')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DefectDialog;
