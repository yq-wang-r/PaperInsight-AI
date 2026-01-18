import { GoogleGenAI, Tool, Part } from "@google/genai";
import { AnalysisResult, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport, VenueReport } from "../types";

const SYSTEM_INSTRUCTION = `
Role: 你是一位计算机领域的资深科研助手，擅长快速解析学术论文并提取核心逻辑。
Task: 请帮我检索并阅读指定的计算机领域文章/话题。你的目标是不仅总结原文，还要以审辩式思维辅助我进行科研思考。
Language Requirement: 请主要使用**中文**进行解读和总结。对于**数学符号、专业术语、专有名词、算法名称**（如 Transformer, Attention Mechanism, ResNet, Zero-shot Learning, NP-hard 等），请务必**保留英文原文**，不要强行翻译。**同时，为了便于理解，请在这些英文术语出现时，尝试用中文进行简单的解释或补充说明。**
Output Format: 请严格按照以下 Markdown 格式输出，不要输出Markdown代码块标记（如 \`\`\`markdown），直接输出内容。

📄 论文概览
标题: [文章标题]
作者: [主要作者姓名]
发表年份/会议/期刊: [例如：2024 / IEEE INFOCOM]
链接: [arXiv/DOI 链接]

🔍 核心内容
研究问题: [针对什么具体的痛点或挑战？（用 1-2 句话概括）]
主要方法: [提出了什么样的算法、架构或理论证明？保留核心英文术语并进行简单解释]
关键贡献:
1. [贡献 1]
2. [贡献 2]
3. [贡献 3]

💡 启发与思考
亮点: [论文最精妙的设计或最令人信服的实验结果是什么？]
不足: [实验设置、假设前提或扩展性上是否存在局限性？]
可借鉴点: [其中的哪些技术路径、评估指标或数学工具可以迁移到其他研究中？请给出具体、可操作的迁移建议，并结合潜在应用场景提供示例。]
待解决问题: [论文提到的未来方向或你观察到的未竟之志。]
备注: [结合当前计算机领域的技术趋势（如 LLM, Edge AI 等）给出深度的专业评价。]
`;

/**
 * Robustly extracts the JSON object from a string.
 * Handles cases where the model outputs multiple JSON blocks (e.g. thoughts + result)
 * or includes markdown formatting.
 */
const extractJSON = (text: string): any => {
  if (!text) return null;

  // 1. Try cleaning markdown and parsing directly
  const cleanText = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  try {
      return JSON.parse(cleanText);
  } catch (e) {
      // Continue if simple parse fails
  }

  // 2. Stack-based extractor to find all top-level JSON objects
  // This handles cases like: { "thought": ... } { "answer": ... }
  const candidates: any[] = [];
  let depth = 0;
  let start = -1;
  let insideString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (escape) {
          escape = false;
          continue;
      }
      if (char === '\\') {
          escape = true;
          continue;
      }
      if (char === '"') {
          insideString = !insideString;
          continue;
      }
      
      if (!insideString) {
          if (char === '{') {
              if (depth === 0) start = i;
              depth++;
          } else if (char === '}') {
              depth--;
              if (depth === 0 && start !== -1) {
                  const chunk = text.substring(start, i + 1);
                  try {
                      const parsed = JSON.parse(chunk);
                      candidates.push(parsed);
                  } catch (e) {
                      // ignore invalid chunks
                  }
                  start = -1;
              }
          }
      }
  }

  if (candidates.length > 0) {
      // Return the last valid JSON object found, as it's typically the final response
      return candidates[candidates.length - 1];
  }

  // 3. Last resort: Find first '{' and last '}'
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      try {
          return JSON.parse(text.substring(firstOpen, lastClose + 1));
      } catch (e) {
          return null;
      }
  }

  return null;
};

