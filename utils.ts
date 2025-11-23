
import { Herb, MatchResult, StandardFormula } from './types';
import { HERB_ALIASES, CLASSIC_FORMULAS } from './constants';

// --- Parsing Logic ---

/**
 * Parses raw text input into structured Herb objects.
 * Handles delimiters: space, comma, newline, '、', etc.
 * Handles dosage formats: "Herb 30g", "Herb30", "Herb", etc.
 */
export const parseFormulaInput = (input: string): Herb[] => {
  // 1. Replace common Chinese punctuation/delimiters with standard spaces
  const normalizedInput = input
    .replace(/[，,、\n\r\t。]/g, ' ') // Added '。' just in case
    .trim();
  
  // 2. Split by spaces
  const tokens = normalizedInput.split(/\s+/).filter(t => t.length > 0);

  const herbs: Herb[] = [];

  // Regex breakdown:
  // ^([\u4e00-\u9fa5]+) -> Start with Chinese characters (Name)
  // (\d*\.?\d+)?        -> Optional number (Dosage)
  // ([a-zA-Z\u4e00-\u9fa5]+)?$ -> Optional unit (g, ml, 两, etc.)
  const parserRegex = /^([\u4e00-\u9fa5]+)(\d*\.?\d+)?([a-zA-Z\u4e00-\u9fa5]+)?$/;

  tokens.forEach(token => {
    const match = token.match(parserRegex);
    if (match) {
      const rawName = match[1];
      const rawDosage = match[2];
      const rawUnit = match[3] || 'g'; // Default to grams if just number

      // Resolve Alias
      const standardName = HERB_ALIASES[rawName] || rawName;

      herbs.push({
        name: standardName,
        dosage: rawDosage ? parseFloat(rawDosage) : 0,
        unit: rawUnit,
        originalText: token
      });
    }
  });

  return herbs;
};

/**
 * Formats a list of herb names into chunks of 4 (Four flavors per line).
 * Used for the Collection/Favorites view.
 */
export const formatHerbsToLines = (herbs: string[]): string[][] => {
    const lines: string[][] = [];
    for (let i = 0; i < herbs.length; i += 4) {
        lines.push(herbs.slice(i, i + 4));
    }
    return lines;
};

// --- Dosage Helper Functions ---

/**
 * Converts "Herb:9, Herb2:6" string to Record<string, number>
 */
export const parseDosageString = (str: string): Record<string, number> => {
    if (!str) return {};
    const result: Record<string, number> = {};
    // Split by space, comma, or chinese comma
    const parts = str.split(/[，,、\s]+/);
    parts.forEach(part => {
        // Look for pattern "Name:Number" or "NameNumber" or "Name=Number"
        const match = part.match(/^([\u4e00-\u9fa5]+)[:=]?(\d+(\.\d+)?)$/);
        if (match) {
            result[match[1]] = parseFloat(match[2]);
        }
    });
    return result;
};

/**
 * Converts Record<string, number> to "Herb:9 Herb2:6" string
 */
export const formatDosageToString = (dosage?: Record<string, number>): string => {
    if (!dosage) return '';
    return Object.entries(dosage)
        .map(([name, amount]) => `${name}:${amount}`)
        .join(' ');
};

// --- Matching Logic ---

/**
 * Calculates the cosine similarity between two dosage vectors.
 * Used to distinguish formulas with same ingredients but different ratios.
 */
const calculateRatioSimilarity = (
  inputHerbs: Herb[],
  standardDosage: Record<string, number>
): number => {
  const commonKeys = inputHerbs
    .filter(h => standardDosage[h.name])
    .map(h => h.name);
  
  if (commonKeys.length < 2) return 1; // Can't judge ratio with 0 or 1 common herb

  // Create vectors
  const inputVector = commonKeys.map(k => inputHerbs.find(h => h.name === k)!.dosage);
  const standardVector = commonKeys.map(k => standardDosage[k]);

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magInput = 0;
  let magStandard = 0;

  for (let i = 0; i < commonKeys.length; i++) {
    dotProduct += inputVector[i] * standardVector[i];
    magInput += inputVector[i] * inputVector[i];
    magStandard += standardVector[i] * standardVector[i];
  }

  if (magInput === 0 || magStandard === 0) return 0;

  return dotProduct / (Math.sqrt(magInput) * Math.sqrt(magStandard));
};

/**
 * Compares user input against a single standard formula to generate a MatchResult.
 */
