const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

// Price symbols
const SYMBOL_MAP = {
  gbpusd:"GBP/USD", eurusd:"EUR/USD", usdjpy:"USD/JPY",
  gold:"XAU/USD", oil:"USO:NYSE", sp500:"SPY:NYSE",
  nas100:"QQQ:NASDAQ", ftse:"EWU:NYSE",
  audusd:"AUD/USD", usdcad:"USD/CAD", usdchf:"USD/CHF",
  nzdusd:"NZD/USD", silver:"XAG/USD", btc:"BTC/USD", eth:"ETH/USD"
};

// CFTC market codes for COT data (Legacy Futures Only report)
// These are the official CFTC contract codes
const COT_CODES = {
  gold:   "088691",  // Gold - COMEX
  oil:    "067651",  // Crude Oil, Light Sweet - NYMEX
  sp500:  "13874A",  // S&P 500 Consolidated - CME
  nas100: "20974P",  // Nasdaq-100 Mini - CME
  gbpusd: "096742",  // British Pound - CME
  eurusd: "099741",  // Euro FX - CME
  usdjpy: "097741",  // Japanese Yen - CME
  silver: "084691",  // Silver - COMEX
};

// Seasonal data by market and month (0=Jan, 11=Dec)
// % of years historically bullish based on 30+ year data
const SEASONAL_DATA = {
  gold:   [58,55,48,45,50,62,68,60,52,48,55,62],
  oil:    [48,50,55,58,62,68,70,65,52,48,45,48],
  gbpusd: [52,50,48,50,52,40,42,45,50,52,48,50],
  eurusd: [52,50,52,55,52,48,45,48,50,52,50,52],
  usdjpy: [48,50,52,50,48,45,48,52,55,50,48,45],
  sp500:  [60,55,58,62,58,55,62,58,48,52,60,65],
  nas100: [62,55,58,60,58,52,60,55,45,50,62,65],
  ftse:   [55,52,56,60,58,54,48,45,48,52,56,58],
  silver: [52,50,45,48,50,58,62,55,48,45,50,55],
};

async function fetchCOT(marketKey) {
  const code = COT_CODES[marketKey];
  if (!code) return null;

  try {
    // CFTC Socrata API — completely free, no key needed
    const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${code}&$order=report_date_as_yyyy_mm_dd DESC&$limit=8`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;

    const latest = data[0];
    const commLong  = parseInt(latest.comm_positions_long_all  || 0);
    const commShort = parseInt(latest.comm_positions_short_all || 0);
    const commNet   = commLong - commShort;

    // Previous week for trend
    const prev = data[1];
    const prevNet = prev ? (parseInt(prev.comm_positions_long_all||0) - parseInt(prev.comm_positions_short_all||0)) : commNet;
    const trend = commNet > prevNet ? "increasing" : commNet < prevNet ? "decreasing" : "flat";
    const trendArrow = commNet > prevNet ? "▲" : commNet < prevNet ? "▼" : "→";

    // 8-week history for chart
    const history = data.map(function(d) {
      return parseInt(d.comm_positions_long_all||0) - parseInt(d.comm_positions_short_all||0);
    }).reverse();

    const reportDate = latest.report_date_as_yyyy_mm_dd
      ? new Date(latest.report_date_as_yyyy_mm_dd).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})
      : "unknown";

    // Bullish if commercials are net long AND increasing
    // Bearish if commercials are net short AND decreasing
    const bullish = commNet > 0 && trend !== "decreasing";
    const bearish = commNet < 0 && trend !== "increasing";

    return {
      commNet,
      commLong,
      commShort,
      trend,
      trendArrow,
      bullish,
      bearish,
      history,
      reportDate,
      signal: bullish ? "BULLISH" : bearish ? "BEARISH" : "NEUTRAL",
      text: `Commercials NET ${commNet > 0 ? "LONG" : "SHORT"} ${Math.abs(commNet).toLocaleString()} ${trendArrow} ${trend} — as of ${reportDate}`
    };
  } catch(e) {
    return null;
  }
}

function getSeasonal(marketKey) {
  const data = SEASONAL_DATA[marketKey];
  if (!data) return null;
  const month = new Date().getMonth();
  const pct = data[month];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return {
    pct,
    month: months[month],
    bullish: pct >= 55,
    bearish: pct <= 45,
    signal: pct >= 55 ? "BULLISH" : pct <= 45 ? "BEARISH" : "NEUTRAL",
    text: `${months[month]} historically ${pct}% bullish (30-year average)`
  };
}

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const params = event.queryStringParameters || {};
    const key = params.key || "";
    const type = params.type || "price"; // price | cot | seasonal | all

    // COT only request
    if (type === "cot") {
      const cot = await fetchCOT(key);
      return { statusCode: cot ? 200 : 404, headers, body: JSON.stringify(cot || { error: "No COT data for " + key }) };
    }

    // Seasonal only request
    if (type === "seasonal") {
      const sea = getSeasonal(key);
      return { statusCode: sea ? 200 : 404, headers, body: JSON.stringify(sea || { error: "No seasonal data for " + key }) };
    }

    // Price request (default, all, or 4h)
    const symbol = SYMBOL_MAP[key];
    if (!symbol) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown key: " + key }) };
    }

    const qRes = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_DATA_KEY}`);
    const q = await qRes.json();

    if (q.status === "error" || q.code) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Twelve Data: " + (q.message || JSON.stringify(q)) }) };
    }

    // Daily history (for Williams %R and daily RSI)
    const hRes = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=20&apikey=${TWELVE_DATA_KEY}`);
    const h = await hRes.json();

    let history = null;
    if (h.values && Array.isArray(h.values) && h.values.length >= 14) {
      history = {
        h: h.values.map(v => parseFloat(v.high)).reverse(),
        l: h.values.map(v => parseFloat(v.low)).reverse(),
        c: h.values.map(v => parseFloat(v.close)).reverse()
      };
    }

    // 1H history (for Bollinger Bands tab)
    let history1h = null;
    if (type === "1h") {
      const h1Res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=30&apikey=${TWELVE_DATA_KEY}`);
      const h1 = await h1Res.json();
      if (h1.values && Array.isArray(h1.values) && h1.values.length >= 20) {
        history1h = {
          h: h1.values.map(v => parseFloat(v.high)).reverse(),
          l: h1.values.map(v => parseFloat(v.low)).reverse(),
          c: h1.values.map(v => parseFloat(v.close)).reverse()
        };
      }
    }

    // COT and seasonal for "all" type
    let cot = null, seasonal = null;
    if (type === "all") {
      [cot, seasonal] = await Promise.all([fetchCOT(key), Promise.resolve(getSeasonal(key))]);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price: parseFloat(q.close),
        prev: parseFloat(q.previous_close),
        change: parseFloat(q.change),
        changePct: parseFloat(q.percent_change),
        history,
        history1h: history1h || undefined,
        source: "Twelve Data",
        symbol,
        fetchedAt: new Date().toISOString(),
        cot: cot || undefined,
        seasonal: seasonal || undefined
      })
    };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Exception: " + err.message }) };
  }
};
