
import { GoogleGenAI } from "@google/genai";
import { Herb, MatchResult, StandardFormula, HerbDetail } from '../types';

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_ID = 'gemini-2.5-flash'; 

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

    请生成一份简明扼要的临床分析报告，包含以下三点（请使用Markdown格式，必须使用简体中文）：

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
 * Uses Gemini with Search Grounding to identify formulas.
 */
export const identifyFormula = async (inputHerbs: Herb[]): Promise<StandardFormula | null> => {
    const inputStr = inputHerbs.map(h => h.name).join('、');

    const prompt = `
        用户输入药物: ${inputStr}

        任务: 识别与这些药物最匹配的一个中医经典方剂。
        
        关键指令:
        1. 必须使用 'googleSearch' 工具核实方剂组成。
        2. 即使输入只有几味药，也要找到最著名的包含它的方剂。
        3. 只返回一个有效的 JSON 对象。不要使用Markdown格式。必须使用简体中文。
        4. 药名必须标准化（如“熟地”应为“熟地黄”，“薏米”应为“薏苡仁”）。

        输出格式:
        {
            "id": "ai-gen",
            "name": "方剂名",
            "source": "出处 (如《伤寒论》)",
            "composition": ["药名1", "药名2"],
            "usage": "用法",
            "effect": "功效",
            "indications": "主治",
            "analysis": "简要分析"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }] 
            }
        });

        const text = response.text;
        if (!text) return null;

        return parseJsonFromText(text);

    } catch (error) {
        console.error("AI Identification Error:", error);
        return null;
    }
};

/**
 * Parses raw text input into structured formula data.
 */
export const parseRawFormulaText = async (rawText: string): Promise<any> => {
    const prompt = `
        任务: 从提供的文本中提取中医方剂数据。
        原始文本: """${rawText}"""

        请解析文本并返回适合数据库录入的 JSON 对象。
        
        要求:
        1. **composition**: 提取药名数组。使用标准简体中文名（例如：'熟地黄' 而不是 '熟地'，'薏苡仁' 而不是 '薏米'）。
        2. **standardDosage**: 如果提到剂量（如“9g”，“三钱”），格式化为单一字符串 "麻黄:9 桂枝:6"。将古制转换为克（1钱 ≈ 3g）。
        3. **source**: 典籍出处。如果未知，填"未知"。书名请去书名号并标准化（如'医学衷中参西录' -> '衷中参西'）。
        4. 全部使用简体中文。

        返回纯 JSON。不要 Markdown。
        
        JSON 结构:
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

        return parseJsonFromText(text);
    } catch (error) {
        console.error("Smart Import Error:", error);
        throw error;
    }
};

// --- AGENTIC CRAWLER FUNCTIONS ---

export const agenticCrawlFormula = async (name: string): Promise<StandardFormula | null> => {
    const prompt = `
        任务: 模拟爬虫，专门在 zysj.com.cn (中医世家) 网站上搜索中医方剂 "${name}" 并返回完整数据结构。
        
        必须使用 Google Search 查找 zysj.com.cn 上的权威数据。
        
        强制要求：
        1. **所有内容必须是简体中文**。
        2. **药名标准化**：将别名转换为正名（如：薏米->薏苡仁，元胡->延胡索，山肉->山茱萸，锦纹->大黄）。
        3. **典籍标准化**：书籍名称去掉《》，并使用简称（如：医学衷中参西录->衷中参西，备急千金要方->千金方）。
        4. 如果找不到 zysj.com.cn 的数据，可以参考其他权威中医网站，但必须保持上述格式要求。

        返回完全符合以下 JSON 结构的纯文本（无markdown）：
        {
            "name": "${name}",
            "pinyin": "拼音",
            "source": "出处",
            "category": "分类 (如: 解表剂)",
            "composition": ["药名1", "药名2", ...],
            "standardDosage": "格式为 '药名1:剂量 药名2:剂量' 的字符串 (尽量转换为克)",
            "usage": "用法",
            "effect": "功用",
            "indications": "主治",
            "analysis": "方解"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        
        const data = parseJsonFromText(response.text || '');
        if (data && data.composition) {
             return {
                 ...data,
                 id: `crawl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                 isAiGenerated: true
             };
        }
        return null;
    } catch (e) {
        console.error("Crawl Formula Error:", e);
        return null;
    }
};

export const agenticCrawlHerb = async (name: string): Promise<HerbDetail | null> => {
    const prompt = `
        任务: 模拟爬虫，专门在 zysj.com.cn (中医世家) 网站上搜索中药 "${name}" 并返回详细信息。
        
        必须使用 Google Search 查找 zysj.com.cn 上的数据。

        强制要求：
        1. **所有内容必须是简体中文**。
        2. **药名标准化**：使用正名（如：薏米->薏苡仁）。
        3. **典籍/来源**：如有引用书籍，需标准化书名。

        返回完全符合以下 JSON 结构的纯文本（无markdown）：
        {
            "effect": "功效",
            "paozhi": "炮制方法",
            "pinyin": "拼音",
            "category": "分类 (如: 解表药)",
            "origin": "来源",
            "taste": "性味",
            "meridians": "归经",
            "actions": "主治",
            "usage_dosage": "用法用量",
            "contraindications": "注意/禁忌"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        
        const data = parseJsonFromText(response.text || '');
        if (data && data.effect) {
             return data as HerbDetail;
        }
        return null;
    } catch (e) {
        console.error("Crawl Herb Error:", e);
        return null;
    }
};


// Helper to extract JSON from markdown or raw text
function parseJsonFromText(text: string): any {
    try {
        let jsonStr = text;
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = text.substring(firstBrace, lastBrace + 1);
            }
        }
        // Cleanup common trailing comma issues
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        return JSON.parse(jsonStr);
    } catch (e) {
        return null;
    }
}
