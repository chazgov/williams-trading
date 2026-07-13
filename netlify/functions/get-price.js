const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

// Symbols tested against Twelve Data free tier
// Forex pairs and crypto work natively
// For indices/commodities we use the most liquid ETF proxies
const SYMBOL_MAP = {
  gbpusd: "GBP/USD",
  eurusd: "EUR/USD",
  usdjpy: "USD/JPY",
  gold:   "XAU/USD",
  oil:    "USO",
  sp500:  "SPY",
  nas100: "QQQ",
  ftse:   "EWU"
};

// EWU = iShares MSCI United Kingdom ETF — tracks UK large caps including FTSE constituents
// Available on Twelve Data free tier as a US-listed ETF

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const key = (event.queryStringParameters && event.queryStringParameters.key) || "";
    const symbol = SYMBOL_MAP[key];

    if(!symbol){
      return { statusCode:400, headers, body: JSON.stringify({ error:"Unknown key: "+key }) };
    }

    // Quote endpoint
    const qRes = await fetch(
      "https://api.twelvedata.com/quote?symbol="+encodeURIComponent(symbol)+"&apikey="+TWELVE_DATA_KEY
    );
    const q = await qRes.json();

    if(q.status==="error" || q.code){
      return { statusCode:502, headers, body: JSON.stringify({ error:"Twelve Data: "+( q.message||JSON.stringify(q)) }) };
    }

    // Time series for Williams %R + 20-day SMA (one call, 20 days)
    const hRes = await fetch(
      "https://api.twelvedata.com/time_series?symbol="+encodeURIComponent(symbol)+"&interval=1day&outputsize=20&apikey="+TWELVE_DATA_KEY
    );
    const h = await hRes.json();

    let history = null;
    if(h.values && Array.isArray(h.values) && h.values.length >= 14){
      history = {
        h: h.values.map(function(v){ return parseFloat(v.high); }).reverse(),
        l: h.values.map(function(v){ return parseFloat(v.low); }).reverse(),
        c: h.values.map(function(v){ return parseFloat(v.close); }).reverse()
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price:     parseFloat(q.close),
        prev:      parseFloat(q.previous_close),
        change:    parseFloat(q.change),
        changePct: parseFloat(q.percent_change),
        history:   history,
        source:    "Twelve Data",
        symbol:    symbol,
        fetchedAt: new Date().toISOString()
      })
    };

  } catch(err){
    return { statusCode:500, headers, body: JSON.stringify({ error:"Exception: "+err.message }) };
  }
};
