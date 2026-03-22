module.exports = async function handler(req, res) {
  // 強制設定跨域 CORS，允許前端讀取
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 預檢請求放行
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const date = req.query.date;
    const venue = req.query.venue || 'ST';
    
    if (!date) {
      return res.status(400).json({ error: '請提供 date 參數 (例如: 2026-03-22)' });
    }

    // 馬會舊版穩定 JSON 接口
    const RACES_URL = `https://bet.hkjc.com/racing/getJSON.aspx?type=winplaodds&date=${date}&venue=${venue}&start=1&end=14`;
    
    // 偽裝成瀏覽器
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://bet.hkjc.com/'
    };

    const response = await fetch(RACES_URL, { headers });
    
    if (!response.ok) {
      return res.status(502).json({ error: `馬會伺服器拒絕連線 (HTTP ${response.status})。` });
    }

    const rawData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(rawData);
    } catch (e) {
      return res.status(500).json({ error: '解析失敗，馬會回傳了非 JSON 格式。', rawText: rawData.substring(0, 100) });
    }

    const resultPayload = {
      date: date,
      venue: venue,
      venueName: venue === 'HV' ? '跑馬地' : '沙田',
      races: []
    };

    if (jsonData.OUT) {
      const raceChunks = String(jsonData.OUT).split(';;');
      
      raceChunks.forEach((chunk, index) => {
        if (!chunk || chunk === '@@@#') return;
        
        const raceNo = index + 1;
        const parts = chunk.split('@@@');
        if (parts.length < 2) return;
        
        const oddsData = parts[1];
        const [winPart, plaPart] = oddsData.split('#');
        
        const winMap = {};
        if (winPart) winPart.split(';').forEach(item => { const [num, odds] = item.split('='); if (num && odds) winMap[num] = odds; });

        const plaMap = {};
        if (plaPart) plaPart.split(';').forEach(item => { const [num, odds] = item.split('='); if (num && odds) plaMap[num] = odds; });

        const runners = Object.keys(winMap).map(num => ({
          number: num,
          name: `馬號 ${num}`, 
          brand: '-',
          winOdds: winMap[num] || '-',
          plaOdds: plaMap[num] || '-',
          reserve: false
        }));

        resultPayload.races.push({ raceNo, raceName: `第 ${raceNo} 場`, runners });
      });
    }

    resultPayload.totalRaces = resultPayload.races.length;
    return res.status(200).json(resultPayload);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