export const compareFormulaWithInput = (inputHerbs: Herb[], formula: StandardFormula): MatchResult | null => {
    const inputNames = new Set(inputHerbs.map(h => h.name));
    const formulaNames = new Set(formula.composition);
    
    // 1. Calculate Ingredient Overlap
    const intersection = formula.composition.filter(name => inputNames.has(name));
    const missing = formula.composition.filter(name => !inputNames.has(name));
    const additional = inputHerbs.filter(h => !formulaNames.has(h.name));

    // --- SCORING ALGORITHM REVISION ---
    // Recall: How much of the standard formula did we find? (intersection / standard_len)
    const recall = intersection.length / formula.composition.length;
    
    // Precision: How much of the user's input is relevant to this formula? (intersection / input_len)
    const precision = intersection.length / inputHerbs.length;

    // F-Score like balance (Favor Recall slightly for search)
    // If user types 1 herb "Shu Di", Recall is 0.16 (1/6), Precision is 1.0.
    // We want this to show up.
    // Basic Score = (Recall + Precision) / 2
    let finalScore = (recall * 0.6) + (precision * 0.4);

    // --- FILTERING LOGIC ---
    // 1. Must have at least one matching herb.
    if (intersection.length === 0) return null;

    // 2. Remove the hard 0.3 threshold. 
    // Instead, filter out extremely weak matches only if the input is complex.
    // If input has > 4 herbs, and we only match 1, it's likely noise.
    if (inputHerbs.length > 4 && intersection.length <= 1 && !formula.isAiGenerated) {
        return null;
    }
    // If input is small (1-2 herbs), we accept any match (Subject Search Mode).
    
    let matchType: MatchResult['matchType'] = 'variant';
    let dosageNote = undefined;

    // 2. Check for Exact Ingredient Match (Set Equality)
    if (missing.length === 0 && additional.length === 0) {
      matchType = 'exact';
      finalScore = 1.0; // Boost to max
      
      // 3. If ingredients match exactly, check Dosage Ratios
      const hasDosage = inputHerbs.every(h => h.dosage > 0);
      if (hasDosage && formula.standardDosage) {
        const ratioScore = calculateRatioSimilarity(inputHerbs, formula.standardDosage);
        
        if (ratioScore < 0.85) {
          matchType = 'ratio-mismatch';
          finalScore *= ratioScore; // Penalize score slightly to differentiate from perfect ratio
          dosageNote = {
            similarity: ratioScore,
            details: '药味完全相同，但剂量比例与原方差异显著，可能为衍生方或类方。'
          };
        } else {
            dosageNote = {
                similarity: ratioScore,
                details: '剂量比例与原方高度符合。'
            }
        }
      }
    } else if (missing.length === 0 && additional.length > 0) {
      matchType = 'subset'; // Input is a superset of the formula (Formula is a subset of Input)
      // If user adds 1 herb to a 10 herb formula, score should be high.
      // Recall = 1. Precision = 10/11. Score high.
    } else if (missing.length > 0 && additional.length === 0) {
       // User input is a subset of formula. (e.g. user typed 2 herbs of a 4 herb formula)
       // Recall = 0.5. Precision = 1.0.
    }

    return {
      formula,
      score: finalScore,
      matchType,
      missingHerbs: missing,
      additionalHerbs: additional,
      inputHerbs: inputHerbs, // Pass through for diff visualization
      dosageAnalysis: dosageNote
    };
};

/**
 * Main logic to find best matching formulas from database.
 * @param inputHerbs User parsed herbs
 * @param database Optional source of formulas (defaults to static CLASSIC_FORMULAS)
 */
export const findMatches = (inputHerbs: Herb[], database: StandardFormula[] = CLASSIC_FORMULAS): MatchResult[] => {
  if (inputHerbs.length === 0) return [];

  const results: MatchResult[] = [];

  database.forEach(formula => {
    const result = compareFormulaWithInput(inputHerbs, formula);
    if (result) {
        results.push(result);
    }
  });

  // Sort by score descending
  const sortedMatches = results.sort((a, b) => b.score - a.score);

  // --- He Fang (Combined Formula) Detection Logic ---
  if (sortedMatches.length > 0) {
      const topMatch = sortedMatches[0];
      
      // Only check for combination if there are significant leftovers (at least 2 herbs)
      // and the top match isn't a perfect explanation itself.
      if (topMatch.additionalHerbs.length >= 2) {
          const leftoverHerbs = topMatch.additionalHerbs;
          
          // Run a recursive match on the leftovers
          // We loosen the restriction for the second formula to ensure we catch it
          const secondaryResults: MatchResult[] = [];
          database.forEach(f => {
              // Don't match the same formula again
              if (f.name === topMatch.formula.name) return;
              const r = compareFormulaWithInput(leftoverHerbs, f);
              if (r) secondaryResults.push(r);
          });
          
          const sortedSecondary = secondaryResults.sort((a, b) => b.score - a.score);

          if (sortedSecondary.length > 0) {
              const secondMatch = sortedSecondary[0];
              
              // Criteria for valid combination:
              // 1. The second formula must match a significant portion of the leftovers.
              // 2. The score of the second match should be reasonable (> 0.4 or > 1 match).
              
              // Calculate how many of the "leftovers" were explained by the second formula
              const explainedBySecond = secondMatch.formula.composition.filter(
                  c => leftoverHerbs.some(lh => lh.name === c)
              ).length;

              if (explainedBySecond >= 2 || (explainedBySecond === leftoverHerbs.length)) {
                  topMatch.isCombined = true;
                  topMatch.combinedWith = secondMatch.formula.name;
                  // Optionally, we could merge the scores, but identifying the name is sufficient for now.
              }
          }
      }
  }

  return sortedMatches;
};
