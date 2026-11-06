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
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. In Supabase, add the replacement Gemini API key as the `GEMINI_API_KEY` Edge Function secret.
4. Link the Supabase project and deploy the Edge Function:
   `supabase link --project-ref ipptzlmogkprcgqiqyuj`
   `supabase functions deploy gemini-proxy`
5. Run the app:
   `npm run dev`

Gemini handles interview chat, report generation, speech-to-text, and generated speech. The Gemini API key stays in the Supabase Edge Function secret; no ElevenLabs key is required.
Chat and report generation use Gemini Flash-Lite models first, with a Flash fallback. Speech streams audio using Gemini 3.8 Flash-Lite TTS first, with Gemini 3.1 Flash TTS as a fallback. Interview speech starts streaming immediately; transcript text appears shortly after audio generation starts. The interviewer asks about role-relevant experience early, considers transferable skills, and can respectfully end a clearly mismatched practice interview.

The Pages workflow is configured with the Supabase project URL and publishable key. The Gemini API key belongs only in Supabase Edge Function secrets.
The Gemini proxy is public because the app has no user sign-in; its CORS origin list is not authentication or rate limiting. Add authentication and usage limits before relying on it for a public launch.
