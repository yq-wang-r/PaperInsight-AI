import { GoogleGenAI, Tool } from "@google/genai";
import { AnalysisResult, ChatMessage } from "../types";

const SYSTEM_INSTRUCTION = `
Role: 你是一位计算机领域的资深科研助手，擅长快速解析学术论文并提取核心逻辑。
Task: 请帮我检索并阅读指定的计算机领域文章/话题。你的目标是不仅总结原文，还要以审辩式思维辅助我进行科研思考。
Output Format: 请严格按照以下 Markdown 格式输出，不要输出Markdown代码块标记（如 \`\`\`markdown），直接输出内容。

📄 论文概览
标题: [文章标题]
作者: [主要作者姓名]
发表年份/会议/期刊: [例如：2024 / IEEE INFOCOM]
链接: [arXiv/DOI 链接]

🔍 核心内容
研究问题: [针对什么具体的痛点或挑战？（用 1-2 句话概括）]
主要方法: [提出了什么样的算法、架构或理论证明？]
关键贡献:
1. [贡献 1]
2. [贡献 2]
3. [贡献 3]

💡 启发与思考
亮点: [论文最精妙的设计或最令人信服的实验结果是什么？]
不足: [实验设置、假设前提或扩展性上是否存在局限性？]
可借鉴点: [其中的哪些技术路径、评估指标或数学工具可以迁移到其他研究中？请给出具体、可操作的迁移建议，并结合潜在应用场景提供示例。]
待解决问题: [论文提到的未来方向或你观察到的未竟之志。]
备注: [结合当前计算机领域的技术趋势（如大模型、边缘计算等）给出深度的专业评价。]
`;

export const analyzePaperWithGemini = async (query: string): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set it in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Use Google Search to find the paper and details
  const tools: Tool[] = [
    { googleSearch: {} }
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Using Pro for better reasoning and analysis
      contents: `Search for and analyze the paper related to: "${query}". If multiple papers match, choose the most relevant or influential one. Strictly follow the defined output format.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools,
        temperature: 0.3, // Lower temperature for more factual extraction
      }
    });

    const text = response.text || "Analysis generation failed.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[];

    return {
      markdown: text,
      groundingChunks: groundingChunks
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const askFollowUp = async (
  question: string, 
  originalContext: string, 
  history: ChatMessage[]
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Construct context from history
  const historyContext = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');

  const prompt = `
    Context (Original Analysis):
    ${originalContext}

    Conversation History:
    ${historyContext}

    Current User Question:
    ${question}

    INTERNAL INSTRUCTION (CRITICAL):
    You must perform an internal critique before answering. 
    1. Draft an initial answer based on the paper analysis and your knowledge.
    2. Critique your draft: Does it directly address the user's specific question? Is the tone professional and academic? Is it accurate?
    3. Refine the answer based on the critique.
    4. **IMPORTANT**: Do not use Markdown bolding (i.e., do not use **asterisks**) in the final answer. Keep it plain text for easier reading.
    
    OUTPUT FORMAT:
    You must wrap your FINAL, polished answer inside <final_answer> tags. Do not show the critique process to the user, only the result inside the tags.
    
    Example:
    <final_answer>
    The paper utilizes a Transformer architecture...
    </final_answer>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Flash is sufficient for chat context
      contents: prompt,
      config: {
        temperature: 0.5,
      }
    });

    const rawText = response.text || "";
    
    // Extract content within <final_answer> tags and clean up markdown bolding
    const match = rawText.match(/<final_answer>([\s\S]*?)<\/final_answer>/);
    
    if (match && match[1]) {
      return match[1].trim().replace(/\*\*/g, '');
    } else {
      // Fallback if model fails to tag (rare with high temp, but possible)
      return rawText.replace(/<final_answer>|<\/final_answer>/g, '').replace(/\*\*/g, '').trim();
    }

  } catch (error) {
    console.error("Follow-up Error:", error);
    throw error;
  }
};