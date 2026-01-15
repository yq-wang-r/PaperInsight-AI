
import { GoogleGenAI, Tool, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport, VenueReport, UserSettings, ApiProvider } from "../types";

// --- Global Settings Store ---
// Default to Gemini (Environment variables will be used if user settings are empty)
let currentSettings: UserSettings = {
    provider: 'gemini',
    apiKey: '',
    baseUrl: '',
    model: 'gemini-2.0-flash', // Default fallback
    enableSearch: true
};

export const updateGlobalSettings = (settings: UserSettings) => {
    currentSettings = settings;
};

export const getGlobalSettings = () => currentSettings;

// --- Helper: Retry Logic ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry<T>(
    operation: () => Promise<T>, 
    signal?: AbortSignal,
    retries = 2, 
    baseDelay = 1000
): Promise<T> {
    try {
        if (signal?.aborted) throw new Error("Aborted");
        return await operation();
    } catch (error: any) {
        if (signal?.aborted) throw new Error("Aborted");

        const msg = error.message || "";
        // Retry on Server Errors (5xx) or specific Network errors
        const isServerErr = 
            error.status >= 500 || 
            msg.includes("500") || 
            msg.includes("503") ||
            msg.includes("Rpc failed") || 
            msg.includes("xhr error") ||
            msg.includes("fetch failed") ||
            msg.includes("Overloaded");

        // Do NOT retry on 30011 (Payment required) or 4xx errors
        if (msg.includes("30011") || msg.includes("401") || msg.includes("403")) {
            throw error;
        }

        if (isServerErr && retries > 0) {
            console.warn(`Transient Error (${retries} retries left):`, msg);
            await wait(baseDelay);
            return runWithRetry(operation, signal, retries - 1, baseDelay * 2);
        }
        throw error;
    }
}

// --- OpenAI / Zhipu Compatible Handler ---

async function callOpenAICompatible(
    prompt: string, 
    systemInstruction: string,
    isJsonMode: boolean = false,
    settings: UserSettings,
    signal?: AbortSignal
): Promise<{ text: string, sources?: any[] }> {
    const { apiKey, baseUrl, model, provider } = settings;
    
    // STRICT URL Logic: Ensure it ends with /chat/completions
    // SiliconFlow Example: https://api.siliconflow.cn/v1/chat/completions
    let url = baseUrl.replace(/\/+$/, ''); // Remove trailing slash
    if (!url.endsWith('/chat/completions')) {
         url = `${url}/chat/completions`;
    }

    // Special handling for Zhipu Web Search (Only for Zhipu)
    const tools = (provider === 'zhipu' && settings.enableSearch) 
        ? [{ type: "web_search", web_search: { enable: true, search_result: true } }] 
        : undefined;

    const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
    ];

    // Payload aligned strictly with standard Chat Completions API (and user's curl example)
    const body: any = {
        model: model,
        messages: messages,
        temperature: 0.7, // As requested in curl example
        max_tokens: 4096, // Using 4096 to ensure full paper analysis fits (User curl example used 1000, but app needs more)
        stream: false,
    };

    if (tools) body.tools = tools;
    
    // --- DEBUG LOGGING ---
    console.log(`%c[${provider.toUpperCase()} Request]`, "color: blue; font-weight: bold;");
    console.log("URL:", url);
    console.log("Model:", model);
    console.log("Payload:", JSON.stringify(body, null, 2));
    // ---------------------

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
    });

    // --- DEBUG LOGGING ---
    console.log(`%c[${provider.toUpperCase()} Response Status]`, "color: green; font-weight: bold;", response.status);
    // ---------------------

    if (!response.ok) {
        const errText = await response.text();
        console.error("API Error Body:", errText); // Log raw error for user debugging

        let friendlyMessage = `Provider Error (${response.status})`;

        try {
            const errJson = JSON.parse(errText);
            const code = errJson.code || errJson.error?.code;
            const msg = errJson.message || errJson.error?.message || errText;

            // Handle SiliconFlow specific 30011 error
            if (code === 30011 || msg.includes("30011")) {
                friendlyMessage = `SiliconFlow Error (30011): This model (${model}) requires a paid balance. Please check your SiliconFlow dashboard to ensure your API Key is associated with a funded project/team. Try switching to a free model like 'deepseek-ai/DeepSeek-V3' or 'Qwen/Qwen2.5-72B-Instruct' if needed.`;
            } else {
                friendlyMessage = `Provider Error (${code}): ${msg}`;
            }
        } catch (e) {
            friendlyMessage += `: ${errText}`;
        }
        
        throw new Error(friendlyMessage);
    }

    const data = await response.json();
    console.log("Response Data:", data); // Log success data

    const content = data.choices?.[0]?.message?.content || "";
    
    // Attempt to extract Zhipu search results if available (structure varies, but usually in tool_calls or appended text)
    return { text: content, sources: [] }; 
}

