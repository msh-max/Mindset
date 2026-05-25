# Mindset

A web app for confronting the fears that quietly sabotage your weekly goals.

You enter your goals, select the fears in your way, and the app uses your OpenAI API key to show:

- **How that fear will personally stop YOU** (referencing your actual goals)
- **How the same fear stops OTHER people** from similar goals
- **A trajectory chart** comparing the next 10 years with the fear in control vs. you in control
- **A radar chart** showing where in life it does the most damage
- **A wake-up call** — a sharp, vivid paragraph about where this leads if nothing changes

## Run it

It's a static site — no build step.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser.

## Your API key

- Paste your OpenAI API key (`sk-...`) at the top.
- Click **Save key** to keep it in your browser's `localStorage` for next time.
- The key is sent **only** to `api.openai.com` — never to any other server.

## Models

Defaults to `gpt-4o-mini` (cheap, fast). Switch to `gpt-4o` or `gpt-4.1` for richer analyses.

## Files

- `index.html` — markup and form
- `styles.css` — dark theme
- `app.js` — OpenAI call + Chart.js rendering
