import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Upload,
  FileSpreadsheet,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  ArrowRight,
  Play,
  ChevronDown,
  Workflow,
} from 'lucide-react';
import { ColumnMapping, ParsedExcelData, WorkflowVariable, BatchJob } from '@/types/batch.types';
import {
  listLocalWorkflows,
  type LocalWorkflowNode,
} from '@/shared/api/iris-local';
import { useBatchStore } from '@/features/batch/stores/batch.store';
import { toast } from '@/shared/lib/toast';
import ExcelJS from 'exceljs';

interface BatchJobCreateFormProps {
  onCancel: () => void;
  onCreated: (job: BatchJob) => void;
}

type Step = 'workflow' | 'upload' | 'mapping' | 'settings' | 'review';

const stepKeys: Step[] = ['workflow', 'upload', 'mapping', 'settings', 'review'];

interface WorkflowWithVariables {
  id: string;
  name: string;
  description?: string;
  inputVariables?: WorkflowVariable[];
}

/** Derive batch input variables from a local workflow's trigger/input nodes. */
function extractInputVariables(
  nodes: LocalWorkflowNode[],
): WorkflowVariable[] {
  const vars: WorkflowVariable[] = [];
  for (const node of nodes) {
    const config = node.config as { outputs?: Record<string, unknown> } | undefined;
    if (node.type === 'input' && config?.outputs) {
      for (const value of Object.values(config.outputs)) {
        const val = value as { variableName?: string; type?: string; required?: boolean };
        if (val?.variableName) {
          vars.push({
            name: val.variableName,
            type: val.type || 'string',
            required: val.required || false,
          });
        }
      }
    }
    if (node.type?.startsWith('TRIGGER_')) {
      for (const v of [
        { name: 'prompt', type: 'text' },
        { name: 'text', type: 'text' },
        { name: 'image', type: 'image' },
        { name: 'imageUrl', type: 'image' },
        { name: 'file', type: 'file' },
      ]) {
        if (!vars.some(x => x.name === v.name)) {
          vars.push({ name: v.name, type: v.type, required: false });
        }
      }
    }
  }
  return vars;
}

