import { AnalysisResult, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport, VenueReport } from "../types";

// 配置管理接口
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: 'gemini' | 'openai';
}

// 默认配置
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: 'Pro/zai-org/GLM-4.7',
  apiType: 'openai'
};

// 获取配置
export const getApiConfig = (): ApiConfig => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  
  try {
    const saved = localStorage.getItem('paper_insight_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_CONFIG,
        ...parsed
      };
    }
  } catch (e) {
    console.error('Failed to load API config:', e);
  }
  
  return DEFAULT_CONFIG;
};

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

// OpenAI 兼容 API 调用
async function callOpenAI(
  messages: Array<{role: string; content: string}>,
  config: ApiConfig,
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'text' | 'json_object' };
  } = {}
) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      response_format: options.responseFormat
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 提取 JSON 的辅助函数
const extractJSON = (text: string): any => {
  if (!text) return null;

  const cleanText = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  try {
      return JSON.parse(cleanText);
  } catch (e) {
    // continue
  }

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

/**
 * 使用 OpenAI 兼容 API 分析论文
 */
export const analyzePaperWithOpenAI = async (
    query: string, 
    signal?: AbortSignal, 
    pdfBase64?: string, 
    enableSearch: boolean = true
): Promise<AnalysisResult> => {
  const config = getApiConfig();
  if (!config.apiKey) {
    throw new Error("API Key is missing. Please configure it in Settings.");
  }

  let userPrompt = '';
  if (pdfBase64) {
    userPrompt = query.trim() 
        ? `Please analyze this uploaded paper (base64 encoded PDF). Focus on this context: "${query}". Strictly follow the defined output format and language rules (Chinese with English terms).` 
        : `Please analyze this uploaded paper (base64 encoded PDF). Strictly follow the defined output format and language rules (Chinese with English terms).`;
  } else {
    userPrompt = `Search for and analyze the paper related to: "${query}". If multiple papers match, choose the most relevant or influential one. Strictly follow the defined output format and language rules (Chinese with English terms).`;
  }

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    { role: 'user', content: userPrompt }
  ];

  try {
    const text = await callOpenAI(messages, config, { temperature: 0.3 });

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    return {
      markdown: text,
      groundingChunks: []
    };
  } catch (error: any) {
    if (signal?.aborted || error.message === "Aborted") {
        throw new Error("Analysis process was stopped by the user.");
    }
    console.error("OpenAI API Error:", error);
    throw error;
  }
};

export const checkPaperTimelinessWithOpenAI = async (title: string, authorAndYear: string): Promise<TimelinessReport> => {
    const config = getApiConfig();
    if (!config.apiKey) throw new Error("API Key missing. Please configure it in Settings.");

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
        const messages = [
            { role: 'system', content: 'You are a helpful assistant. Output valid JSON only.' },
            { role: 'user', content: prompt }
        ];
        
        const text = await callOpenAI(messages, config, { 
            temperature: 0.2,
            responseFormat: { type: 'json_object' }
        });
        
        const report = extractJSON(text) as TimelinessReport;
        
        if (!report) {
             throw new Error("Failed to parse Timeliness JSON");
        }

        return { ...report, recommendations: report.recommendations?.map(rec => ({ ...rec, link: undefined })) };
    } catch (e) {
        console.error("Timeliness check failed", e);
        return { isOutdated: false, status: "Unknown", summary: "Could not verify timeliness.", recommendations: [] };
    }
};

export const checkVenueQualityWithOpenAI = async (venueText: string): Promise<VenueReport> => {
    const config = getApiConfig();
    if (!config.apiKey) throw new Error("API Key missing. Please configure it in Settings.");

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
        const messages = [
            { role: 'system', content: 'You are a helpful assistant. Output valid JSON only.' },
            { role: 'user', content: prompt }
        ];
        
        const text = await callOpenAI(messages, config, { 
            temperature: 0.1,
            responseFormat: { type: 'json_object' }
        });
        
        const report = extractJSON(text);
        return report || { name: venueText, type: 'Unknown', quality: 'Unknown', summary: "Could not analyze venue." };
    } catch (e) {
        return { name: venueText, type: 'Unknown', quality: 'Unknown', summary: "Could not analyze venue." };
    }
};

export const checkAuthorIntegrityWithOpenAI = async (authors: string): Promise<IntegrityReport> => {
    const config = getApiConfig();
    if (!config.apiKey) throw new Error("API Key missing. Please configure it in Settings.");

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
        const messages = [
            { role: 'system', content: 'You are a helpful assistant. Output valid JSON only.' },
            { role: 'user', content: prompt }
        ];
        
        const text = await callOpenAI(messages, config, { 
            temperature: 0.1,
            responseFormat: { type: 'json_object' }
        });
        
        const report = extractJSON(text);
        return report || { hasIssues: false, summary: "Integrity check unavailable." };
    } catch (e) {
        return { hasIssues: false, summary: "Integrity check unavailable." };
    }
};

export const askFollowUpWithOpenAI = async (
  question: string, 
  originalContext: string, 
  history: ChatMessage[]
): Promise<string> => {
  const config = getApiConfig();
  if (!config.apiKey) {
    throw new Error("API Key is missing. Please configure it in Settings.");
  }

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
    const messages = [
        { role: 'system', content: 'You are a helpful research assistant.' },
        { role: 'user', content: prompt }
    ];

    const rawText = await callOpenAI(messages, config, { temperature: 0.5 });
    
    // Extract content within <final_answer> tags and clean up markdown bolding
    const match = rawText.match(/<final_answer>([\s\S]*?)<\/final_answer>/);
    
    if (match && match[1]) {
      return match[1].trim().replace(/\*\*/g, '');
    } else {
      // Fallback if model fails to tag
      return rawText.replace(/<final_answer>|<\/final_answer>/g, '').replace(/\*\*/g, '').trim();
    }

  } catch (error) {
    console.error("Follow-up Error:", error);
    throw error;
  }
};

export const analyzeTrendsWithOpenAI = async (history: HistoryItem[]): Promise<string> => {
  const config = getApiConfig();
  if (!config.apiKey) {
    throw new Error("API Key is missing. Please configure it in Settings.");
  }

  if (history.length === 0) {
     return "No history available to analyze.";
  }

  let aggregatedContext = "";
  
  history.forEach((item, index) => {
    aggregatedContext += `
    --- PAPER ${index + 1} ---
    Title: ${item.title}
    Analysis Content (Excerpt):
    ${item.analysis?.markdown.substring(0, 1500) || ''}...
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
    const messages = [
        { role: 'system', content: 'You are a helpful research assistant.' },
        { role: 'user', content: prompt }
    ];

    return await callOpenAI(messages, config, { temperature: 0.3, maxTokens: 3000 });
  } catch (error) {
    console.error("Trend Analysis Error:", error);
    throw error;
  }
};