const KEY = process.env.TWELVE_DATA_KEY || "43e0b306690347ab9640f991f5c87e3d";

const SYMBOLS = {
  eurusd:"EUR/USD", gbpusd:"GBP/USD", usdjpy:"USD/JPY",
  usdcad:"USD/CAD", audusd:"AUD/USD", usdchf:"USD/CHF", nzdusd:"NZD/USD",
  us100:"NDX",      us500:"SPX",      uk100:"FTSE",      ger40:"DAX",
  gold:"XAU/USD",   silver:"XAG/USD"
};

exports.handler = async (event) => {
  const h = { "Access-Control-Allow-Origin":"*", "Content-Type":"application/json" };
  const p = event.queryStringParameters || {};
  const key = (p.key||"").toLowerCase();
  const interval = p.interval||"4h";
  const sym = SYMBOLS[key];

  if (!sym) return { statusCode:400, headers:h, body:JSON.stringify({error:"Bad key: "+key}) };

  const n = interval==="1day" ? 30 : 60;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${n}&apikey=${KEY}`;

  try {
    const r = await fetch(url);
    const d = await r.json();

    if (!d.values || d.values.length < 2)
      return { statusCode:200, headers:h, body:JSON.stringify({error: d.message||"No data", raw:d}) };

    const rev = [...d.values].reverse();
    const latest = d.values[0], prev = d.values[1];
    const price = parseFloat(latest.close), prevP = parseFloat(prev.close);

    return { statusCode:200, headers:h, body:JSON.stringify({
      price, prev:prevP,
      change: price-prevP,
      changePct: (price-prevP)/prevP*100,
      history:{
        h: rev.map(v=>parseFloat(v.high)),
        l: rev.map(v=>parseFloat(v.low)),
        c: rev.map(v=>parseFloat(v.close)),
        v: rev.map(v=>parseFloat(v.volume||0)),
        t: rev.map(v=>v.datetime)
      },
      interval, candles:d.values.length, symbol:sym
    })};
  } catch(e) {
    return { statusCode:500, headers:h, body:JSON.stringify({error:e.message}) };
  }
};