// --- Gemini Handler (Existing Logic with Refinements) ---

async function callGemini(
    prompt: string,
    systemInstruction: string,
    isJsonMode: boolean,
    settings: UserSettings,
    signal?: AbortSignal,
    forceModel?: string // Allow overriding model for fallback chain
): Promise<{ text: string, sources?: any[] }> {
    // Priority: Settings Key > Env Key
    const finalKey = settings.apiKey || process.env.API_KEY;
    if (!finalKey) throw new Error("API Key is missing for Gemini.");

    const ai = new GoogleGenAI({ apiKey: finalKey });
    
    // Determine Model
    const modelToUse = forceModel || settings.model || 'gemini-2.0-flash';
    
    const config: any = {
        systemInstruction: systemInstruction,
        temperature: 0.3,
    };

    if (settings.enableSearch) {
        config.tools = [{ googleSearch: {} }];
    }
    
    if (isJsonMode) {
        config.responseMimeType = "application/json";
    }

    const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: config
    });

    return {
        text: response.text || "",
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
}

// --- Unified Dispatcher ---

async function dispatchAIRequest(
    prompt: string,
    systemInstruction: string,
    isJsonMode: boolean,
    signal?: AbortSignal,
    overrideSearch: boolean = true
): Promise<{ text: string, sources?: any[] }> {
    
    const settings = { ...currentSettings };
    if (!overrideSearch) settings.enableSearch = false; // Disable search for simple tasks

    // 1. Zhipu / OpenAI / SiliconFlow Compatible
    if (settings.provider === 'zhipu' || settings.provider === 'openai' || settings.provider === 'siliconflow') {
        if (!settings.apiKey) throw new Error("API Key is required for third-party providers.");
        // Direct call without fallback logic (as requested to support Pro models correctly)
        return await runWithRetry(() => callOpenAICompatible(prompt, systemInstruction, isJsonMode, settings, signal), signal);
    }

    // 2. Gemini (Default) with Fallback Logic
    // We only use the fallback logic if the user hasn't strictly defined a custom model,
    // OR if the user is using the default 'gemini' provider without specific overrides.
    const models = [
        settings.model || 'gemini-2.0-flash', // Try user selection or default first
        'gemini-2.0-flash-lite-preview-02-05',
        'gemini-2.0-flash'
    ];
    // Remove duplicates
    const uniqueModels = [...new Set(models)];

    let lastError: any;

    for (const model of uniqueModels) {
        try {
            return await runWithRetry(() => callGemini(prompt, systemInstruction, isJsonMode, settings, signal, model), signal);
        } catch (error: any) {
            lastError = error;
            if (signal?.aborted) throw error;
            // Only continue to next model on 429/Quota/503
            const isQuota = error.message?.includes('429') || error.message?.includes('Quota') || error.message?.includes('Overloaded');
            if (!isQuota) throw error; // Fatal error
            console.warn(`Gemini model ${model} failed, trying next...`);
        }
    }

    throw lastError;
}