export function BatchJobCreateForm({ onCancel, onCreated }: BatchJobCreateFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>('workflow');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [workflows, setWorkflows] = useState<WorkflowWithVariables[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowWithVariables | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedExcelData | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [jobName, setJobName] = useState('');
  const [description, setDescription] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [startImmediately, setStartImmediately] = useState(true);

  // Dropdown state for column mapping
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const { createJob } = useBatchStore();

  // Concurrency limits (simplified for desktop)
  const concurrencyLimit = 10;

  // Fetch local workflows on mount. The local list already includes each
  // workflow's nodes, so input variables are derived inline (no extra fetch).
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const workflows = await listLocalWorkflows();
        setWorkflows(
          workflows.map((wf) => {
            const inputVariables = extractInputVariables(wf.nodes ?? []);
            return {
              id: wf.id,
              name: wf.name,
              description: wf.description,
              inputVariables:
                inputVariables.length > 0 ? inputVariables : undefined,
            };
          }),
        );
      } catch (err) {
        console.error('Failed to fetch local workflows:', err);
      }
    };
    fetchWorkflows();
  }, []);

  // Parse Excel file using ExcelJS
  const parseExcelFile = useCallback(async (buffer: ArrayBuffer, fileName: string): Promise<ParsedExcelData> => {
    const workbook = new ExcelJS.Workbook();

    // Check file extension to determine parse method
    if (fileName.endsWith('.csv')) {
      // Parse CSV
      const text = new TextDecoder().decode(buffer);
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const rowData: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });
        return rowData;
      });

      return { headers, rows, sheetNames: ['Sheet1'] };
    }

    // Parse Excel
    await workbook.xlsx.load(buffer);

    const sheetNames = workbook.worksheets.map((ws: ExcelJS.Worksheet) => ws.name);
    const firstSheet = workbook.worksheets[0];

    if (!firstSheet || firstSheet.rowCount === 0) {
      throw new Error('Excel file is empty');
    }

    // Get headers from first row
    const headerRow = firstSheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
      headers[colNumber - 1] = String(cell.value || '').trim();
    });

    if (headers.length === 0) {
      throw new Error('No headers found in Excel file');
    }

    // Get data rows
    const rows: Record<string, unknown>[] = [];
    for (let rowNum = 2; rowNum <= firstSheet.rowCount; rowNum++) {
      const row = firstSheet.getRow(rowNum);
      const rowData: Record<string, unknown> = {};
      let hasData = false;

      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        const value = cell.value;
        rowData[header] = value ?? '';
        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    }

    return { headers, rows, sheetNames };
  }, []);

  // Process selected file (shared logic for both Electron and browser)
  const processFile = useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    const data = await parseExcelFile(buffer, fileName);
    setParsedData(data);

    // Create a File object for upload
    const blob = new Blob([buffer], {
      type: fileName.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const fileObj = new File([blob], fileName, { type: blob.type });
    setFile(fileObj);

    // Auto-generate job name
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    setJobName(`${baseName} - ${selectedWorkflow?.name || 'Batch'}`);

    // Auto-map columns with matching variable names
    if (selectedWorkflow?.inputVariables) {
      const autoMappings: ColumnMapping[] = [];
      data.headers.forEach((header) => {
        const matchingVar = selectedWorkflow.inputVariables?.find(
          (v) => v.name.toLowerCase() === header.toLowerCase() ||
                 v.name.toLowerCase().replace(/_/g, '') === header.toLowerCase().replace(/[_\s]/g, '')
        );
        if (matchingVar) {
          autoMappings.push({
            columnName: header,
            variableName: matchingVar.name,
          });
        }
      });
      setColumnMappings(autoMappings);
    }
  }, [parseExcelFile, selectedWorkflow]);

  // Handle file selection via Electron dialog
  const handleSelectFile = useCallback(async () => {
    setError(null);

    // Check if running in Electron environment
    if (typeof window !== 'undefined' && window.electronAPI?.files) {
      try {
        const selectedPath = await window.electronAPI.files.selectFile({
          filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'csv'] }]
        });

        if (!selectedPath) return;

        const buffer = await window.electronAPI.files.readFile(selectedPath);
        const fileName = selectedPath.split(/[/\\]/).pop() || 'file.xlsx';

        await processFile(buffer, fileName);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
        setFile(null);
        setParsedData(null);
      }
    } else {
      // Browser fallback - trigger hidden file input
      const input = document.getElementById('batch-file-input') as HTMLInputElement;
      if (input) {
        input.click();
      }
    }
  }, [processFile]);

  // Handle browser file input change
  const handleBrowserFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setError(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      await processFile(buffer, selectedFile.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setFile(null);
      setParsedData(null);
    }

    // Reset input value to allow selecting the same file again
    event.target.value = '';
  }, [processFile]);

  // Update column mapping
  const updateMapping = (columnName: string, variableName: string) => {
    setColumnMappings((prev) => {
      const existing = prev.findIndex((m) => m.columnName === columnName);
      if (variableName === '') {
        return prev.filter((m) => m.columnName !== columnName);
      }
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { columnName, variableName };
        return updated;
      }
      return [...prev, { columnName, variableName }];
    });
  };

  // Get mapped variable for column
  const getMappedVariable = (columnName: string) => {
    return columnMappings.find((m) => m.columnName === columnName)?.variableName || '';
  };

  // Validate current step
  const validateStep = (): boolean => {
    switch (currentStep) {
      case 'workflow':
        return !!selectedWorkflow;
      case 'upload':
        return !!file && !!parsedData;
      case 'mapping':
        return columnMappings.length > 0;
      case 'settings':
        return !!jobName.trim();
      default:
        return true;
    }
  };

  // Navigate steps
  const nextStep = () => {
    const stepIndex = stepKeys.indexOf(currentStep);
    if (stepIndex < stepKeys.length - 1) {
      setCurrentStep(stepKeys[stepIndex + 1]);
    }
  };

  const prevStep = () => {
    const stepIndex = stepKeys.indexOf(currentStep);
    if (stepIndex > 0) {
      setCurrentStep(stepKeys[stepIndex - 1]);
    }
  };

  // Submit batch job
  const handleSubmit = async () => {
    if (!selectedWorkflow || !file || !parsedData) return;

    setLoading(true);
    setError(null);

    try {
      const jobData = {
        workflowId: selectedWorkflow.id,
        name: jobName,
        description: description || undefined,
        columnMappings,
        concurrency: Math.min(concurrency, concurrencyLimit),
        stopOnError: false,
        notifyOnComplete: false,
        notifyOnError: false,
      };

      const job = await createJob(jobData, file, startImmediately);

      if (job) {
        toast.success('Batch job created successfully');
        onCreated(job);
      } else {
        throw new Error('Failed to create batch job');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create batch job');
    } finally {
      setLoading(false);
    }
  };

  // Step labels
  const stepLabels: Record<Step, string> = {
    workflow: 'Select Workflow',
    upload: 'Upload File',
    mapping: 'Map Columns',
    settings: 'Settings',
    review: 'Review & Start',
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'workflow':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Select a Workflow</h2>
            <p className="text-sm text-white/60">Choose the workflow you want to run in batch</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
              {workflows.length === 0 ? (
                <div className="col-span-2 flex flex-col items-center justify-center py-12 text-center">
                  <Workflow size={48} className="text-white/20 mb-4" />
                  <p className="text-white/60">No workflows found</p>
                  <p className="text-sm text-white/40">Create a workflow first to use batch processing</p>
                </div>
              ) : (
                workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    onClick={() => setSelectedWorkflow(workflow)}
                    className={cn(
                      'p-4 rounded-lg border text-left transition-all',
                      selectedWorkflow?.id === workflow.id
                        ? 'border-slate-400 bg-slate-400/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {selectedWorkflow?.id === workflow.id && (
                        <Check size={16} className="text-slate-300" />
                      )}
                      <span className="font-medium text-white">{workflow.name}</span>
                    </div>
                    {workflow.description && (
                      <p className="text-xs text-white/50 line-clamp-2">{workflow.description}</p>
                    )}
                    {workflow.inputVariables && workflow.inputVariables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {workflow.inputVariables.slice(0, 3).map((v) => (
                          <span key={v.name} className="px-2 py-0.5 bg-white/10 rounded text-[10px] text-white/60">
                            {v.name}
                          </span>
                        ))}
                        {workflow.inputVariables.length > 3 && (
                          <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] text-white/60">
                            +{workflow.inputVariables.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Upload File</h2>
            <p className="text-sm text-white/60">Upload an Excel or CSV file with your batch data</p>

            {/* Hidden file input for browser fallback */}
            <input
              type="file"
              id="batch-file-input"
              accept=".xlsx,.csv"
              onChange={handleBrowserFileChange}
              className="hidden"
            />

            {!file ? (
              <div
                onClick={handleSelectFile}
                className={cn(
                  'border-2 border-dashed border-white/20 rounded-xl p-12',
                  'flex flex-col items-center justify-center text-center',
                  'hover:border-slate-400/50 hover:bg-slate-400/5 transition-colors cursor-pointer'
                )}
              >
                <Upload size={48} className="text-white/30 mb-4" />
                <p className="text-white font-medium mb-2">Click to select a file</p>
                <p className="text-sm text-white/50">Supports XLSX and CSV files</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* File info */}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet size={24} className="text-green-400" />
                    <div>
                      <p className="font-medium text-white">{file.name}</p>
                      <p className="text-xs text-white/50">
                        {parsedData?.rows.length ?? 0} rows, {parsedData?.headers.length ?? 0} columns
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setParsedData(null);
                      setColumnMappings([]);
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X size={18} className="text-white/50" />
                  </button>
                </div>

                {/* Preview */}
                {parsedData && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white">Preview (first 5 rows)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            {parsedData.headers.map((header, i) => (
                              <th key={i} className="px-3 py-2 text-left text-white/60 font-medium">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedData.rows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-white/5">
                              {parsedData.headers.map((header, j) => (
                                <td key={j} className="px-3 py-2 text-white/80 max-w-[200px] truncate">
                                  {String(row[header] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'mapping': {
        const skipLabel = 'Skip this column';
        const variableOptions = [
          { value: '', label: skipLabel },
          ...(selectedWorkflow?.inputVariables?.map((v) => ({
            value: v.name,
            label: `${v.name}${v.required ? ' *' : ''}`,
          })) || []),
        ];

        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Map Columns to Variables</h2>
            <p className="text-sm text-white/60">
              Map your spreadsheet columns to workflow input variables
            </p>

            {selectedWorkflow?.inputVariables && selectedWorkflow.inputVariables.length > 0 && (
              <div className="p-3 bg-slate-400/10 border border-slate-400/20 rounded-lg">
                <p className="text-xs text-slate-200 mb-2">Available workflow variables:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedWorkflow.inputVariables.map((v) => (
                    <span key={v.name} className="px-2 py-1 bg-slate-400/20 rounded text-xs text-slate-200">
                      {v.name}{v.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={cn(
              "space-y-3",
              openDropdown ? "overflow-visible" : "max-h-[400px] overflow-y-auto"
            )}>
              {parsedData?.headers.map((header) => {
                const isOpen = openDropdown === header;
                const selectedValue = getMappedVariable(header);
                const selectedOption = variableOptions.find(opt => opt.value === selectedValue);

                return (
                  <div
                    key={header}
                    className={cn(
                      "flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/10",
                      isOpen && "relative z-[100]"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{header}</p>
                      <p className="text-xs text-white/50 truncate">
                        Sample: {String(parsedData.rows[0]?.[header] ?? '-').slice(0, 50)}
                      </p>
                    </div>

                    <ArrowRight size={16} className="text-white/30 flex-shrink-0" />

                    {/* Custom Dropdown */}
                    <div className="flex-1 relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(isOpen ? null : header)}
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-sm text-left',
                          'bg-white/10 border border-white/10 hover:border-white/20',
                          'text-white transition-colors flex items-center justify-between gap-2',
                          isOpen && 'border-slate-400/50',
                          selectedValue && 'border-slate-400/30 bg-slate-400/10'
                        )}
                      >
                        <span className={cn(
                          'truncate',
                          !selectedValue && 'text-white/50'
                        )}>
                          {selectedOption?.label || skipLabel}
                        </span>
                        <ChevronDown size={14} className={cn(
                          'text-white/50 transition-transform flex-shrink-0',
                          isOpen && 'rotate-180'
                        )} />
                      </button>

                      {isOpen && (
                        <div className="absolute z-[200] mt-1 w-full bg-zinc-800 border border-white/20 rounded-lg shadow-2xl overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            {variableOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  updateMapping(header, option.value);
                                  setOpenDropdown(null);
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors',
                                  option.value === selectedValue
                                    ? 'bg-slate-400/20 text-slate-200'
                                    : 'text-white/80'
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {columnMappings.length === 0 && (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertCircle size={16} />
                <span>Map at least one column to continue</span>
              </div>
            )}
          </div>
        );
      }

      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Job Settings</h2>

            {/* Job Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Job Name</label>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Enter a name for this batch job"
                className={cn(
                  'w-full px-4 py-2 rounded-lg text-sm',
                  'bg-white/5 border border-white/10 focus:border-slate-400/50',
                  'text-white placeholder-white/40 outline-none transition-colors'
                )}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add an optional description"
                rows={3}
                className={cn(
                  'w-full px-4 py-2 rounded-lg text-sm resize-none',
                  'bg-white/5 border border-white/10 focus:border-slate-400/50',
                  'text-white placeholder-white/40 outline-none transition-colors'
                )}
              />
            </div>

            {/* Concurrency */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Parallel Execution</label>
              <p className="text-xs text-white/50">
                Process up to {concurrencyLimit} rows at the same time
              </p>
              <input
                type="range"
                min={1}
                max={concurrencyLimit}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full accent-slate-400"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">{concurrency} parallel execution{concurrency > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Review & Start</h2>

            {/* Summary */}
            <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-white/50">Workflow</p>
                  <p className="text-white font-medium">{selectedWorkflow?.name}</p>
                </div>
                <div>
                  <p className="text-white/50">File</p>
                  <p className="text-white font-medium">{file?.name}</p>
                </div>
                <div>
                  <p className="text-white/50">Total Rows</p>
                  <p className="text-white font-medium">{parsedData?.rows.length}</p>
                </div>
                <div>
                  <p className="text-white/50">Column Mappings</p>
                  <p className="text-white font-medium">{columnMappings.length}</p>
                </div>
                <div>
                  <p className="text-white/50">Concurrency</p>
                  <p className="text-white font-medium">{concurrency}</p>
                </div>
              </div>
            </div>

            {/* Mappings */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-white">Column Mappings</p>
              <div className="space-y-1">
                {columnMappings.map((mapping) => (
                  <div key={mapping.columnName} className="flex items-center gap-2 text-sm">
                    <span className="text-white/60">{mapping.columnName}</span>
                    <ArrowRight size={14} className="text-white/30" />
                    <span className="text-slate-300">{mapping.variableName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Start immediately */}
            <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-400/10 rounded-lg border border-slate-400/30">
              <input
                type="checkbox"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-slate-400 focus:ring-slate-400"
              />
              <div>
                <span className="text-sm font-medium text-white">Start immediately</span>
                <p className="text-xs text-white/50">Begin processing as soon as the job is created</p>
              </div>
            </label>
          </div>
        );
    }
  };

  const stepIndex = stepKeys.indexOf(currentStep);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Steps indicator */}
      <div className="flex items-center justify-between mb-8">
        {stepKeys.map((stepKey, i) => (
          <div key={stepKey} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  i < stepIndex
                    ? 'bg-slate-400 text-white'
                    : i === stepIndex
                    ? 'bg-slate-400/20 text-slate-300 border border-slate-400'
                    : 'bg-white/10 text-white/40'
                )}
              >
                {i < stepIndex ? <Check size={16} /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-sm hidden sm:block',
                  i <= stepIndex ? 'text-white' : 'text-white/40'
                )}
              >
                {stepLabels[stepKey]}
              </span>
            </div>
            {i < stepKeys.length - 1 && (
              <div
                className={cn(
                  'w-12 h-0.5 mx-2',
                  i < stepIndex ? 'bg-slate-400' : 'bg-white/10'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Content */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 mb-6">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={stepIndex === 0 ? onCancel : prevStep}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-white/10 hover:bg-white/20 text-white transition-colors'
          )}
        >
          <ChevronLeft size={18} />
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>

        {currentStep === 'review' ? (
          <button
            onClick={handleSubmit}
            disabled={loading || !validateStep()}
            className={cn(
              'flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300 hover:from-white hover:to-white',
              'text-neutral-900 shadow-lg shadow-slate-400/20',
              (loading || !validateStep()) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Play size={18} />
                {startImmediately ? 'Create & Start' : 'Create Job'}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={nextStep}
            disabled={!validateStep()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-slate-400 hover:bg-slate-500 text-white transition-colors',
              !validateStep() && 'opacity-50 cursor-not-allowed'
            )}
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
