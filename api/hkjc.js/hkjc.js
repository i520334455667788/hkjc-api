/**
 * Vercel Serverless Function: 抓取香港賽馬會(HKJC)排位表與即時賠率
 * Endpoint: /api/hkjc?date=2026-03-22&venue=ST
 */
export default async function handler(req, res) {
  // 1. 設定 CORS Headers，允許你的前端呼叫
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 如果是 OPTIONS 請求 (Preflight)，直接回覆 200
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // 2. 獲取查詢參數 (預設為今日、沙田 ST)
    const { date, venue = 'ST' } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: '請提供 date 參數 (格式 YYYY-MM-DD)' });
    }

    // 格式化日期，因為 HKJC API 有時需要 YYYY-MM-DD 格式
    const formattedDate = date; 
    
    // 3. 準備爬取的目標 (使用 HKJC 的公開 JSON 接口)
    // 馬會舊版 getJSON 接口對開發者最友善，返回輕量 JSON 字串 [203]
    const RACES_URL = `https://bet.hkjc.com/racing/getJSON.aspx?type=winplaodds&date=${formattedDate}&venue=${venue}&start=1&end=14`;
    
    // 模擬瀏覽器 Headers 避免被阻擋
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://bet.hkjc.com/racing/pages/odds_wp.aspx'
    };

    // 4. 發送請求取得賽事與賠率資料
    const response = await fetch(RACES_URL, { headers });
    
    if (!response.ok) {
      throw new Error(`HKJC 伺服器回應錯誤: ${response.status}`);
    }

    // 5. 解析回傳資料
    // HKJC getJSON 傳回來的有時會包裝在 OUT 欄位裡，格式如 "@@@1=4.2;2=7.5#1=1.8;2=2.1..." [203]
    const rawData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(rawData);
    } catch (e) {
      // 如果回傳的不是嚴格 JSON，嘗試清理或回報錯誤
      throw new Error('解析 HKJC JSON 失敗，馬會可能更改了 API 格式');
    }

    // 6. 將 HKJC 獨特的分號字串格式轉換為我們前端容易讀取的結構
    // 這裡我們建立一個標準化格式，配合前一個對話給你的 HTML 前端
    const resultPayload = {
      date: formattedDate,
      venue: venue,
      venueName: venue === 'HV' ? '跑馬地' : '沙田',
      races: []
    };

    // 根據 HKJC 回傳的結構進行轉換 (這部分依據當時馬會 JSON 結構解析)
    // 如果是 winplaodds 接口，通常回傳 { "OUT": "場次1@@@WinOdds#PlaOdds;;場次2@@@..." }
    if (jsonData.OUT) {
      const raceChunks = String(jsonData.OUT).split(';;'); // 分隔不同場次
      
      raceChunks.forEach((chunk, index) => {
        if (!chunk || chunk === '@@@#') return;
        
        const raceNo = index + 1;
        const [raceHeader, oddsData] = chunk.split('@@@');
        if (!oddsData) return;

        const [winPart, plaPart] = oddsData.split('#');
        
        // 解析獨贏賠率 (1=4.2;2=8.5...)
        const winMap = {};
        if (winPart) {
          winPart.split(';').forEach(item => {
            const [num, odds] = item.split('=');
            if (num && odds) winMap[num] = odds;
          });
        }

        // 解析位置賠率
        const plaMap = {};
        if (plaPart) {
          plaPart.split(';').forEach(item => {
            const [num, odds] = item.split('=');
            if (num && odds) plaMap[num] = odds;
          });
        }

        // 組裝這場的馬匹 (目前只有賠率，因為純賠率接口不會給馬名)
        // 注意：如果要馬名，實戰中你會需要打另一個 GraphQL 接口 (例如 activeMeetings) 或事先備好排位表 [179, 183]
        const runners = Object.keys(winMap).map(num => ({
          number: num,
          name: `馬號 ${num}`, // 純 odds 接口沒有馬名，這裡給預設值
          brand: '-',
          winOdds: winMap[num] || '-',
          plaOdds: plaMap[num] || '-',
          reserve: false
        }));

        resultPayload.races.push({
          raceNo: raceNo,
          raceName: `第 ${raceNo} 場`,
          runners: runners
        });
      });
    } else if (Array.isArray(jsonData)) {
      // 如果馬會回傳的是標準 JSON Array (GraphQL 結構) [179]
      resultPayload.races = jsonData.map((r, idx) => ({
        raceNo: r.raceNo || idx + 1,
        raceName: `第 ${r.raceNo || idx + 1} 場`,
        runners: (r.runners || []).map(horse => ({
          number: horse.number || horse.horseNo,
          name: horse.name || horse.horseName,
          brand: horse.brand || horse.horseCode,
          winOdds: horse.winOdds || '-',
          plaOdds: horse.plaOdds || '-',
          jockey: horse.jockeyName || '-',
          trainer: horse.trainerName || '-'
        }))
      }));
    }

    resultPayload.totalRaces = resultPayload.races.length;

    // 7. 回傳標準化 JSON 給你的前端 HTML
    return res.status(200).json(resultPayload);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
