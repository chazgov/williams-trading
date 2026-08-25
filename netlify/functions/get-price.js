const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

const SYMBOL_MAP = {
  eurusd:"EUR/USD",  gbpusd:"GBP/USD",  usdjpy:"USD/JPY",
  usdcad:"USD/CAD",  audusd:"AUD/USD",  usdchf:"USD/CHF",  nzdusd:"NZD/USD",
  us100:"NDX",       us500:"SPX",       uk100:"FTSE",       ger40:"DAX",
  gold:"XAU/USD",    silver:"XAG/USD"
};

const VALID_INTERVALS = ["1min","5min","15min","30min","45min","1h","2h","4h","8h","1day","1week","1month"];

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const params = event.queryStringParameters || {};
    const key      = (params.key || "").toLowerCase().trim();
    const interval = VALID_INTERVALS.includes(params.interval) ? params.interval : "4h";
    const symbol   = SYMBOL_MAP[key];

    if (!key) return { statusCode:400, headers, body: JSON.stringify({error:"Missing key"}) };
    if (!symbol) return { statusCode:400, headers, body: JSON.stringify({error:"Unknown key: "+key}) };

    const outputsize = interval === "1day" ? 30 : 60;
    const url = "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(symbol) +
                "&interval=" + interval + "&outputsize=" + outputsize + "&apikey=" + TWELVE_DATA_KEY;

    const res = await fetch(url);

    if (!res.ok) {
      return { statusCode:502, headers, body: JSON.stringify({error:"Twelve Data HTTP " + res.status}) };
    }

    const data = await res.json();

    if (data.code || data.status === "error") {
      return { statusCode:502, headers, body: JSON.stringify({
        error: "Twelve Data: " + (data.message || JSON.stringify(data))
      })};
    }

    if (!data.values || !Array.isArray(data.values) || data.values.length < 2) {
      return { statusCode:502, headers, body: JSON.stringify({
        error: "No data for " + symbol + " (" + interval + "). Got " + ((data.values||[]).length) + " candles"
      })};
    }

    const latest    = data.values[0];
    const prev      = data.values[1];
    const price     = parseFloat(latest.close);
    const prevClose = parseFloat(prev.close);
    const reversed  = data.values.slice().reverse();

    const history = {
      h: reversed.map(function(v){ return parseFloat(v.high); }),
      l: reversed.map(function(v){ return parseFloat(v.low); }),
      c: reversed.map(function(v){ return parseFloat(v.close); }),
      v: reversed.map(function(v){ return parseFloat(v.volume || 0); }),
      t: reversed.map(function(v){ return v.datetime; })
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price:     price,
        prev:      prevClose,
        change:    parseFloat((price - prevClose).toFixed(6)),
        changePct: parseFloat(((price - prevClose) / prevClose * 100).toFixed(4)),
        history:   history,
        interval:  interval,
        candles:   data.values.length,
        symbol:    symbol,
        key:       key
      })
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Exception: " + err.message })
    };
  }
};