export const analyzePaperWithGemini = async (
    query: string, 
    signal?: AbortSignal, 
    pdfBase64?: string, 
    enableSearch: boolean = true
): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set it in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Configure tools based on enableSearch flag
  const tools: Tool[] = enableSearch ? [{ googleSearch: {} }] : [];
  
  // Construct content parts
  const parts: Part[] = [];

  if (pdfBase64) {
      // PDF Mode: Add the PDF data
      parts.push({
          inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64
          }
      });
      // Add a prompt to analyze the attached file
      const userPrompt = query.trim() 
          ? `Please analyze this uploaded paper. Focus on this context: "${query}". Strictly follow the defined output format and language rules (Chinese with English terms).` 
          : `Please analyze this uploaded paper. Strictly follow the defined output format and language rules (Chinese with English terms).`;
      parts.push({ text: userPrompt });
  } else {
      // Search Mode: Standard text prompt
      parts.push({ text: `Search for and analyze the paper related to: "${query}". If multiple papers match, choose the most relevant or influential one. Strictly follow the defined output format and language rules (Chinese with English terms).` });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Using 2.0 Flash for efficiency with PDFs
      contents: { parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools, // Only include search tool if enabled
        temperature: 0.3, 
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

/**
 * Sub-agent to verify paper existence and find the official link.
 */
const verifyAndFindPaperLink = async (title: string, year: string): Promise<string | undefined> => {
    if (!process.env.API_KEY) return undefined;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Strict prompt to ensure "Sub-agent" behavior
    const prompt = `
      Role: Academic Librarian.
      Task: Find the official URL for the specific paper: "${title}" (approx. year: ${year}).
      
      Steps:
      1. Search Google for this exact paper title.
      2. Verify the search result is indeed for the paper "${title}".
      3. If found, provide the direct link (e.g. arXiv, IEEE Xplore, ACM Digital Library, CVF, etc.).
      4. If the paper cannot be found or the results are for a different paper, return null.

      Output JSON only: 
      { 
        "found": boolean, 
        "url": "string | null", 
        "verified_title": "string" 
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                temperature: 0.1 // Very low temp for strict fact checking
            }
        });
        
        const result = extractJSON(response.text || "{}");
        if (result && result.found && result.url) {
            return result.url;
        }
        return undefined;
    } catch (e) {
        console.error(`Failed to verify link for ${title}`, e);
        return undefined;
    }
};

export const checkPaperTimeliness = async (title: string, authorAndYear: string): Promise<TimelinessReport> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Enforce "Latest" paper requirement in prompt
    const prompt = `
        Role: Technical Research Auditor.
        Task: Analyze the timeliness of the paper "${title}" (${authorAndYear}).
        1. Determine if this paper is considered "Outdated" or "Legacy" (typically >3-5 years old in fast-moving CS fields like AI, or if superseded by newer architectures).
        2. Suggest 3 **State-of-the-Art (SOTA)** papers or direct successors.
        
        STRICT REQUIREMENT:
        - At least ONE recommendation MUST be published in the current year (2024-2025). This is MANDATORY. Search for the very latest preprints if necessary.
        - The other recommendations can be seminal papers from the last 1-3 years.
        - **Output the summary in Chinese.**
        - Do not format the JSON with Markdown.
        
        Output JSON only:
        {
            "isOutdated": boolean,
            "status": "Legacy" | "Current" | "Seminal Classic",
            "summary": "Short explanation (max 1 sentence) on why it is/isn't outdated (in Chinese).",
            "recommendations": [
                { "title": "Paper Title", "year": "202X", "reason": "Why it's better (in Chinese)" }
            ]
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }], 
                temperature: 0.2
            }
        });
        
        const report = extractJSON(response.text || "{}") as TimelinessReport;
        
        if (!report) {
             throw new Error("Failed to parse Timeliness JSON");
        }

        // Phase 2: Sub-agent verification loop
        if (report.recommendations && report.recommendations.length > 0) {
            const verifiedRecommendations = await Promise.all(
                report.recommendations.map(async (rec) => {
                    const verifiedLink = await verifyAndFindPaperLink(rec.title, rec.year);
                    return {
                        ...rec,
                        link: verifiedLink
                    };
                })
            );
            report.recommendations = verifiedRecommendations;
        }

        return report;

    } catch (e) {
        console.error("Timeliness check failed", e);
        return { isOutdated: false, status: "Unknown", summary: "Could not verify timeliness.", recommendations: [] };
    }
};

