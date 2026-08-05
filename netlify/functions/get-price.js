const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

const SYMBOL_MAP = {
  eurusd:"EUR/USD", gbpusd:"GBP/USD", usdjpy:"USD/JPY",
  usdcad:"USD/CAD", audusd:"AUD/USD", usdchf:"USD/CHF", nzdusd:"NZD/USD",
  us100:"NDX",      us500:"SPX",      uk100:"FTSE",      ger40:"DAX",
  gold:"XAU/USD",   silver:"XAG/USD"
};

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const params = event.queryStringParameters || {};
    const key      = params.key  || "";
    const interval = params.interval || "4h"; // 4h or 1h
    const symbol   = SYMBOL_MAP[key];

    if (!symbol) {
      return { statusCode:400, headers, body: JSON.stringify({error:"Unknown key: "+key}) };
    }

    // Single time_series call — returns price + history in one request
    // 4H: 60 candles = ~60 days of 4H data (enough for 9, 20 EMA + swing detection)
    // 1H: 60 candles = ~60 hours of 1H data (enough for 9, 20 EMA)
    const outputsize = 60;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "error" || data.code) {
      return { statusCode:502, headers, body: JSON.stringify({error:"Twelve Data: "+(data.message||JSON.stringify(data))}) };
    }

    if (!data.values || !Array.isArray(data.values) || data.values.length < 10) {
      return { statusCode:502, headers, body: JSON.stringify({error:"Insufficient data returned ("+((data.values||[]).length)+" candles)"}) };
    }

    // Latest is first in array
    const latest  = data.values[0];
    const prev    = data.values[1];
    const price   = parseFloat(latest.close);
    const prevClose = parseFloat(prev.close);

    // Build history arrays oldest-first for EMA calculation
    const reversed = data.values.slice().reverse();
    const history = {
      h: reversed.map(v => parseFloat(v.high)),
      l: reversed.map(v => parseFloat(v.low)),
      c: reversed.map(v => parseFloat(v.close)),
      v: reversed.map(v => parseFloat(v.volume||0)),
      t: reversed.map(v => v.datetime)
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price,
        prev:      prevClose,
        change:    price - prevClose,
        changePct: ((price - prevClose) / prevClose) * 100,
        history,
        interval,
        candles:   data.values.length,
        symbol,
        fetchedAt: new Date().toISOString()
      })
    };

  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({error:"Exception: "+err.message}) };
  }
};
