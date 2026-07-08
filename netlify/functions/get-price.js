const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

// Symbol map — using ETF proxies for indices/commodities (free tier compatible)
// Forex pairs work natively. Indices/commodities use liquid ETFs as proxies.
const SYMBOL_MAP = {
  gbpusd: { sym: "GBP/USD",  type: "forex",  note: "Direct forex pair" },
  eurusd: { sym: "EUR/USD",  type: "forex",  note: "Direct forex pair" },
  usdjpy: { sym: "USD/JPY",  type: "forex",  note: "Direct forex pair" },
  gold:   { sym: "XAU/USD",  type: "forex",  note: "Gold spot via forex endpoint" },
  oil:    { sym: "USO",      type: "stock",  note: "US Oil Fund ETF proxy for WTI" },
  sp500:  { sym: "SPY",      type: "stock",  note: "S&P 500 ETF proxy" },
  nas100: { sym: "QQQ",      type: "stock",  note: "Nasdaq 100 ETF proxy" },
  ftse:   { sym: "ISF.L",    type: "stock",  note: "iShares FTSE 100 ETF proxy" }
};

async function fetchData(symbol, type, apikey) {
  // Use appropriate endpoint based on type
  const quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apikey}`;
  const qRes = await fetch(quoteUrl);
  const q = await qRes.json();

  if (q.status === "error" || q.code) {
    throw new Error(q.message || JSON.stringify(q));
  }

  // Fetch daily history for Williams %R (20 days)
  const histUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=20&apikey=${apikey}`;
  const hRes = await fetch(histUrl);
  const h = await hRes.json();

  let history = null;
  if (h.values && Array.isArray(h.values) && h.values.length >= 14) {
    history = {
      h: h.values.map(v => parseFloat(v.high)).reverse(),
      l: h.values.map(v => parseFloat(v.low)).reverse(),
      c: h.values.map(v => parseFloat(v.close)).reverse()
    };
  }

  return {
    price:     parseFloat(q.close),
    open:      parseFloat(q.open),
    high:      parseFloat(q.high),
    low:       parseFloat(q.low),
    prev:      parseFloat(q.previous_close),
    change:    parseFloat(q.change),
    changePct: parseFloat(q.percent_change),
    history:   history,
    source:    "Twelve Data",
    symbol:    symbol,
    note:      SYMBOL_MAP[Object.keys(SYMBOL_MAP).find(k => SYMBOL_MAP[k].sym === symbol)]?.note || "",
    fetchedAt: new Date().toISOString()
  };
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const key = (event.queryStringParameters && event.queryStringParameters.key) || "";
    const market = SYMBOL_MAP[key];

    if (!market) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Unknown market key: " + key })
      };
    }

    const data = await fetchData(market.sym, market.type, TWELVE_DATA_KEY);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Function error: " + err.message })
    };
  }
};
