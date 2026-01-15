
import React, { useState, useEffect } from 'react';
import { UserSettings, ApiProvider } from '../types';
import { updateGlobalSettings } from '../services/geminiService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSettings: UserSettings;
    onSave: (settings: UserSettings) => void;
}

const PROVIDERS: { id: ApiProvider; name: string; defaultBaseUrl: string; defaultModel: string; note: string }[] = [
    { 
        id: 'gemini', 
        name: 'Google Gemini (Official)', 
        defaultBaseUrl: '', 
        defaultModel: 'gemini-2.0-flash',
        note: 'Best for search grounding and deep analysis. Requires Google API Key.'
    },
    { 
        id: 'siliconflow', 
        name: 'SiliconFlow (硅基流动)', 
        defaultBaseUrl: 'https://api.siliconflow.cn/v1/chat/completions', 
        defaultModel: 'Pro/zai-org/GLM-4.7', 
        note: 'High-speed API. Supports Pro/zai-org/GLM-4.7, DeepSeek-V3, etc.'
    },
    { 
        id: 'zhipu', 
        name: 'Zhipu AI (智谱 GLM)', 
        defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/', 
        defaultModel: 'glm-4-flash',
        note: 'Defaults to glm-4-flash (Free). glm-4-plus requires account balance.' 
    },
    { 
        id: 'openai', 
        name: 'OpenAI Compatible (Custom)', 
        defaultBaseUrl: 'https://api.openai.com/v1', 
        defaultModel: 'gpt-4o',
        note: 'Connect to DeepSeek, Moonshot, or local LLMs (Ollama).'
    }
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentSettings, onSave }) => {
    const [formData, setFormData] = useState<UserSettings>(currentSettings);
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(currentSettings);
        }
    }, [isOpen, currentSettings]);

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = e.target.value as ApiProvider;
        const providerConfig = PROVIDERS.find(p => p.id === newProvider);
        
        setFormData(prev => ({
            ...prev,
            provider: newProvider,
            baseUrl: providerConfig?.defaultBaseUrl || prev.baseUrl,
            model: providerConfig?.defaultModel || prev.model
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateGlobalSettings(formData);
        onSave(formData);
        onClose();
    };

    const renderModelHint = (provider: ApiProvider) => {
        switch(provider) {
            case 'zhipu':
                return (
                    <>
                        Recommended: <code>glm-4-flash</code> (Free), <code>glm-4-air</code>. <br/>
                        <span className="text-orange-400">Note: <code>glm-4-plus</code> is a paid model.</span>
                    </>
                );
            case 'siliconflow':
                return (
                    <>
                        Default: <code>Pro/zai-org/GLM-4.7</code>. <br/>
                        Alternatives: <code>deepseek-ai/DeepSeek-V3</code>, <code>Qwen/Qwen2.5-72B-Instruct</code>.
                    </>
                );
            case 'gemini':
                return "Official Google Gemini models (e.g., gemini-2.0-flash, gemini-1.5-pro).";
            default:
                return "Enter the specific model name supported by your API provider.";
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-white">
                            <i className="fas fa-cog"></i>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">API Settings</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                    
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">AI Provider</label>
                        <div className="relative">
                            <select 
                                value={formData.provider} 
                                onChange={handleProviderChange}
                                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none appearance-none transition-all"
                            >
                                {PROVIDERS.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                <i className="fas fa-chevron-down text-xs"></i>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 bg-blue-50 p-2 rounded border border-blue-100">
                            <i className="fas fa-info-circle mr-1 text-blue-500"></i>
                            {PROVIDERS.find(p => p.id === formData.provider)?.note}
                        </p>
                    </div>

                    {/* API Key */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            API Key <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showKey ? "text" : "password"}
                                value={formData.apiKey}
                                onChange={e => setFormData({...formData, apiKey: e.target.value})}
                                placeholder={formData.provider === 'gemini' ? "Use default from .env or enter custom" : "sk-..."}
                                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                <i className={`fas ${showKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Base URL (Conditional) */}
                    {formData.provider !== 'gemini' && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Base URL</label>
                            <input
                                type="text"
                                value={formData.baseUrl}
                                onChange={e => setFormData({...formData, baseUrl: e.target.value})}
                                placeholder="https://api.openai.com/v1"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-mono text-sm"
                            />
                        </div>
                    )}

                    {/* Model Name */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Model Name</label>
                        <input
                            type="text"
                            value={formData.model}
                            onChange={e => setFormData({...formData, model: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-mono text-sm"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            {renderModelHint(formData.provider)}
                        </p>
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="enableSearch"
                            checked={formData.enableSearch}
                            onChange={e => setFormData({...formData, enableSearch: e.target.checked})}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                        />
                        <label htmlFor="enableSearch" className="text-sm text-slate-700 font-medium">
                            Enable Web Search / Grounding
                        </label>
                    </div>

                </form>

                <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-sm font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
