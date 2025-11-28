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
// 질문 생성은 빠른 모델 사용, 분석은 정확한 모델 사용
const OPENAI_MODEL_QUESTIONS = process.env.OPENAI_MODEL_QUESTIONS || 'gpt-4o-mini';
const OPENAI_MODEL_ANALYSIS = process.env.OPENAI_MODEL_ANALYSIS || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY = process.env.OPENAI_API_KEY;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// OPTIONS 요청 처리 (Preflight)
app.options('*', cors());

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/analyze', upload.array('proofs', 5), async (req, res) => {
    const { conversation } = req.body;
    const files = req.files || [];

    if (!API_KEY) {
        return res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다.' });
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
        prompt = `🚨🚨🚨 절대 규칙 - 반드시 지키세요! 🚨🚨🚨

카톡 캡처 이미지를 분석하여 상대방의 감정을 분석하세요.

**분석 대상**: 이미지에 나온 대화에서 상대방(글쓴 사람이 아닌)의 감정을 분석하세요.

**출력 형식**: 아래와 같은 HTML 테이블만 출력하세요. 첫 번째 열에는 "지수명: XX점" 형식으로 점수를, 두 번째 열에는 "그 사람의 속마음"을 작성하세요.

<table>
<tbody>
<tr><th>점수</th><th>그 사람의 속마음</th></tr>
<tr><td>미련지수: 12점</td><td>그는 이미 관계 후반부터 감정적으로 지쳐있었고, 내담자님이 계속 문제를 제기할때마다 '또 시작이구나'싶어 회피하고 싶었을거예요. 헤어지자는 말에 잡지 않은 건 솔직히 그도 이 관계를 끝내고 싶었기 때문이에요.</td></tr>
<tr><td>회복가능성 지수: 20점</td><td>그는 관계 회복에 대한 의지가 거의 없어요. 대화에서 명확한 단절 의사가 드러나고 있어요. 현재로서는 회복 가능성이 매우 낮아 보여요.</td></tr>
<tr><td>호감지수: 15점</td><td>그는 내담자님에 대한 호감이 많이 줄어든 상태예요. 대화에서 냉정하고 거리감 있는 태도가 느껴져요. 예전의 따뜻함은 찾아보기 어려워요.</td></tr>
<tr><td>신뢰지수: 10점</td><td>그는 내담자님에 대한 신뢰가 거의 없는 상태예요. 대화에서 경계심과 불신이 강하게 드러나고 있어요. 신뢰 회복은 매우 어려울 것 같아요.</td></tr>
<tr><td>자신감지수: 70점</td><td>그는 자신의 결정에 대해 확신을 가지고 있어요. 헤어지자는 말에 잡지 않은 것에서도 자신의 선택에 대한 확고함이 느껴져요. 망설임 없이 결단을 내린 상태예요.</td></tr>
<tr><td>의지지수: 25점</td><td>그는 관계 개선에 대한 의지가 거의 없어요. 오히려 관계를 끝내고 싶어 하는 의지가 더 강해 보여요. 현재 상황을 유지하거나 개선하려는 노력은 보이지 않아요.</td></tr>
</tbody>
</table>

**절대 규칙**:
1. 인칭: 절대 "나는", "내가", "내게", "나를", "나의", "나도" 사용 금지! 반드시 "그는", "그녀는", "그에게", "그의", "그도"만 사용!
2. 말투: 절대 "~이다", "~다", "~이었다", "~였다", "~이었고", "~였고", "~있었고", "~싶었다", "~했고" 사용 금지! 반드시 "~예요", "~에요", "~였어요", "~있었어요", "~싶었어요", "~했어요" 체만 사용!

**변환 예시**:
❌ "나는 이미 관계 후반부터 감정적으로 지쳐 있었고, 그녀가 계속 문제를 제기할 때마다 회피하고 싶었다. 나도 이 관계를 끝내고 싶었기 때문이다."
✅ "그는 이미 관계 후반부터 감정적으로 지쳐있었고, 내담자님이 계속 문제를 제기할때마다 회피하고 싶었을거예요. 그도 이 관계를 끝내고 싶었기 때문이에요."

${hasConversation ? `\n[추가 텍스트]\n${trimmedConversation}\n` : ''}`;
    } else {
        // 텍스트만 있을 때
        prompt = `🚨🚨🚨 절대 규칙 - 반드시 지키세요! 🚨🚨🚨

대화 내용을 분석하여 상대방의 감정을 분석하세요.

**분석 대상**: 대화에서 상대방(글쓴 사람이 아닌)의 감정을 분석하세요.

**출력 형식**: 아래와 같은 HTML 테이블만 출력하세요. 첫 번째 열에는 "지수명: XX점" 형식으로 점수를, 두 번째 열에는 "그 사람의 속마음"을 작성하세요.

<table>
<tbody>
<tr><th>점수</th><th>그 사람의 속마음</th></tr>
<tr><td>미련지수: 12점</td><td>그는 이미 관계 후반부터 감정적으로 지쳐있었고, 내담자님이 계속 문제를 제기할때마다 '또 시작이구나'싶어 회피하고 싶었을거예요. 헤어지자는 말에 잡지 않은 건 솔직히 그도 이 관계를 끝내고 싶었기 때문이에요.</td></tr>
<tr><td>회복가능성 지수: 20점</td><td>그는 관계 회복에 대한 의지가 거의 없어요. 대화에서 명확한 단절 의사가 드러나고 있어요. 현재로서는 회복 가능성이 매우 낮아 보여요.</td></tr>
<tr><td>호감지수: 15점</td><td>그는 내담자님에 대한 호감이 많이 줄어든 상태예요. 대화에서 냉정하고 거리감 있는 태도가 느껴져요. 예전의 따뜻함은 찾아보기 어려워요.</td></tr>
<tr><td>신뢰지수: 10점</td><td>그는 내담자님에 대한 신뢰가 거의 없는 상태예요. 대화에서 경계심과 불신이 강하게 드러나고 있어요. 신뢰 회복은 매우 어려울 것 같아요.</td></tr>
<tr><td>자신감지수: 70점</td><td>그는 자신의 결정에 대해 확신을 가지고 있어요. 헤어지자는 말에 잡지 않은 것에서도 자신의 선택에 대한 확고함이 느껴져요. 망설임 없이 결단을 내린 상태예요.</td></tr>
<tr><td>의지지수: 25점</td><td>그는 관계 개선에 대한 의지가 거의 없어요. 오히려 관계를 끝내고 싶어 하는 의지가 더 강해 보여요. 현재 상황을 유지하거나 개선하려는 노력은 보이지 않아요.</td></tr>
</tbody>
</table>

**절대 규칙**:
1. 인칭: 절대 "나는", "내가", "내게", "나를", "나의", "나도" 사용 금지! 반드시 "그는", "그녀는", "그에게", "그의", "그도"만 사용!
2. 말투: 절대 "~이다", "~다", "~이었다", "~였다", "~이었고", "~였고", "~있었고", "~싶었다", "~했고" 사용 금지! 반드시 "~예요", "~에요", "~였어요", "~있었어요", "~싶었어요", "~했어요" 체만 사용!

**변환 예시**:
❌ "나는 이미 관계 후반부터 감정적으로 지쳐 있었고, 그녀가 계속 문제를 제기할 때마다 회피하고 싶었다. 나도 이 관계를 끝내고 싶었기 때문이다."
✅ "그는 이미 관계 후반부터 감정적으로 지쳐있었고, 내담자님이 계속 문제를 제기할때마다 회피하고 싶었을거예요. 그도 이 관계를 끝내고 싶었기 때문이에요."

[대화 전문]
${trimmedConversation}
`;
    }

    // OpenAI API 형식으로 content 구성
    const messages = [];
    
    // 시스템 메시지
    messages.push({
        role: 'system',
        content: `당신은 감정 분석 AI입니다. 반드시 다음 규칙을 지키세요:

**절대 규칙 1 - 인칭**: 
- 절대 금지: "나는", "내가", "내게", "나를", "나의", "나도", "나에게"
- 반드시 사용: "그는", "그녀는", "그에게", "그의", "그도"

**절대 규칙 2 - 말투**: 
- 절대 금지: "~이다", "~다", "~이었다", "~였다", "~이었고", "~였고", "~이었기", "~였기", "~했고", "~있었고", "~싶었다", "~싶었기"
- 반드시 사용: "~예요", "~에요", "~입니다", "~였어요", "~이었어요", "~했어요", "~있었어요", "~싶었어요", "~싶었을거예요"

**구체적인 변환 예시**:
❌ 잘못: "나는 이미 관계 후반부터 감정적으로 지쳐 있었고, 그녀가 계속 문제를 제기할 때마다 '또 시작이구나' 싶어 회피하고 싶었다. 헤어지자는 말에 잡지 않은 건 솔직히 나도 이 관계를 끝내고 싶었기 때문이다."
✅ 올바름: "그는 이미 관계 후반부터 감정적으로 지쳐있었고, 내담자님이 계속 문제를 제기할때마다 '또 시작이구나'싶어 회피하고 싶었을거예요. 헤어지자는 말에 잡지 않은 건 솔직히 그도 이 관계를 끝내고 싶었기 때문이에요."

**추가 변환 규칙**:
- "~있었고" → "~있었어요" 또는 "~있었을거예요"
- "~싶었다" → "~싶었어요" 또는 "~싶었을거예요"
- "~했고" → "~했어요" 또는 "~했을거예요"
- "~이었기 때문이다" → "~이었기 때문이에요"
- "~였기 때문이다" → "~였기 때문이에요"`
    });
    
    // 사용자 메시지 구성
    const userContent = [];
    
    // 텍스트 추가
    userContent.push({
        type: 'text',
        text: prompt
    });
    
    // 이미지 추가
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

            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:${mimeType};base64,${base64}`
                }
            });
        } catch (imgError) {
            console.error(`이미지 처리 오류 (${file.originalname}):`, imgError);
        }
    }
    
    messages.push({
        role: 'user',
        content: userContent.length === 1 ? userContent[0].text : userContent
    });

    console.log(`전송할 메시지 수: ${messages.length} (시스템 1개 + 사용자 1개)`);
    console.log('=== 프롬프트 시작 ===');
    console.log(prompt.substring(0, 500)); // 처음 500자만 출력
    console.log('=== 프롬프트 끝 ===');

    if (userContent.length === 1 && files.length > 0) {
        return res.status(400).json({ error: '이미지 파일을 처리할 수 없습니다. 파일 형식과 크기를 확인해주세요.' });
    }

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: OPENAI_MODEL_ANALYSIS,
                max_tokens: 2000,
                temperature: 0,
                messages: messages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('OpenAI API error', JSON.stringify(data, null, 2));
            const errorMsg = data.error?.message || data.error?.type || '분석 중 문제가 발생했습니다.';
            return res.status(response.status).json({
                error: errorMsg
            });
        }

        const analysisText = data.choices[0].message.content || '분석 결과를 가져오지 못했습니다.';

        return res.json({ analysis: analysisText });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
    }
});

// 연애성향 질문 생성 API
app.post('/api/generate-questions', async (req, res) => {
    if (!API_KEY) {
        return res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    try {
        const { breakupEvent, attitudeAfterEvent } = req.body;
        
        // 헤어진 사건과 태도 정보 추출
        const eventText = (breakupEvent && breakupEvent.trim()) || '';
        const attitudeText = (attitudeAfterEvent && attitudeAfterEvent.trim()) || '';
        
        // 헤어진 사건의 핵심 키워드 추출 (간단한 추출)
        const eventKeywords = eventText ? eventText.split(/[,\s]+/).filter(w => w.length > 1).slice(0, 5).join(', ') : '';
        const attitudeKeywords = attitudeText ? attitudeText.split(/[,\s]+/).filter(w => w.length > 1).slice(0, 5).join(', ') : '';
        
        // 시스템 메시지로 강력한 지시
        const systemMessage = `당신은 내담자의 헤어진 사건과 태도를 바탕으로 질문을 생성하는 전문가입니다.

