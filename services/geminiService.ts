import { Herb, MatchResult, StandardFormula, HerbDetail } from '../types';



const MODEL_ID = 'gemini-1.5-flash';



async function callGemini(prompt: string): Promise<string> {
  
  const resp = await fetch('/api/gemini', {
    
    method: 'POST',
    
    headers: { 'Content-Type': 'application/json' },
    
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }]}] })
      
  });
  
  try {
    
    const data = await resp.json();
    
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return text;
    
  } catch (e) {
    
    return '';
    
  }
  
}



export const generateTCMAnalysis = async (
  
  inputHerbs: Herb[],
  
  primaryMatch: MatchResult
  
): Promise<string> => {
  
  const inputStr = inputHerbs.map(h => `${h.name}${h.dosage ? `（${h.dosage}${h.unit || ''}）` : ''}`).join('，');
  
  const standardStr = primaryMatch.formula.composition.join('，');
  
  const matchTypeDesc = primaryMatch.matchType === 'ratio-mismatch'
  
    ? '药味相同但剂量比例不同'
    
    : '药味加减';
  

  
  const prompt = `作为一个资深中医专家，请对以下方剂进行深度分析。\n` +
    
    `【用户输入方剂】：${inputStr}\n` +
    
    `【系统识别原方】：${primaryMatch.formula.name}（出处：${primaryMatch.formula.source}）\n` +
    
    `【原方标准组成】：${standardStr}\n` +
    
    `【识别关系】：${matchTypeDesc}` +
    
    `${primaryMatch.isCombined ? `\n【合方提示】：此方似乎包含${primaryMatch.combinedWith}的组成。` : ''}` +
    
    `${primaryMatch.formula.isAiGenerated ? `\n【注】：此方为AI基于古籍检索匹配的结果。` : ''}` +
    
    `\n请生成一份简明扼要的临床分析报告，包含以下三点（请使用Markdown格式，必须使用简体中文）：\n` +
    
    `1. **加减变化分析**：明确指出用户方相对于原方，增加了什么药，去掉了什么药，或者核心药物的剂量比例发生了什么关键变化。\n` +
    
    `2. **方义衍变推导**：基于上述变化，分析方剂的功效侧重点发生了怎样的偏移？\n` +
    
    `3. **临床应用建议**：这种变化可能更适合什么样的病证？\n` +
    
    `要求：专业术语准确，逻辑清晰，字数控制在400字以内。`;
  

  
  const text = await callGemini(prompt);
  
  return text || '未能生成分析结果。';
  
};



/**

 * Uses Gemini with Search Grounding to identify formulas.
 
 */

export const identifyFormula = async (
  
  inputHerbs: Herb[]
  
): Promise<StandardFormula | null> => {
  
  const inputStr = inputHerbs.map(h => h.name).join('、');
  
  const prompt = `用户输入药物: ${inputStr}\n` +
    
    `任务: 识别与这些药物最匹配的一个中医经典方剂。\n` +
    
    `关键指令:\n` +
    
    `1. 必须使用 'googleSearch' 工具核实方剂组成。\n` +
    
    `2. 即使输入只有几味药，也要找到最著名的包含它的方剂。\n` +
    
    `3. 只返回一个有效的 JSON 对象。不要使用Markdown格式。必须使用简体中文。\n` +
    
    `4. 药名必须标准化（如“熟地”应为“熟地黄”，“薏米”应为“薏苡仁”）。\n` +
    
    `输出格式:\n` +
    
    `"id": "ai-gen",\n"name": "方剂名",\n"source": "出处 (如《伤寒论》)",\n"composition": ["药名1", "药名2"],\n"usage": "用法",\n"effect": "功效",\n"indications": "主治",\n"analysis": "简要分析"`;
  

  
  const text = await callGemini(prompt);
  






















































