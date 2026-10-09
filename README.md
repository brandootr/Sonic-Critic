# Sonic Critique — OpenAI edition

Mix critiques, revision comparisons, stem A/B comparisons, Studio One session predictions, and engineer chat now use OpenAI. Existing saved critiques and VST libraries remain compatible.

## Run locally

1. Install Node.js 22 or newer, then run `npm install`.
2. Copy `.env.example` to `.env.local`. Set `OPENAI_API_KEY` to your OpenAI API key.
3. Run `npm run dev` and open the local address printed by Vite.

For a built version, run `npm run build`, then `npm run preview`. Both commands serve the local API through Vite; uploading the `dist` folder alone to static hosting will not provide AI functionality.

The key is server-only and never embedded in the browser bundle. Restart the server after changing `.env.local`. The OpenAI Setup button explains configuration, and the status indicator means a key is configured, not that its account balance or model access has been verified.

Audio is sent to `gpt-audio-1.5` for listening analysis. `gpt-4.1` formats the findings into validated JSON reports and handles text/screenshot chat. Override `OPENAI_AUDIO_MODEL` and `OPENAI_CHAT_MODEL` in `.env.local` with models supporting those respective features. Audio reports use two API calls. Chat replies appear when the full response arrives.

WAV and MP3 are sent directly. Other browser-decodable audio formats are converted to PCM WAV while preserving channels. Requests are limited to 64 MB; use shorter excerpts for long files. These limits do not override OpenAI account/model limits. Session predictions are estimates from a rendered mix, not a reliable recovery of original plugin settings.

OpenAI API usage is billed separately from a ChatGPT subscription. An OpenAI API key is required; Gemini and Qwen keys do not work. This local server binds to loopback and blocks cross-origin browser requests. Public deployment requires a separately secured backend with authentication, rate limits, and HTTPS.

## Verify

`npm run lint`, `npm test`, and `npm run build`.

Tests use mocked OpenAI responses, so they do not spend API credits. A real audio request still needs your configured key.