절대 규칙:
1. 모든 질문은 반드시 내담자가 제공한 헤어진 사건의 구체적 내용을 직접 언급해야 합니다.
2. 모든 질문은 반드시 사건 후 태도의 구체적 내용을 직접 언급해야 합니다.
3. "연인과 싸운 뒤", "좋아하는 사람이 연락이 뜸해졌을 때" 같은 일반적인 연애 상황 질문은 절대 사용하지 마세요.
4. 매번 호출할 때마다 완전히 다른 질문과 선택지를 생성해야 합니다. 이전에 생성한 질문과 절대 같으면 안 됩니다.
5. 헤어진 사건의 핵심 키워드: ${eventKeywords || '없음'}
6. 사건 후 태도의 핵심 키워드: ${attitudeKeywords || '없음'}`;

        const userMessage = `내담자가 제공한 정보:

헤어진 사건: "${eventText || '정보 없음'}"
사건 후 태도: "${attitudeText || '정보 없음'}"

위 정보를 바탕으로 총 20개의 질문을 생성하세요:

**질문 구성:**
1. 사건 심층 질문 4개 (내담자와 상대방 모두에게 동일한 사건 관련 질문)
2. 성향 파악 질문 16개:
   - 내담자 질문 8개 (아래 9가지 성향 중 8가지를 측정)
   - 상대방 질문 8개 (아래 9가지 성향 중 8가지를 측정)

