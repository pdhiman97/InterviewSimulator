<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1dnTKfW63aohoJBYFJYziizoJyQw8wr6r

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

Gemini handles interview chat, report generation, and generated speech. Speech-to-text continues to use ElevenLabs.
Chat and report generation use Gemini Flash-Lite models first, with a Flash fallback. Speech streams audio using Gemini 3.8 Flash-Lite TTS first, with Gemini 3.1 Flash TTS as a fallback. Interview speech starts streaming immediately; transcript text appears shortly after audio generation starts. The interviewer asks about role-relevant experience early, considers transferable skills, and can respectfully end a clearly mismatched practice interview.
