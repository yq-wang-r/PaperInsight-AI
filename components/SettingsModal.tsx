import React, { useState, useEffect } from 'react';

interface Config {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: 'gemini' | 'openai';
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Config) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [config, setConfig] = useState<Config>({
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'Pro/zai-org/GLM-4.7',
    apiType: 'openai'
  });

  const presetConfigs = [
    {
      name: '硅基流动 (GLM-4.7)',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'Pro/zai-org/GLM-4.7'
    },
    {
      name: '硅基流动 (DeepSeek)',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V3'
    },
    {
      name: 'OpenAI (GPT-4)',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o'
    },
    {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash'
    }
  ];

  // Load config from localStorage when component mounts
  useEffect(() => {
    const savedConfig = localStorage.getItem('paper_insight_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
      } catch (e) {
        console.error('Failed to parse saved config', e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('paper_insight_config', JSON.stringify(config));
    onSave(config);
    onClose();
  };

  const handleReset = () => {
    const defaultConfig: Config = {
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: '',
      model: 'Pro/zai-org/GLM-4.7',
      apiType: 'openai'
    };
    setConfig(defaultConfig);
    localStorage.removeItem('paper_insight_config');
  };

  const handlePresetSelect = (preset: typeof presetConfigs[0]) => {
    setConfig({
      ...config,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiType: preset.name.includes('Gemini') ? 'gemini' : 'openai'
    });
  };

  if (!isOpen) return null;

  const modelOptions = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fast)' },
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Experimental' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Preview)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-pro', label: 'Gemini Pro' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <i className="fas fa-cog text-blue-600"></i>
            API 配置设置
          </h2>
          <p className="text-sm text-slate-500 mt-1">自定义 AI 服务配置</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Presets */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              快速预设
            </label>
            <div className="grid grid-cols-2 gap-2">
              {presetConfigs.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(preset)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              API 类型
            </label>
            <select
              value={config.apiType}
              onChange={(e) => setConfig({ ...config, apiType: e.target.value as 'gemini' | 'openai' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
            >
              <option value="openai">OpenAI 兼容 (硅基流动等)</option>
              <option value="gemini">Google Gemini 原生 API</option>
            </select>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              API Base URL
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="https://api.siliconflow.cn/v1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">API 服务器的完整 URL 地址</p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="输入您的 API Key"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">您的访问密钥（将安全保存在本地）</p>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              模型选择
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="Pro/zai-org/GLM-4.7"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">模型名称，如：Pro/zai-org/GLM-4.7</p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <i className="fas fa-info-circle mr-1"></i>
              配置将保存在浏览器的本地存储中，不会上传到任何服务器。
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-1"
          >
            重置默认
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-1"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex-1 flex items-center justify-center gap-2"
          >
            <i className="fas fa-save"></i>
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;