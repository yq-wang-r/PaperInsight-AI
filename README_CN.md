# PaperInsight AI (科研论文深度洞察助手) 🧠✨

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat&logo=react)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.0-8E75B2.svg?style=flat&logo=google)

**PaperInsight AI** 是一款专为计算机领域研究人员和学生设计的智能科研助手。它利用 **Google Gemini 2.0 Flash & Pro** 模型以及 **Search Grounding (搜索增强)** 技术，能够在几秒钟内检索、阅读、总结并以审辩式思维分析学术论文。

除了解析内容外，它还能自动评估论文的时效性、发表期刊的质量以及作者的学术诚信背景。

---

## 🚀 核心功能

### 🔍 深度论文解析
- **智能检索**: 输入标题、话题或 arXiv 链接，AI 自动检索全网相关内容。
- **结构化总结**: 自动提取“研究问题”、“主要方法”和“关键贡献”。
- **启发与思考**: 提供“亮点”、“不足”和“可借鉴点”分析，辅助科研选题。

### 🛡️ 智能审查与指标分析 (新功能)
- **⏱️ 时效性检查 (Timeliness Check)**: 
  - 自动分析论文是否过时（Legacy/Outdated）。
  - **强制推荐**: 必须推荐 3 篇 SOTA 后继工作，且**至少包含一篇 2024-2025 年发表的最新论文**。
- **🏛️ 期刊/会议质量分析 (Venue Analysis)**: 
  - 自动识别发表刊物/会议名称。
  - 评估学术声誉（如 CCF 等级、Q1/Q2 分区、顶会/水会口碑分析）。
- **⚖️ 诚信度核查 (Integrity Check)**: 
  - 联网检索作者或机构是否存在撤稿、学术不端等公开记录。

### 📈 领域演进与趋势报告
- **多论文综述**: 基于你的历史检索记录，生成一份宏观的**趋势演进报告**。
- **时间轴梳理**: 自动梳理技术发展的时间脉络。
- **未来方向**: 识别当前领域的研究空白 (Gap) 并提出具体的 Idea 建议。

### 💬 交互式研讨
- **上下文对话**: 针对当前论文的细节（如公式、数据集）进行追问。
- **自省式 Agent**: AI 在回答前会进行内部自我批判 (Self-Reflective)，确保回答的学术严谨性。

### 🗂️ 数据与历史管理
- **本地持久化**: 历史记录自动保存在本地浏览器中。
- **回收站**: 支持删除项目的暂存与恢复，防止误删。
- **导入/导出**: 支持将全部研究记录导出为 JSON 备份文件，方便跨设备迁移。
- **PDF 导出**: 一键将分析报告打印/导出为 PDF。

---

## 🛠 技术栈

- **前端框架**: React 19, TypeScript, Tailwind CSS
- **AI 核心**: Google Gemini API (`@google/genai` SDK)
    - *深度分析*: `gemini-3-pro-preview`
    - *对话/审查*: `gemini-3-flash-preview`
    - *联网搜索*: `googleSearch` Tool
- **工具库**: `katex` (LaTeX 公式渲染), `html2pdf.js` (导出功能)

---

## 🚦 快速开始

### 前置要求

1.  **Node.js**: 建议版本 18+。
2.  **API Key**: 需要申请 Google Gemini API Key。请前往 [Google AI Studio](https://aistudio.google.com/) 获取。

### 安装步骤

1.  **克隆项目**
    ```bash
    git clone https://github.com/yourusername/paperinsight-ai.git
    cd paperinsight-ai
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **配置环境变量**
    在项目根目录创建一个 `.env` 文件，并填入你的 API Key：
    ```env
    API_KEY=your_google_gemini_api_key_here
    ```

4.  **启动应用**
    ```bash
    npm start
    ```
    浏览器打开 [http://localhost:3000](http://localhost:3000) 即可使用。

---

## 📖 使用指南

1.  **分析**: 在搜索框输入论文标题（如 "LoRA: Low-Rank Adaptation"）。
2.  **阅读**: 查看结构化报告。注意查看右侧栏的 **时效性 (Timeliness)** 和 **期刊质量 (Venue)** 组件。
3.  **讨论**: 点击右下角的悬浮按钮开启对话。
4.  **趋势**: 点击侧边栏的 "Analyze Trends" (分析趋势)，AI 将综合你最近阅读的多篇论文生成一份综述报告。
5.  **备份**: 使用 "Export" 按钮备份数据，或使用回收站管理历史。

---

## 🤝 参与贡献

非常欢迎提交 Issue 或 Pull Request！

1.  Fork 本项目
2.  创建分支 (`git checkout -b feature/AmazingFeature`)
3.  提交更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  提交 Pull Request

---

## 📄 开源协议

本项目基于 MIT License 协议开源 - 详见 [LICENSE](LICENSE) 文件。
