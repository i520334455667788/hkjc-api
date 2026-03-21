export default async function handler(req, res) {
    // 解決 CORS 跨網域問題
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允許您的 HTML 呼叫
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { date, venue, raceNo } = req.query;
        if (!date || !venue || !raceNo) {
            return res.status(400).json({ error: 'Require: date, venue, raceNo' });
        }

        // 呼叫馬會最新的 JSON 賠率接口
        const hkjcUrl = `https://bet.hkjc.com/racing/getJSON.aspx?type=winplaodds&date=${date}&venue=${venue}&start=${raceNo}&end=${raceNo}`;

        const response = await fetch(hkjcUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://bet.hkjc.com/racing/pages/odds_wp.aspx?lang=ch'
            }
        });

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
}
