# Williams Edge Trading Dashboard — Setup Guide

This version uses a real backend (Netlify Function) to fetch live prices,
which solves the CORS problem that made prices stuck on "Loading..." before.

## One-time setup (about 10 minutes)

### Step 1 — Get a free Twelve Data API key
1. Go to https://twelvedata.com/
2. Sign up for a free account (no credit card needed)
3. Copy your API key from the dashboard

### Step 2 — Put this project on GitHub
1. Go to https://github.com and create a free account if you don't have one
2. Create a new repository (e.g. "williams-trading")
3. Upload all the files in this folder to that repository
   (the index.html file, the netlify.toml file, and the netlify folder with get-price.js inside it)

### Step 3 — Connect GitHub to Netlify
1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub and select your new repository
4. Netlify will detect the netlify.toml automatically — just click Deploy

### Step 4 — Add your API key to Netlify (important!)
1. In your Netlify site dashboard, go to Site configuration → Environment variables
2. Click "Add a variable"
3. Key: TWELVE_DATA_KEY
4. Value: paste your Twelve Data API key here
5. Click Save, then trigger a new deploy (Deploys tab → Trigger deploy)

That's it. Your site now fetches real live prices through your own
secure backend function, with no CORS issues, for free.

## Free tier limits
Twelve Data free tier: 800 requests/day, US stocks/forex/crypto included free.
Netlify Functions free tier: 125,000 invocations/month — far more than you'll use.
Both are genuinely free with no credit card auto-charge.