export const checkVenueQuality = async (venueText: string): Promise<VenueReport> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
        Role: Academic Evaluator.
        Task: Analyze the academic reputation and quality of this publication venue: "${venueText}".
        
        Instructions:
        1. Identify the canonical name (e.g., "CVPR" for "Conf. on Computer Vision...").
        2. Rate its quality/tier. Focus on "Reputation" and "Word of Mouth" (口碑).
           - e.g., "Top-tier conference, highly respected", "CCF A", "Q1 Journal".
        3. Provide a concise summary (1-2 sentences) about its community standing and review rigor.
        
        Language: Output summary in Chinese.

        Output JSON only:
        {
            "name": "Canonical Name",
            "type": "Conference" | "Journal" | "Unknown",
            "quality": "Short Rating (e.g. 'CCF A / Top Tier')",
            "summary": "Concise summary of reputation (in Chinese)."
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                temperature: 0.1
            }
        });
        
        const report = extractJSON(response.text || "{}");
        return report || { name: venueText, type: 'Unknown', quality: 'Unknown', summary: "Could not analyze venue." };
    } catch (e) {
        return { name: venueText, type: 'Unknown', quality: 'Unknown', summary: "Could not analyze venue." };
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
        - Output summary in Chinese.
        
        Output JSON only:
        {
            "hasIssues": boolean,
            "summary": "Concise findings (in Chinese)."
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                temperature: 0.1
            }
        });
        
        const report = extractJSON(response.text || "{}");
        return report || { hasIssues: false, summary: "Integrity check unavailable." };
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
    4. **Language Rule**: Answer primarily in Chinese. Keep technical terms in English.
    5. **IMPORTANT**: Do not use Markdown bolding (i.e., do not use **asterisks**) in the final answer. Keep it plain text for easier reading.
    
    OUTPUT FORMAT:
    You must wrap your FINAL, polished answer inside <final_answer> tags. Do not show the critique process to the user, only the result inside the tags.
    
    Example:
    <final_answer>
    这篇文章使用了一个基于 Transformer 的架构...
    </final_answer>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Flash is sufficient for chat context
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
    Title: ${item.title}
    Analysis Content (Excerpt):
    ${item.analysis.markdown.substring(0, 1500)}...
    -------------------------
    `;
  });

  const prompt = `
    Role: Domain Expert & Research Director.
    
    Task: You are reviewing a collection of paper analyses. Your goal is to generate a **Domain-Specific Trend Report**.
    
    Input Data:
    ${aggregatedContext}

    CRITICAL INSTRUCTIONS:
    1. **Cluster by Domain**: First, identify if the papers belong to different domains (e.g., "Computer Vision", "LLMs", "Distributed Systems"). 
       - Do NOT force connections between unrelated papers.
       - If the papers are totally distinct (e.g., one on Biology, one on Crypto), analyze them as separate clusters.
    2. **Intelligent Synthesis**:
       - Within each domain cluster, analyze the chronological evolution and technical shifts.
       - Only mention cross-domain connections if they are genuinely meaningful.
    3. **Language**: Use **Chinese** for the report text, but keep technical terms (e.g. RAG, Diffusion Models) in **English**.

    Output Format (Markdown):
    
    # 🧬 科研趋势综合研判 (Comprehensive Research Trend Report)

    [If multiple domains are detected, add a brief intro: "本次分析涵盖了以下几个独立/交叉领域: [Domain A], [Domain B]..."]

    ## 1. 🔍 领域分类与聚类 (Domain Clustering)
    (Briefly list the clusters identified. e.g., "Cluster A: Efficient LLM Inference", "Cluster B: Graph Neural Networks")

    ## 2. ⏳ 核心领域深度剖析 (Deep Dive per Domain)
    
    ### 2.1 [Domain Name A]
    - **演进脉络**: (How this specific field evolved based on the papers provided)
    - **技术拐点**: (Key architectural shifts)
    - **当前SOTA**: (Current state based on these papers)

    ### 2.2 [Domain Name B] (If applicable)
    ...

    ## 3. 💡 跨领域启发与盲点 (Cross-Domain Insights & Gaps)
    - (Only if valid) "Intersection points..."
    - **Research Gaps**: (What is missing in the current set of papers?)

    ## 4. 🚀 建议探索方向 (Future Directions)
    (Concrete, actionable research ideas for the user)
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} }],
      }
    });

    return response.text || "Failed to generate trend report.";

  } catch (error) {
    console.error("Trend Analysis Error:", error);
    throw error;
  }
};