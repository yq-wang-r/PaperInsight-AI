# PaperInsight AI 🧠✨

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat&logo=react)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.0-8E75B2.svg?style=flat&logo=google)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?style=flat&logo=typescript)

**PaperInsight AI** is an intelligent research assistant designed for computer science researchers and students. It uses **Google Gemini 2.0 Flash/Pro** models with **Search Grounding** to retrieve, read, summarize, and critically analyze academic papers in seconds.

---

## 🚀 Features

### 🔍 Deep Paper Analysis
- **Smart Retrieval**: Enter a title, topic, or arXiv link; the AI finds the most relevant paper.
- **Structured Summary**: Automatically extracts Research Questions, Methodologies, and Key Contributions.
- **Critical Thinking**: Provides "Insights & Thoughts" including highlights, limitations, and future work suggestions.
- **Trend Synthesis**: Select multiple history items to generate a comprehensive "Field Evolution & Trend Report" (Chronological timeline, tech flow, and verified future readings).

### 💬 Interactive Discussion
- **Context-Aware Chat**: Ask follow-up questions about the specific paper.
- **Self-Reflective Agent**: The AI performs an internal critique of its answer before responding to ensure academic rigor and accuracy.

### 📚 Research Management
- **History Tracking**: Automatically saves your research sessions locally.
- **PDF Export**: One-click export of analysis and discussion history to PDF.
- **Clean UI**: A minimalist, distraction-free reading interface built with Tailwind CSS.

---

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI Core**: Google Gemini API (`@google/genai` SDK)
    - *Models used*: `gemini-3-pro-preview` (Analysis), `gemini-3-flash-preview` (Chat), `googleSearch` Tool (Grounding)
- **Utilities**: `html2pdf.js` (Export), FontAwesome (Icons)

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

1.  **Analyze a Paper**: Type a query (e.g., "Attention Is All You Need") in the search bar.
2.  **Read Insights**: Review the structured breakdown (Overview, Core Content, Thoughts).
3.  **Ask Questions**: Use the floating chat button (bottom right) to discuss specific details (e.g., "Explain the loss function used").
4.  **Trend Report**: Analyze 2+ papers, then click "Analyze Trends" in the sidebar or home screen to see how the field has evolved.
5.  **Manage History**:
    - Click "PaperInsight AI" (top left) to go home.
    - Hover over items in "Recent Research" or the sidebar to see the **Delete (Trash)** icon.

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

---

*Powered by Google Gemini*
