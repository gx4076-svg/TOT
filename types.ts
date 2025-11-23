
// Represents a single herb in a formula
export interface Herb {
  name: string;
  dosage: number; // 0 if not specified
  unit: string;   // e.g., 'g', 'ml', '枚'
  originalText: string; // What the user typed
}

// Represents a standard formula in the database
export interface StandardFormula {
  id: string;
  name: string;
  source: string; // Book/Volume
  composition: string[]; // Standard ingredients names
  standardDosage?: Record<string, number>; // Standard ratio/dosage for calculation
  usage: string;
  effect: string; // 功效
  indications: string; // 主治
  analysis: string; // Textbook analysis
  isAiGenerated?: boolean; // Flag for dynamically retrieved formulas
}

// Result of matching user input against a standard formula
export interface MatchResult {
  formula: StandardFormula;
  score: number; // 0 to 1
  matchType: 'exact' | 'variant' | 'subset' | 'ratio-mismatch';
  missingHerbs: string[];
  additionalHerbs: Herb[];
  inputHerbs: Herb[]; // Added: The user's input herbs for visual diffing
  dosageAnalysis?: {
    similarity: number; // 0 to 1
    details: string;
  };
  isCombined?: boolean; // If it's part of a combined formula detection
  combinedWith?: string; // Name of the other formula if combined
}

export interface AnalysisResult {
  rawText: string;
  structuredAnalysis?: {
    modifications: string;
    dynamicMeaning: string;
    clinicalSuggestions: string;
  };
}
