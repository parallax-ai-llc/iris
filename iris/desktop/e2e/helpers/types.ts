export interface StepResult {
  success: boolean;
  step: string;
  expected?: string;
  actual?: string;
  screenshot?: string;
  timestamp: number;
}
