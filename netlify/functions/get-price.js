const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

const SYMBOL_MAP = {
  gbpusd:"GBP/USD", eurusd:"EUR/USD", usdjpy:"USD/JPY",
  gold:"XAU/USD",   oil:"USO:NYSE",   sp500:"SPY:NYSE",
  nas100:"QQQ:NASDAQ", ftse:"EWU:NYSE",
  audusd:"AUD/USD", usdcad:"USD/CAD", usdchf:"USD/CHF",
  nzdusd:"NZD/USD", silver:"XAG/USD", btc:"BTC/USD", eth:"ETH/USD"
};

// CFTC contract codes for live COT data
const COT_CODES = {
  gold:"088691", oil:"067651", sp500:"13874A",
  nas100:"20974P", gbpusd:"096742", eurusd:"099741",
  usdjpy:"097741", silver:"084691"
};

// Seasonal % bullish by month (0=Jan)
const SEASONAL = {
  gold:  [58,55,48,45,50,62,68,60,52,48,55,62],
  oil:   [48,50,55,58,62,68,70,65,52,48,45,48],
  gbpusd:[52,50,48,50,52,40,42,45,50,52,48,50],
  eurusd:[52,50,52,55,52,48,45,48,50,52,50,52],
  usdjpy:[48,50,52,50,48,45,48,52,55,50,48,45],
  sp500: [60,55,58,62,58,55,62,58,48,52,60,65],
  nas100:[62,55,58,60,58,52,60,55,45,50,62,65],
  ftse:  [55,52,56,60,58,54,48,45,48,52,56,58],
  silver:[52,50,45,48,50,58,62,55,48,45,50,55],
};

async function fetchCOT(key) {
  const code = COT_CODES[key];
  if (!code) return null;
  try {
    const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${code}&$order=report_date_as_yyyy_mm_dd DESC&$limit=8`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const latest = data[0];
    const commNet = parseInt(latest.comm_positions_long_all||0) - parseInt(latest.comm_positions_short_all||0);
    const prev = data[1];
    const prevNet = prev ? (parseInt(prev.comm_positions_long_all||0) - parseInt(prev.comm_positions_short_all||0)) : commNet;
    const trend = commNet > prevNet ? "increasing" : commNet < prevNet ? "decreasing" : "flat";
    const bullish = commNet > 0 && trend !== "decreasing";
    const bearish = commNet < 0 && trend !== "increasing";
    const reportDate = latest.report_date_as_yyyy_mm_dd
      ? new Date(latest.report_date_as_yyyy_mm_dd).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})
      : "unknown";
    return {
      commNet, trend, bullish, bearish, reportDate,
      signal: bullish ? "BULLISH" : bearish ? "BEARISH" : "NEUTRAL",
      text: `Commercials NET ${commNet>0?"LONG":"SHORT"} ${Math.abs(commNet).toLocaleString()} ${trend==="increasing"?"▲":trend==="decreasing"?"▼":"→"} ${trend} — as of ${reportDate}`
    };
  } catch(e) { return null; }
}

function getSeasonal(key) {
  const data = SEASONAL[key];
  if (!data) return null;
  const month = new Date().getMonth();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pct = data[month];
  return {
    pct, month: months[month],
    bullish: pct >= 55, bearish: pct <= 45,
    signal: pct >= 55 ? "BULLISH" : pct <= 45 ? "BEARISH" : "NEUTRAL",
    text: `${months[month]} historically ${pct}% bullish (30-year average)`
  };
}

exports.handler = async function(event) {
  const headers = { "Access-Control-Allow-Origin":"*", "Content-Type":"application/json" };

  try {
    const params = event.queryStringParameters || {};
    const key    = params.key  || "";
    const type   = params.type || "price";

    if (type === "cot") {
      const cot = await fetchCOT(key);
      return { statusCode: cot?200:404, headers, body: JSON.stringify(cot||{error:"No COT for "+key}) };
    }
    if (type === "seasonal") {
      const sea = getSeasonal(key);
      return { statusCode: sea?200:404, headers, body: JSON.stringify(sea||{error:"No seasonal for "+key}) };
    }

    const symbol = SYMBOL_MAP[key];
    if (!symbol) return { statusCode:400, headers, body: JSON.stringify({error:"Unknown key: "+key}) };

    // ── SINGLE CALL: time_series gives us both history AND latest price ──
    // This halves API usage and ensures price + history are always in sync
    const interval = type==="1h" ? "1h" : "1day";
    const outputsize = type==="1h" ? 30 : 25;

    const tsRes = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_KEY}`
    );
    const ts = await tsRes.json();

    if (ts.status === "error" || ts.code) {
      return { statusCode:502, headers, body: JSON.stringify({error:"Twelve Data: "+(ts.message||JSON.stringify(ts))}) };
    }

    if (!ts.values || !Array.isArray(ts.values) || ts.values.length < 14) {
      return { statusCode:502, headers, body: JSON.stringify({error:"Insufficient history returned ("+((ts.values||[]).length)+" candles)"}) };
    }

    // Latest values come first in the array
    const latest  = ts.values[0];
    const prev    = ts.values[1];
    const price   = parseFloat(latest.close);
    const prevClose = parseFloat(prev.close);
    const change  = price - prevClose;
    const changePct = (change / prevClose) * 100;

    // Build history arrays (reversed so oldest first for %R and SMA calc)
    const reversed = ts.values.slice().reverse();
    const history = {
      h: reversed.map(v => parseFloat(v.high)),
      l: reversed.map(v => parseFloat(v.low)),
      c: reversed.map(v => parseFloat(v.close))
    };

    // Separate 1H history key
    const historyKey = type === "1h" ? "history1h" : "history";

    // COT and seasonal for "all" type
    let cot = null, seasonal = null;
    if (type === "all") {
      [cot, seasonal] = await Promise.all([fetchCOT(key), Promise.resolve(getSeasonal(key))]);
    }

    const response = {
      price, prev: prevClose, change, changePct,
      source: "Twelve Data", symbol,
      fetchedAt: new Date().toISOString(),
      cot: cot||undefined,
      seasonal: seasonal||undefined
    };
    response[historyKey] = history;

    return { statusCode:200, headers, body: JSON.stringify(response) };

  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({error:"Exception: "+err.message}) };
  }
};
