/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB per file
        files: 5
    }
});

const PORT = process.env.PORT || 4000;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/analyze', upload.array('proofs', 5), async (req, res) => {
    const { conversation } = req.body;
    const files = req.files || [];

    if (!API_KEY) {
        return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
    }

    const hasConversation = Boolean(conversation && conversation.trim());
    const hasFiles = files.length > 0;

    if (!hasConversation && !hasFiles) {
        return res.status(400).json({ error: '대화 내용이나 캡처 중 하나는 반드시 제공해주세요.' });
    }

    const trimmedConversation = hasConversation ? conversation.trim() : '';

    let prompt = '';
    
    if (files.length > 0) {
        // 이미지가 있을 때
        prompt = `
당신은 공감 능력이 뛰어난 연애 코치이자 상담가입니다. 아래 조건을 반드시 지켜 답변하세요.

⚠️ 매우 중요: 이 메시지와 함께 카톡 캡처 이미지가 첨부되어 있습니다. 반드시 이미지를 먼저 자세히 읽고, 이미지에 나온 모든 대화 내용, 메시지, 이모티콘, 말투, 감정 표현을 분석하세요. 이미지에서 대화를 추출해서 분석에 활용하세요.

0. 분석 시점에서 당신은 항상 "전 남자친구"의 시선과 감정을 1인칭으로 추적하며, 그의 속마음을 통찰한다고 생각하세요. 즉, 상대방 입장에서 감정을 해석하고 설명합니다.

1. 출력은 오직 아래 6개 행만 포함한 HTML <table>입니다. 다른 행은 절대 추가하지 마세요.
   <table>
     <tbody>
       <tr><th>구분</th><th>내용</th></tr>
       <tr><td>미련지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>회복가능성 지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>호감지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>신뢰지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>자신감지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>의지지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
     </tbody>
   </table>

2. 절대 금지 사항:
   - "핵심 감정/신호", "가능성 있는 시나리오", "추천 액션", "주의해야 할 점", "감정 케어 메시지" 등 다른 행 추가 금지
   - 표 아래 <p> 태그나 다른 HTML 요소 추가 금지
   - Markdown 기호 (#, *, -, 숫자 리스트 등) 사용 금지
   - 표 외 텍스트 추가 금지

3. 각 지수 행은 반드시 "XX점" 형식으로 0~100 사이 정수를 명시하고, 이어서 근거를 최소 두 문장으로 설명합니다. 근거는 반드시 이미지에서 읽은 대화 내용을 바탕으로 작성하세요.

${hasConversation ? `[추가 텍스트 입력]\n${trimmedConversation}\n` : ''}
`;
    } else {
        // 텍스트만 있을 때
        prompt = `
당신은 공감 능력이 뛰어난 연애 코치이자 상담가입니다. 아래 조건을 반드시 지켜 답변하세요.

0. 분석 시점에서 당신은 항상 "전 남자친구"의 시선과 감정을 1인칭으로 추적하며, 그의 속마음을 통찰한다고 생각하세요. 즉, 상대방 입장에서 감정을 해석하고 설명합니다.

1. 출력은 오직 아래 6개 행만 포함한 HTML <table>입니다. 다른 행은 절대 추가하지 마세요.
   <table>
     <tbody>
       <tr><th>구분</th><th>내용</th></tr>
       <tr><td>미련지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>회복가능성 지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>호감지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>신뢰지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>자신감지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
       <tr><td>의지지수 (0~100)</td><td>XX점. [두 문장 이상의 근거 설명]</td></tr>
     </tbody>
   </table>

2. 절대 금지 사항:
   - "핵심 감정/신호", "가능성 있는 시나리오", "추천 액션", "주의해야 할 점", "감정 케어 메시지" 등 다른 행 추가 금지
   - 표 아래 <p> 태그나 다른 HTML 요소 추가 금지
   - Markdown 기호 (#, *, -, 숫자 리스트 등) 사용 금지
   - 표 외 텍스트 추가 금지

3. 각 지수 행은 반드시 "XX점" 형식으로 0~100 사이 정수를 명시하고, 이어서 근거를 최소 두 문장으로 설명합니다.

[대화 전문]
${trimmedConversation}
`;
    }

    const contentArray = [{
        type: 'text',
        text: prompt
    }];

    for (const file of files) {
        try {
            const base64 = file.buffer.toString('base64');
            let mimeType = file.mimetype || 'image/jpeg';
            
            if (!mimeType.startsWith('image/')) {
                mimeType = 'image/jpeg';
            }

            if (file.size > 5 * 1024 * 1024) {
                console.warn(`파일 ${file.originalname}이 너무 큽니다 (${Math.round(file.size / 1024)}KB). 건너뜁니다.`);
                continue;
            }

            console.log(`이미지 처리 중: ${file.originalname}, 크기: ${Math.round(file.size / 1024)}KB, 타입: ${mimeType}, base64 길이: ${base64.length}`);

            contentArray.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64
                }
            });
        } catch (imgError) {
            console.error(`이미지 처리 오류 (${file.originalname}):`, imgError);
        }
    }

    console.log(`전송할 content 항목 수: ${contentArray.length} (텍스트 1개 + 이미지 ${contentArray.length - 1}개)`);

    if (contentArray.length === 1 && files.length > 0) {
        return res.status(400).json({ error: '이미지 파일을 처리할 수 없습니다. 파일 형식과 크기를 확인해주세요.' });
    }

    try {
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 2000,
                temperature: 0.2,
                system: '너는 감정을 섬세하게 짚어 주는 연애 코치이자 심리 상담가다. 사용자가 요청한 정확한 형식만 출력하고, 추가 항목은 절대 포함하지 않는다.',
                messages: [
                    {
                        role: 'user',
                        content: contentArray
                    }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Claude API error', JSON.stringify(data, null, 2));
            const errorMsg = data.error?.message || data.error?.type || '클로드 분석 중 문제가 발생했습니다.';
            return res.status(response.status).json({
                error: errorMsg
            });
        }

        const analysisText = Array.isArray(data.content)
            ? data.content
                  .map((block) => block.text || '')
                  .join('\n')
                  .trim()
            : '분석 결과를 가져오지 못했습니다.';

        return res.json({ analysis: analysisText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`젠가 감정 분석 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});

