
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
    .replace(/[，,、\n\r\t。]/g, ' ') 
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

// --- Normalization Helpers ---

/**
 * Normalizes book names (e.g., "医学衷中参西录" -> "衷中参西").
 */
export const normalizeBookName = (rawName: string): string => {
    if (!rawName) return '未知';
    let name = rawName.replace(/[《》]/g, '').trim();

    const bookAliases: Record<string, string> = {
        '医学衷中参西录': '衷中参西',
        '金匮要略方论': '金匮要略',
        '备急千金要方': '千金方',
        '千金要方': '千金方',
        '太平惠民和剂局方': '局方',
        '和剂局方': '局方',
        '伤寒杂病论': '伤寒论',
        '小儿药证直诀': '小儿药证',
        '外科正宗': '外科正宗',
        '景岳全书': '景岳',
        '丹溪心法': '丹溪',
        '兰室秘藏': '兰室',
        '脾胃论': '脾胃论',
        '医方集解': '医方集解',
        '温病条辨': '温病',
        '温热经纬': '温热'
    };

    return bookAliases[name] || name;
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
 */
const calculateRatioSimilarity = (
  inputHerbs: Herb[],
  standardDosage: Record<string, number>
): number => {
  const commonKeys = inputHerbs
    .filter(h => standardDosage[h.name])
    .map(h => h.name);
  
  if (commonKeys.length < 2) return 1; 

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

    // --- SCORING ALGORITHM ---
    const recall = intersection.length / formula.composition.length;
    const precision = intersection.length / inputHerbs.length;

    // F-Score like balance (Favor Recall slightly for search)
    let finalScore = (recall * 0.6) + (precision * 0.4);

    // --- FILTERING LOGIC ---
    if (intersection.length === 0) return null;

    if (inputHerbs.length > 4 && intersection.length <= 1 && !formula.isAiGenerated) {
        return null;
    }
    
    let matchType: MatchResult['matchType'] = 'variant';
    let dosageNote = undefined;

    // 2. Check for Exact Ingredient Match
    if (missing.length === 0 && additional.length === 0) {
      matchType = 'exact';
      finalScore = 1.0; 
      
      const hasDosage = inputHerbs.every(h => h.dosage > 0);
      if (hasDosage && formula.standardDosage) {
        const ratioScore = calculateRatioSimilarity(inputHerbs, formula.standardDosage);
        
        if (ratioScore < 0.85) {
          matchType = 'ratio-mismatch';
          finalScore *= ratioScore; 
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
      matchType = 'subset'; 
    }

    return {
      formula,
      score: finalScore,
      matchType,
      missingHerbs: missing,
      additionalHerbs: additional,
      inputHerbs: inputHerbs, 
      dosageAnalysis: dosageNote
    };
};

/**
 * Main logic to find best matching formulas from database.
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

  const sortedMatches = results.sort((a, b) => b.score - a.score);

  // --- He Fang (Combined Formula) Detection Logic ---
  if (sortedMatches.length > 0) {
      const topMatch = sortedMatches[0];
      
      if (topMatch.additionalHerbs.length >= 2) {
          const leftoverHerbs = topMatch.additionalHerbs;
          
          const secondaryResults: MatchResult[] = [];
          database.forEach(f => {
              if (f.name === topMatch.formula.name) return;
              const r = compareFormulaWithInput(leftoverHerbs, f);
              if (r) secondaryResults.push(r);
          });
          
          const sortedSecondary = secondaryResults.sort((a, b) => b.score - a.score);

          if (sortedSecondary.length > 0) {
              const secondMatch = sortedSecondary[0];
              const explainedBySecond = secondMatch.formula.composition.filter(
                  c => leftoverHerbs.some(lh => lh.name === c)
              ).length;

              if (explainedBySecond >= 2 || (explainedBySecond === leftoverHerbs.length)) {
                  topMatch.isCombined = true;
                  topMatch.combinedWith = secondMatch.formula.name;
              }
          }
      }
  }

  return sortedMatches;
};