**9가지 성향:**
1. 애착 스타일 (안정형/불안형/회피형/혼재형)
2. 감정 표현 방식 (말로/행동으로, 빠른 편/느린 편)
3. 갈등 해결 방식 (바로 대화/침묵/튀는 스타일)
4. 사랑의 언어 (선물/스킨십/시간/서비스/말)
5. 상처 패턴 (버려지는 거 민감/통제당하는 거 민감)
6. 관계 주도력 (리드하는지/끌려가는지/반반인지)
7. 연애에서의 가치관 (안정성 중시/스릴·자유 중시/장기적 관계 지향/현재의 행복 우선)
8. 감정선 변화 속도 (호감 생기는 속도/식는 속도)
9. 관계 내 '체면' 감각 (외부 평가 의식 정도)

**매우 중요:**
1. 사건 심층 질문 4개는 헤어진 사건 "${eventText}"과 사건 후 태도 "${attitudeText}"를 직접 언급해야 합니다.
2. 성향 파악 질문도 가능하면 헤어진 사건과 연관시켜 작성하세요.
3. "연인과 싸운 뒤", "좋아하는 사람이 연락이 뜸해졌을 때" 같은 일반적인 질문은 절대 사용하지 마세요.
4. 매번 호출할 때마다 완전히 다른 질문과 선택지를 생성하세요.

