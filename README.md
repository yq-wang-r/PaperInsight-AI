# PaperInsight AI 🧠✨

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat&logo=react)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.0-8E75B2.svg?style=flat&logo=google)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?style=flat&logo=typescript)

**[中文说明 (Chinese Readme)](./README_CN.md)**

**PaperInsight AI** is an intelligent research assistant designed for computer science researchers and students. It utilizes **Google Gemini 2.0 Flash & Pro** models with **Search Grounding** to retrieve, read, summarize, and critically analyze academic papers in seconds.

It goes beyond simple summarization by performing secondary checks on paper timeliness, venue reputation, and author integrity.

---

## 🚀 Key Features

### 🔍 Deep Paper Analysis
- **Smart Retrieval**: Enter a title, topic, or arXiv link. The AI retrieves the full context.
- **Structured Insights**: Automatically extracts Research Questions, Methodologies, and Key Contributions.
- **Critical Thinking**: Provides "Insights & Thoughts", highlighting innovation points, limitations, and future work.

### 🛡️ Smart Vetting & Metrics (New)
- **⏱️ Timeliness Check**: Analyzes if a paper is outdated or legacy.
  - *Feature*: Automatically recommends **3 SOTA successors**, with a strict requirement to include at least one paper from **2024-2025**.
- **🏛️ Venue & Quality Analysis**: Evaluates the academic reputation of the publication venue (e.g., CCF Rank, Q1/Q2 Journal status, community word-of-mouth).
- **⚖️ Integrity Check**: Performs a background check on authors/institutions for public records of retractions or academic misconduct.

### 📈 Field Evolution & Trend Reports
- **Multi-Paper Synthesis**: Select your entire research history to generate a comprehensive **Trend Report**.
- **Evolution Timeline**: Visualizes how the specific field has evolved chronologically.
- **Gap Analysis**: Identifies current gaps and proposes concrete research ideas.

### 💬 Interactive Discussion
- **Context-Aware Chat**: Ask follow-up questions about specific details (e.g., "Explain the loss function").
- **Self-Reflective Agent**: The AI performs an internal critique of its own answers before responding to ensure academic rigor.

### 🗂️ Data Management
- **Persistent History**: Research sessions are saved locally via LocalStorage.
- **Recycle Bin**: Safely delete items with the ability to restore them later.
- **Import/Export**: Backup your research history to JSON and restore it on any device.
- **PDF Export**: One-click export of analysis reports to PDF.

---

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI Core**: Google Gemini API (`@google/genai` SDK)
    - *Analysis*: `gemini-3-pro-preview`
    - *Chat/Vetting*: `gemini-3-flash-preview`
    - *Grounding*: `googleSearch` Tool
- **Rendering**: `katex` (Math rendering), `html2pdf.js` (Export)

---

## 🚦 Getting Started

### Prerequisites

1.  **Node.js**: Version 18+ recommended.
2.  **API Key**: You need a Google Gemini API Key. Get it at [Google AI Studio](https://aistudio.google.com/).

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/paperinsight-ai.git
    cd paperinsight-ai
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables**
    Create a `.env` file in the root directory:
    ```env
    API_KEY=your_google_gemini_api_key_here
    ```

4.  **Run the application**
    ```bash
    npm start
    ```
    Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

---

## 📖 Usage Guide

1.  **Analyze**: Type a query (e.g., "Attention Is All You Need") in the search bar.
2.  **Review**: Read the structured analysis. Check the **Timeliness** and **Venue** widgets for meta-analysis.
3.  **Discuss**: Use the floating chat button (bottom right) to ask questions.
4.  **Trends**: Click "Analyze Trends" in the sidebar to synthesize insights from all your history items.
5.  **Manage**: Use the Recycle Bin to manage deleted items or Export your data for backup.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
