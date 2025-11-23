
import { GoogleGenAI } from "@google/genai";
import { Herb, MatchResult, StandardFormula } from '../types';

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_ID = 'gemini-2.5-flash'; // Capable model for analysis and search

export const generateTCMAnalysis = async (
  inputHerbs: Herb[],
  primaryMatch: MatchResult
): Promise<string> => {
  const inputStr = inputHerbs.map(h => `${h.name}${h.dosage > 0 ? h.dosage + h.unit : ''}`).join('，');
  const standardStr = primaryMatch.formula.composition.join('，');
  const matchTypeDesc = primaryMatch.matchType === 'ratio-mismatch' 
    ? '药味相同但剂量比例不同' 
    : '药味加减';

  const prompt = `
    作为一个资深中医专家，请对以下方剂进行深度分析。

    【用户输入方剂】：${inputStr}
    【系统识别原方】：${primaryMatch.formula.name}（出处：${primaryMatch.formula.source}）
    【原方标准组成】：${standardStr}
    【识别关系】：${matchTypeDesc}
    ${primaryMatch.isCombined ? `【合方提示】：此方似乎包含 ${primaryMatch.combinedWith} 的组成。` : ''}
    ${primaryMatch.formula.isAiGenerated ? '【注】：此方为AI基于古籍检索匹配的结果。' : ''}

    请生成一份简明扼要的临床分析报告，包含以下三点（请使用Markdown格式）：

    1. **加减变化分析**：明确指出用户方相对于原方，增加了什么药，去掉了什么药，或者核心药物的剂量比例发生了什么关键变化。
    2. **方义衍变推导**：基于上述变化，分析方剂的功效侧重点发生了怎样的偏移？
    3. **临床应用建议**：这种变化可能更适合什么样的病证？

    要求：专业术语准确，逻辑清晰，字数控制在400字以内。
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
    });

    return response.text || "未能生成分析结果。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI 分析服务暂时不可用，请检查网络或稍后再试。";
  }
};

/**
 * Uses Gemini with Search Grounding to identify formulas not in the local database.
 * Effectively "imports" search results as a StandardFormula.
 */
export const identifyFormula = async (inputHerbs: Herb[]): Promise<StandardFormula | null> => {
    const inputStr = inputHerbs.map(h => h.name).join('、');

    // Prompt designed to use internal knowledge + search to format a DB entry
    const prompt = `
        User Input Herbs: ${inputStr}

        Task: Identify the ONE most likely Traditional Chinese Medicine classic formula that matches these herbs.
        
        CRITICAL INSTRUCTION:
        1. You MUST USE the 'googleSearch' tool to verify the formula composition.
        2. Even if the input contains only a few herbs (e.g. "Shu Di"), find the most famous formula containing it (e.g. "Liu Wei Di Huang Wan").
        3. Return ONLY a valid JSON object. NO markdown formatting, NO explanations.

        Output Format:
        {
            "id": "ai-gen",
            "name": "Formula Name",
            "source": "Book Source",
            "composition": ["Herb1", "Herb2"],
            "usage": "Usage text",
            "effect": "Efficacy",
            "indications": "Symptoms",
            "analysis": "Brief analysis"
        }
        
        Ensure "composition" uses standard simplified Chinese herb names (e.g. '熟地黄' not '熟地').
    `;

    try {
        // Use googleSearch tool to ensure we get obscure formulas if needed
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }] // Enable search as requested
            }
        });

        const text = response.text;
        if (!text) return null;

        // Extract JSON more robustly
        let jsonStr = text;
        
        // 1. Try to find code blocks first
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            // 2. If no code blocks, look for the first '{' and last '}' to extract pure JSON
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = text.substring(firstBrace, lastBrace + 1);
            }
        }

        // 3. Attempt to clean common trailing comma issues if simple parse fails
        try {
            return parseFormulaJson(jsonStr);
        } catch (e) {
            console.warn("First JSON parse attempt failed, trying cleanup...", e);
            // Very basic cleanup: remove trailing commas before } or ]
            const cleanedJson = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            return parseFormulaJson(cleanedJson);
        }

    } catch (error) {
        console.error("AI Identification Error:", error);
        return null;
    }
};

/**
 * Parses raw text input into structured formula data for Admin Panel.
 */
export const parseRawFormulaText = async (rawText: string): Promise<any> => {
    const prompt = `
        Task: Extract Traditional Chinese Medicine formula data from the provided raw text.
        Raw Text: """${rawText}"""

        Please parse this text and return a JSON object suitable for a database entry.
        
        Requirements:
        1. **composition**: Extract herb names as an array of strings. Use standard simplified names (e.g., '熟地黄' instead of '熟地').
        2. **standardDosage**: If dosages are mentioned (e.g., "9g", "三钱"), format them into a SINGLE string like "麻黄:9 桂枝:6". Convert ancient units to grams approximately (1钱 ≈ 3g, 1两 ≈ 30g) if specific numbers are given. If no dosage, leave as empty string.
        3. **name**: Formula name.
        4. **source**: Book source (e.g., "《伤寒论》"). If unknown, put "未知".
        5. **usage**: How to take it.
        6. **effect**: Efficacy/Functions.
        7. **indications**: Symptoms/Diseases it treats.
        8. **analysis**: Any explanation or analysis found in text.

        Return ONLY raw JSON. No Markdown.
        
        JSON Structure:
        {
            "name": "string",
            "source": "string",
            "composition": ["string", "string"],
            "standardDosage": "string", 
            "usage": "string",
            "effect": "string",
            "indications": "string",
            "analysis": "string"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");

        let jsonStr = text;
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        else {
             const firstBrace = text.indexOf('{');
             const lastBrace = text.lastIndexOf('}');
             if (firstBrace !== -1 && lastBrace !== -1) {
                 jsonStr = text.substring(firstBrace, lastBrace + 1);
             }
        }

        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Smart Import Error:", error);
        throw error;
    }
};

function parseFormulaJson(jsonStr: string): StandardFormula | null {
    try {
        const data = JSON.parse(jsonStr);
        // Validate basic structure
        if (data.name && Array.isArray(data.composition)) {
            return {
                ...data,
                id: `ai-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                isAiGenerated: true
            } as StandardFormula;
        }
    } catch (e) {
        // Fail silently
    }
    return null;
}