반드시 다음 JSON 형식으로 응답하세요 (다른 설명 없이 JSON만):

{
  "eventQuestions": [
    {"question": "사건 관련 질문1", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "사건 관련 질문2", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "사건 관련 질문3", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "사건 관련 질문4", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]}
  ],
  "myQuestions": [
    {"question": "내담자 성향 질문1", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문2", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문3", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문4", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문5", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문6", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문7", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "내담자 성향 질문8", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]}
  ],
  "partnerQuestions": [
    {"question": "상대방 성향 질문1", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문2", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문3", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문4", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문5", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문6", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문7", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]},
    {"question": "상대방 성향 질문8", "options": ["선택지1", "선택지2", "선택지3", "선택지4"]}
  ]
}`;

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: OPENAI_MODEL_QUESTIONS,
                max_tokens: 3000,
                temperature: 0.9,
                messages: [
                    {
                        role: 'system',
                        content: systemMessage
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', errorText);
            console.error('API Key 존재 여부:', !!API_KEY);
            console.error('API Key 길이:', API_KEY ? API_KEY.length : 0);
            try {
                const errorData = JSON.parse(errorText);
                console.error('에러 상세:', errorData);
                return res.status(response.status).json({ 
                    error: errorData.error?.message || '질문 생성에 실패했습니다.',
                    details: errorData.error
                });
            } catch (e) {
                return res.status(response.status).json({ 
                    error: '질문 생성에 실패했습니다.',
                    details: errorText
                });
            }
        }

        const data = await response.json();
        console.log('OpenAI 응답 데이터:', JSON.stringify(data, null, 2));
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('예상치 못한 응답 형식:', data);
            return res.status(500).json({ error: '서버 응답 형식이 올바르지 않습니다.' });
        }
        
        const content = data.choices[0].message.content;
        console.log('OpenAI 응답 내용:', content.substring(0, 500));
        
        // JSON 추출 - 여러 방법 시도
        let questions = null;
        
        // 방법 1: 코드 블록 안의 JSON 추출
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
            try {
                questions = JSON.parse(codeBlockMatch[1]);
            } catch (e) {
                console.error('코드 블록 JSON 파싱 실패:', e);
            }
        }
        
        // 방법 2: 첫 번째 JSON 객체 추출
        if (!questions) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    questions = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('JSON 파싱 실패:', e);
                    console.error('파싱 시도한 내용:', jsonMatch[0].substring(0, 500));
                }
            }
        }
        
        if (!questions) {
            console.error('JSON을 찾을 수 없습니다. 원본 내용:', content.substring(0, 1000));
            return res.status(500).json({ error: '질문 형식이 올바르지 않습니다. 서버 로그를 확인해주세요.' });
        }
        
        // 검증
        if (!questions.eventQuestions || !questions.myQuestions || !questions.partnerQuestions) {
            console.error('질문 구조가 올바르지 않습니다:', questions);
            return res.status(500).json({ error: '질문 구조가 올바르지 않습니다. (eventQuestions, myQuestions 또는 partnerQuestions가 없습니다.)' });
        }
        
        if (questions.eventQuestions.length !== 4 || questions.myQuestions.length !== 8 || questions.partnerQuestions.length !== 8) {
            console.error('질문 개수 불일치:', {
                eventQuestions: questions.eventQuestions.length,
                myQuestions: questions.myQuestions.length,
                partnerQuestions: questions.partnerQuestions.length
            });
            return res.status(500).json({ 
                error: `질문 개수가 올바르지 않습니다. (사건 질문: ${questions.eventQuestions.length}개, 내 질문: ${questions.myQuestions.length}개, 상대방 질문: ${questions.partnerQuestions.length}개)` 
            });
        }

        res.json(questions);
    } catch (error) {
        console.error('질문 생성 오류:', error);
        console.error('스택:', error.stack);
        return res.status(500).json({ 
            error: `질문 생성 중 오류가 발생했습니다: ${error.message}` 
        });
    }
});

// 연애성향 답변 분석 API
app.post('/api/analyze-answers', async (req, res) => {
    if (!API_KEY) {
        return res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    try {
        const { userName, relationshipPeriod, breakupEvent, attitudeAfterEvent, eventAnswers, myAnswers, partnerAnswers } = req.body;

        if (!eventAnswers || !myAnswers || !partnerAnswers) {
            return res.status(400).json({ error: '답변이 제공되지 않았습니다.' });
        }

        const prompt = `${userName || '사용자'}님의 연애성향 분석을 요청합니다.

