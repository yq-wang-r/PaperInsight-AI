import { GoogleGenAI, Tool } from "@google/genai";
import { AnalysisResult, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport } from "../types";

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

export const analyzePaperWithGemini = async (query: string, signal?: AbortSignal): Promise<AnalysisResult> => {
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

    // Check for abort after the async operation
    if (signal?.aborted) {
        throw new Error("Aborted");
    }

    const text = response.text || "Analysis generation failed.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[];

    return {
      markdown: text,
      groundingChunks: groundingChunks
    };
  } catch (error: any) {
    if (signal?.aborted || error.message === "Aborted") {
        throw new Error("Analysis process was stopped by the user.");
    }
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const checkPaperTimeliness = async (title: string, authorAndYear: string): Promise<TimelinessReport> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
        Role: Technical Research Auditor.
        Task: Analyze the timeliness of the paper "${title}" (${authorAndYear}).
        1. Determine if this paper is considered "Outdated" or "Legacy" (typically >3-5 years old in fast-moving CS fields like AI, or if superseded by newer architectures).
        2. If outdated, use Google Search to find 2-3 **current** State-of-the-Art (SOTA) papers or direct successors published recently (last 1-2 years) that solve the same problem better.
        3. VERIFY that the recommended papers are real and accessible.
        
        Output JSON only:
        {
            "isOutdated": boolean,
            "status": "Legacy" | "Current" | "Seminal Classic",
            "summary": "Short explanation (max 1 sentence) on why it is/isn't outdated.",
            "recommendations": [
                { "title": "Paper Title", "year": "202X", "reason": "Why it's better", "link": "URL" }
            ]
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                temperature: 0.2
            }
        });
        
        const text = response.text || "{}";
        return JSON.parse(text) as TimelinessReport;
    } catch (e) {
        console.error("Timeliness check failed", e);
        return { isOutdated: false, status: "Unknown", summary: "Could not verify timeliness.", recommendations: [] };
    }
};

export const checkAuthorIntegrity = async (authors: string): Promise<IntegrityReport> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
        Role: Academic Integrity Officer.
        Task: Perform a background check on these authors/institutions: "${authors}".
        Search specifically for: "academic misconduct", "paper retraction", "data fabrication", "fraud".
        
        Rules:
        - Be conservative. Only flag if there are *verified* public records of misconduct.
        - If clear, state "No public records of academic misconduct found."
        - Keep it very concise.
        
        Output JSON only:
        {
            "hasIssues": boolean,
            "summary": "Concise findings."
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                temperature: 0.1
            }
        });
        
        const text = response.text || "{}";
        return JSON.parse(text) as IntegrityReport;
    } catch (e) {
        return { hasIssues: false, summary: "Integrity check unavailable." };
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

export const analyzeTrendsWithGemini = async (history: HistoryItem[]): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  if (history.length === 0) {
     return "No history available to analyze.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare the context from history
  let aggregatedContext = "";
  
  history.forEach((item, index) => {
    aggregatedContext += `
    --- PAPER ${index + 1} ---
    ID: ${item.id}
    Title: ${item.title}
    Analysis Content:
    ${item.analysis.markdown}
    
    User Discussion History for this paper:
    ${item.chatMessages.map(m => `${m.role}: ${m.content}`).join('\n')}
    -------------------------
    `;
  });

  const prompt = `
    Role: Chief Research Scientist and Technology Strategist.
    
    Task: Based on the provided "Research History" containing analyses and discussions of multiple papers, generate a high-level **Trend & Evolution Report**.
    
    Input Data:
    ${aggregatedContext}

    Instructions:
    1. **Chronological Ordering**: Do NOT follow the order of the input. Instead, identify the *publication year* or era of each paper from its content and sort your analysis chronologically (from past to present).
    2. **Field Evolution**: Describe how the field has evolved over time based strictly on these papers. How have the problem definitions shifted?
    3. **Architecture & Technical Flows**: Map the technical trajectory. (e.g., "Shift from CNNs to ViTs", or "Evolution of RAG techniques").
    4. **Current & Future Directions**: 
       - What is the current "State of the Art" or trend based on the latest papers in this set?
       - Propose 3 concrete "Research Ideas" or "Gap Areas" that the user could explore next.
    5. **Recommended Reading (Verification Required)**:
       - **CRITICAL**: Use your Search Tool to find 3-5 *actual* and *recent* papers (published in the last 12 months) that align with the "Current Trends" you identified. 
       - **VERIFY**: Before listing a paper, use search to confirm it exists and is relevant. Do not hallucinate titles.
       - Format them as a list with Markdown links: "- **Title** (Year) - [Link Title](URL)"
    
    Output Format (Markdown):
    
    # 📈 领域演进与趋势深度分析报告

    ## 1. ⏳ 演进时间轴 (Chronological Evolution)
    (Provide a timeline view of the papers analyzed, highlighting key milestones)

    ## 2. 🧬 架构与方法论变迁 (Technical Evolution)
    (Deep dive into how the algorithms or theoretical frameworks have changed)

    ## 3. 🔥 最新潮流与热点 (Current Trends)
    (Synthesize the cutting-edge focus found in the most recent papers)

    ## 4. 🚀 未来方向与Idea建议 (Future Directions)
    (Propose specific, novel research directions based on the gaps identified)

    ## 5. 📚 推荐阅读 (Verified Recent Papers)
    (List of verifiable, recent papers found via search, with links)
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        temperature: 0.4,
        tools: [{ googleSearch: {} }], // Enable search for finding real papers
      }
    });

    return response.text || "Failed to generate trend report.";

  } catch (error) {
    console.error("Trend Analysis Error:", error);
    throw error;
  }
};