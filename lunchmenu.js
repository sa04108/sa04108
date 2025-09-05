const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const https = require('https');

(async () => {
    console.log('🚀 점심 메뉴 웹사이트 크롤링 시작...');
    console.log(process.env.LUNCH_MENU_URL);
    console.log(process.env.SLACK_WEBHOOK_URL);
    
    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true, // CI 환경에서는 headless 모드 필수
        });
        const page = await browser.newPage();
        await page.goto(process.env.LUNCH_MENU_URL, { waitUntil: 'networkidle0' });

        // 페이지 전체 HTML 가져오기
        const html = await page.content();

        // cheerio로 로드
        const $ = cheerio.load(html);

        let imageUrl = null;

        // "식단"이 들어간 카드 찾기
        $('strong.tit_card').each((_, el) => {
            const text = $(el).text();
            if (text.includes('식단')) {
                // 같은 카드 블록 내 이미지 영역 찾기
                const card = $(el).closest('.area_card');
                const bgDiv = card.find('.wrap_fit_thumb');

                if (bgDiv.length) {
                    const style = bgDiv.attr('style'); // 예: background-image: url("https://k.kakaocdn.net/.../img_xl.jpg");
                    const match = style && style.match(/url\(["']?(.*?)["']?\)/);
                    if (match) {
                        imageUrl = match[1];
                        return false; // each 루프 중단
                    }
                }
            }
        });

        console.log("✅ 찾은 이미지:", imageUrl);

        if (imageUrl) {
            // Slack으로 전송
            console.log('📨 Slack으로 전송 중...');

            const slackData = {
                channel: '#lunch', // 채널명 변경 가능
                text: '🍽️ 이번 주 식단 메뉴!',
                attachments: [{
                    color: 'good',
                    title: '카카오 채널 식단 정보',
                    image_url: imageUrl,
                    footer: '카카오 채널에서 자동 수집',
                    ts: Math.floor(Date.now() / 1000)
                }]
            };

            const postData = JSON.stringify(slackData);

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(process.env.SLACK_WEBHOOK_URL, options, (res) => {
                console.log('Slack 응답 상태:', res.statusCode);
                if (res.statusCode === 200) {
                    console.log('🎉 Slack 전송 성공!');
                } else {
                    console.log('❌ Slack 전송 실패');
                }
            });

            req.on('error', (e) => {
                console.error('❌ 요청 오류:', e.message);
                process.exit(1);
            });

            req.write(postData);
            req.end();

            await browser.close();
            process.exit(0);
        } else {
            console.log('❌ 식단 관련 이미지를 찾을 수 없습니다.');
            await browser.close();
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        await browser.close();
        process.exit(1);
    }
})();