연애기간: ${relationshipPeriod || '미입력'}

헤어지게 된 사건(상황):
${breakupEvent || '미입력'}

사건 후 서로의 태도:
${attitudeAfterEvent || '미입력'}

사건 관련 질문 답변:
${JSON.stringify(eventAnswers, null, 2)}

내 연애성향 질문 답변:
${JSON.stringify(myAnswers, null, 2)}

상대방의 연애성향 질문 답변:
${JSON.stringify(partnerAnswers, null, 2)}

위의 답변을 바탕으로 상담사가 직접 상담해주는 것처럼 자연스럽고 따뜻한 말투로 분석해주세요.

**분석 형식:**
다음 5가지 섹션으로 나누어 작성하세요. 각 섹션은 공백 포함 약 500자 내외로 작성하고, 전체적으로 공백 포함 약 3000자 정도가 되도록 하세요.

1. **나의 연애 성향** (약 500자 내외)
   - ${userName || '사용자'}님의 연애성향을 분석하여 설명
   - 애착 유형, 갈등 스타일, 감정 표현 방식, 관계 운영 방식, 자존감·경계선 등을 포함

2. **그 사람의 연애 성향** (약 500자 내외)
   - 상대방의 연애성향을 분석하여 설명
   - 애착 유형, 갈등 스타일, 감정 표현 방식, 관계 운영 방식, 자존감·경계선 등을 포함

3. **뭐가 잘 맞는지** (약 500자 내외)
   - 두 사람이 어떻게 끌렸을 수 있는지, 어떤 부분에서 매력이 있었는지 설명
   - 서로 잘 맞는 부분과 조화로운 점

4. **뭐가 잘 안맞는지** (약 500자 내외)
   - 연인의 스타일과 맞부딪히는 지점, 오해의 원인, 반복되는 패턴
   - 헤어지게 된 사건과 그 후 태도를 바탕으로 한 갈등 포인트

5. **재결합 가능성** (약 500자 내외)
   - 두 사람의 관계를 개선하기 위한 구체적인 조언
   - 재결합 가능성과 그를 위한 조건

**작성 스타일:**
- "제공", "분석", "확인" 같은 딱딱한 표현 대신 "~해요", "~입니다", "~일 수 있어요" 같은 자연스러운 말투 사용
- 상담사가 직접 이야기하는 것처럼 "~님은", "~하시는군요", "~하실 수 있어요" 같은 존댓말 사용
- 표나 리스트 형식 대신 문단으로 자연스럽게 풀어서 작성
- 따뜻하고 공감적인 톤으로 작성
- 각 섹션은 명확하게 구분하여 작성`;

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: OPENAI_MODEL_ANALYSIS,
                max_tokens: 8000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', errorText);
            return res.status(response.status).json({ error: '분석에 실패했습니다.' });
        }

        const data = await response.json();
        const analysis = data.choices[0].message.content;

        res.json({ analysis });
    } catch (error) {
        console.error('답변 분석 오류:', error);
        return res.status(500).json({ 
            error: `분석 중 오류가 발생했습니다: ${error.message}` 
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`젠가 감정 분석 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});

