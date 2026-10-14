# Sonic Critique — OpenAI edition

Mix critiques, revision comparisons, stem A/B comparisons, Studio One session predictions, and engineer chat now use OpenAI. Existing saved critiques and VST libraries remain compatible.

## Run locally

1. Install Node.js 22 or newer, then run `npm install`.
2. Copy `.env.example` to `.env.local`. Set `OPENAI_API_KEY` to your OpenAI API key.
3. Run `npm run dev` and open the local address printed by Vite.

For a local built version, run `npm run build`, then `npm run preview`. Both commands serve the local API through Vite.

## Hosted website

The version published at https://testamentofsteel.com/sonic-critic/ uses visitor-provided OpenAI keys. Select **OpenAI Setup**, enter your key, and choose **Connect & remember**. It is remembered for 30 days in a cookie marked Secure, HttpOnly, and SameSite=Strict, scoped to `/sonic-critic/`. Browser JavaScript cannot read the saved cookie; the PHP endpoint reads it when forwarding requests to OpenAI. **Clear key** removes it from this browser. The server does not persist keys in files or a database. Each visitor pays their own API charges. Browser cookie restrictions or clearing browsing data can remove the saved key sooner.

Build the hosted version with `npm run build -- --mode web`. This sets `/sonic-critic/` as the asset base and includes `public/api.php` in `dist`. Upload the resulting files to PHP hosting with cURL enabled. Static-only hosting cannot run this API. The endpoint only accepts same-origin browser requests, limits request bodies to 64 MB, and enforces six POST requests per minute per IP using hashed-address counters in the host's temporary directory. It uses fixed OpenAI endpoints and model names. No shared server key is deployed.

For local hosting, `OPENAI_API_KEY` can come from the process environment or `.env.local`; it stays server-only and is never embedded in the browser bundle. Restart the server after changing it. The public PHP website uses each visitor's cookie rather than exposing a shared environment key to public requests. The status indicator means a key is configured, not that its account balance or model access has been verified.

Audio is sent to `gpt-audio-1.5` for listening analysis. `gpt-4.1` formats the findings into validated JSON reports and handles text/screenshot chat. Override `OPENAI_AUDIO_MODEL` and `OPENAI_CHAT_MODEL` in `.env.local` with models supporting those respective features. Audio reports use two API calls. Chat replies appear when the full response arrives.

WAV and MP3 are sent directly. Other browser-decodable audio formats are converted to PCM WAV while preserving channels. Requests are limited to 64 MB; use shorter excerpts for long files. These limits do not override OpenAI account/model limits. Session predictions are estimates from a rendered mix, not a reliable recovery of original plugin settings.

OpenAI API usage is billed separately from a ChatGPT subscription. An OpenAI API key is required; Gemini and Qwen keys do not work. The local server binds to loopback and blocks cross-origin browser requests. Do not expose the local server with a shared key publicly; use the hosted BYOK build instead.

## Verify

`npm run lint`, `npm test`, and `npm run build`.

Tests use mocked OpenAI responses, so they do not spend API credits. A real audio request still needs your configured key.
