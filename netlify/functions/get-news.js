const FINNHUB_KEY = "d0aqc01r01qpum6rkde0d0aqc01r01qpum6rkdeg";

const CATEGORY_MAP = {
  "EURUSD":"forex","GBPUSD":"forex","USDJPY":"forex",
  "USDCAD":"forex","AUDUSD":"forex",
  "XAUUSD":"commodities","SPX":"general","NDX":"general"
};

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const params  = event.queryStringParameters || {};
    const symbol  = (params.symbol || "EURUSD").toUpperCase();
    const category = CATEGORY_MAP[symbol] || "forex";

    const url = "https://finnhub.io/api/v1/news?category="+category+"&token="+FINNHUB_KEY;
    const res = await fetch(url);

    if (!res.ok) {
      return { statusCode:200, headers, body: JSON.stringify({error:"News unavailable",news:[]}) };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { statusCode:200, headers, body: JSON.stringify({error:"Invalid response",news:[]}) };
    }

    // Return latest 15 articles
    const articles = data.slice(0,15).map(function(a){
      return {
        headline: a.headline || "",
        summary:  (a.summary||"").substring(0,300),
        source:   a.source || "",
        url:      a.url || "",
        datetime: a.datetime || 0
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ news: articles, symbol: symbol, category: category })
    };

  } catch(err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ error: err.message, news: [] })
    };
  }
};
