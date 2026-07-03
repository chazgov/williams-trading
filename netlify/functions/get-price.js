bash

cat /mnt/user-data/outputs/williams-netlify-project/netlify/functions/get-price.js
// Netlify Function — runs server-side, so Twelve Data's CORS block doesn't apply.
// This is called by the browser as /api/get-price?symbol=GBP/USD
// and returns clean JSON with price, change, and history for Williams %R.

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

// Map our internal market keys to Twelve Data symbols
const SYMBOL_MAP = {
  gbpusd: "GBP/USD",
  eurusd: "EUR/USD",
  usdjpy: "USD/JPY",
  gold:   "XAU/USD",
  oil:    "WTI/USD",
  sp500:  "SPX",
  nas100: "NDX",
  ftse:   "FTSE",
  btc:    "BTC/USD"
};

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const key = (event.queryStringParameters && event.queryStringParameters.key) || "";
    const symbol = SYMBOL_MAP[key];

    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Unknown market key: " + key })
      };
    }

    // Key is embedded directly — no configuration needed

    // Fetch current quote
    const quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_DATA_KEY}`;
    const quoteRes = await fetch(quoteUrl);
    const quoteData = await quoteRes.json();

    if (quoteData.status === "error" || quoteData.code) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Twelve Data error", detail: quoteData.message || quoteData })
      };
    }

    // Fetch daily history for Williams %R (last 20 days)
    const histUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=20&apikey=${TWELVE_DATA_KEY}`;
    const histRes = await fetch(histUrl);
    const histData = await histRes.json();

    let history = null;
    if (histData.values && Array.isArray(histData.values)) {
      const highs = histData.values.map(v => parseFloat(v.high)).reverse();
      const lows = histData.values.map(v => parseFloat(v.low)).reverse();
      const closes = histData.values.map(v => parseFloat(v.close)).reverse();
      history = { h: highs, l: lows, c: closes };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price: parseFloat(quoteData.close),
        open: parseFloat(quoteData.open),
        high: parseFloat(quoteData.high),
        low: parseFloat(quoteData.low),
        prev: parseFloat(quoteData.previous_close),
        change: parseFloat(quoteData.change),
        changePct: parseFloat(quoteData.percent_change),
        history: history,
        source: "Twelve Data",
        fetchedAt: new Date().toISOString()
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Function exception", detail: err.message })
    };
  }
};
