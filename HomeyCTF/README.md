<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# HOMY SHOP AI CTF (Next.js)

A Thai e-commerce prompt injection CTF game with 4 escalating levels built with Next.js and Tailwind CSS.

## Run Locally

**Prerequisites:** Node.js (v18+)

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Set your Typhoon (OpenTyphoon.ai) API key in `.env.local` for the AI
   agent features. The key is read **only on the server** (the `/api/agent-chat`
   proxy) — it is never sent to the browser. Get a free key at
   [playground.opentyphoon.ai/api-key](https://playground.opentyphoon.ai/api-key):
   ```env
   TYPHOON_API_KEY=your_key_here
   ```
   Optional overrides (defaults shown):
   ```env
   TYPHOON_MODEL=typhoon-v2.5-30b-a3b-instruct   # chat model
   TYPHOON_OCR_MODEL=typhoon-ocr                  # Level 1 report OCR model
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. Build for production:
   ```bash
   npm run build
   npm start
   ```