const SYSTEM_INSTRUCTION_ANALYSIS = `
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
  const prompt = `Search for and analyze the paper related to: "${query}". If multiple papers match, choose the most relevant or influential one. Strictly follow the defined output format.`;
  
  try {
      const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_ANALYSIS, false, signal, true);
      return {
          markdown: result.text,
          groundingChunks: result.sources
      };
  } catch (error: any) {
      if (signal?.aborted || error.message === "Aborted") {
          throw new Error("Analysis process was stopped by the user.");
      }
      throw error;
  }
};

const SYSTEM_INSTRUCTION_GENERIC = "You are a helpful academic assistant.";

/**
 * Sub-agent to verify paper existence and find the official link.
 */
const verifyAndFindPaperLink = async (title: string, year: string): Promise<string | undefined> => {
    const prompt = `
      Task: Find the official URL for the specific paper: "${title}" (approx. year: ${year}).
      Output JSON only: { "found": boolean, "url": "string | null", "verified_title": "string" }
    `;

    try {
        const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, true, undefined, true);
        // Clean JSON (remove markdown blocks if present)
        const jsonStr = result.text.replace(/```json|```/g, '').trim();
        const data = JSON.parse(jsonStr);
        return data.found && data.url ? data.url : undefined;
    } catch (e) {
        return undefined;
    }
};

export const checkPaperTimeliness = async (title: string, authorAndYear: string): Promise<TimelinessReport> => {
    const prompt = `
        Role: Technical Research Auditor.
        Task: Analyze the timeliness of the paper "${title}" (${authorAndYear}).
        1. Determine if this paper is considered "Outdated" or "Legacy" (>3-5 years old in fast AI fields).
        2. Suggest 3 **State-of-the-Art (SOTA)** papers or direct successors.
        STRICT: At least ONE recommendation MUST be published in 2024-2025.
        
        Output JSON only:
        {
            "isOutdated": boolean,
            "status": "Legacy" | "Current" | "Seminal Classic",
            "summary": "Short explanation.",
            "recommendations": [ { "title": "Title", "year": "202X", "reason": "Reason" } ]
        }
    `;

    try {
        const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, true, undefined, true);
        const jsonStr = result.text.replace(/```json|```/g, '').trim();
        const report = JSON.parse(jsonStr) as TimelinessReport;

        // Phase 2: Verify links (Lazy logic: parallel execution, non-blocking for result return)
        if (report.recommendations && report.recommendations.length > 0) {
            verifyRecommendations(report.recommendations).then(verified => {
               // Note: This async update won't affect the immediate return, 
               // but in a real app we might update state. 
               // For now, we return the report immediately as verifying takes time.
            });
        }
        return report;
    } catch (e) {
        return { isOutdated: false, status: "Check Unavailable", summary: "Unable to verify timeliness.", recommendations: [] };
    }
};

async function verifyRecommendations(recs: any[]) {
    return Promise.all(recs.map(async (rec) => {
        const link = await verifyAndFindPaperLink(rec.title, rec.year);
        return { ...rec, link };
    }));
}

export const checkVenueQuality = async (venueText: string): Promise<VenueReport> => {
    const prompt = `
        Role: Academic Evaluator.
        Task: Analyze the academic reputation: "${venueText}".
        Output JSON only:
        {
            "name": "Canonical Name",
            "type": "Conference" | "Journal" | "Unknown",
            "quality": "Short Rating (e.g. 'CCF A')",
            "summary": "Concise summary."
        }
    `;

    try {
        const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, true, undefined, true);
        const jsonStr = result.text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr) as VenueReport;
    } catch (e) {
        return { name: venueText, type: 'Unknown', quality: 'Check Unavailable', summary: "Unable to analyze venue." };
    }
};

export const checkAuthorIntegrity = async (authors: string): Promise<IntegrityReport> => {
    const prompt = `
        Role: Academic Integrity Officer.
        Task: Check authors: "${authors}" for "academic misconduct", "retraction", "fraud".
        Rules: Be conservative. Only flag if verified.
        Output JSON only:
        {
            "hasIssues": boolean,
            "summary": "Concise findings."
        }
    `;

    try {
        const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, true, undefined, true);
        const jsonStr = result.text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr) as IntegrityReport;
    } catch (e) {
        return { hasIssues: false, summary: "Integrity check unavailable." };
    }
};

export const askFollowUp = async (
  question: string, 
  originalContext: string, 
  history: ChatMessage[]
): Promise<string> => {
  const historyContext = history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');

  const prompt = `
    Context (Original Analysis):
    ${originalContext}

    Conversation History:
    ${historyContext}

    Current User Question:
    ${question}

    INTERNAL INSTRUCTION:
    Critique your draft answer internally, then output ONLY the final answer inside <final_answer> tags.
    No markdown bolding (asterisks) in final answer.
  `;

  try {
    // Follow-up usually doesn't need web search unless specifically asked, but keeping it optional
    const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, false, undefined, false);
    
    const rawText = result.text;
    const match = rawText.match(/<final_answer>([\s\S]*?)<\/final_answer>/);
    
    if (match && match[1]) {
      return match[1].trim().replace(/\*\*/g, '');
    } else {
      return rawText.replace(/<final_answer>|<\/final_answer>/g, '').replace(/\*\*/g, '').trim();
    }
  } catch (error) {
    console.error("Follow-up Error:", error);
    throw error;
  }
};

export const analyzeTrendsWithGemini = async (history: HistoryItem[]): Promise<string> => {
  if (history.length === 0) return "No history available.";

  let aggregatedContext = "";
  history.forEach((item, index) => {
    aggregatedContext += `\n--- PAPER ${index + 1} ---\nTitle: ${item.title}\nAnalysis: ${item.analysis.markdown}\n`;
  });

  const prompt = `
    Role: Chief Research Scientist.
    Task: Generate a Trend & Evolution Report based on these papers:
    ${aggregatedContext}
    
    Output Markdown:
    # 📈 领域演进与趋势深度分析报告
    (Sections: Chronological Order, Field Evolution, Technical Flows, Future Directions, Recommended Reading)
  `;

  try {
    const result = await dispatchAIRequest(prompt, SYSTEM_INSTRUCTION_GENERIC, false, undefined, true);
    return result.text;
  } catch (error) {
    throw error;
  }
};
