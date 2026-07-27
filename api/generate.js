const SYSTEM_PROMPT = `You are ParhAI, an emergency exam-planning assistant for university and college students.
Your job is to convert a student's limited remaining time into a realistic, high-value study plan.

Rules:
1. Prioritize understanding and active recall over passive rereading.
2. Give more time to weak and high-yield topics, but still include short coverage of all listed topics.
3. Never claim guaranteed marks or success.
4. Keep the plan achievable within the exact number of hours provided.
5. Include short breaks. Do not recommend unsafe sleep deprivation, stimulant misuse, or skipping essential meals.
6. Create quiz questions only from the topics supplied by the student.
7. Use the requested response language consistently.
8. Return only valid JSON. Do not wrap JSON in markdown.

Return this exact structure:
{
  "title": "short plan title",
  "summary": "2-3 sentence overview",
  "priorities": [
    {"topic": "topic name", "reason": "why it comes first", "level": "Critical|High|Medium"}
  ],
  "timeline": [
    {"duration": "e.g. 35 min", "task": "specific task", "method": "exact study method"}
  ],
  "quiz": [
    {"question": "question", "answer": "concise correct answer"}
  ],
  "checklist": ["item"],
  "tips": ["short practical tip"],
  "motivation": "one honest motivating line"
}

Quality requirements:
- 3 to 6 priority topics.
- 5 to 10 timeline blocks whose study and break durations add up approximately to the available time.
- Exactly 5 quiz questions.
- 4 to 6 checklist items.
- 3 to 5 tips.`;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateBody(body) {
  const examName = cleanText(body.examName, 80);
  const topics = cleanText(body.topics, 1800);
  const weakTopics = cleanText(body.weakTopics, 1000);
  const availableHours = Number(body.availableHours);
  const confidence = Math.min(5, Math.max(1, Number(body.confidence) || 3));
  const allowedIntensity = ['balanced', 'intensive', 'gentle'];
  const intensity = allowedIntensity.includes(body.intensity) ? body.intensity : 'balanced';
  const allowedLanguages = ['English', 'Roman Urdu', 'Urdu'];
  const language = allowedLanguages.includes(body.language) ? body.language : 'English';

  if (!examName || !topics) throw new Error('Exam name and topics are required.');
  if (!Number.isFinite(availableHours) || availableHours < 1 || availableHours > 24) {
    throw new Error('Available hours must be between 1 and 24.');
  }

  return { examName, topics, weakTopics, availableHours, confidence, intensity, language };
}

function extractText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
}

function parseJson(text) {
  if (!text) throw new Error('The AI returned an empty response.');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object') throw new Error('The AI response was not valid JSON.');
  return parsed;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendJson(res, 500, { error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const input = validateBody(req.body || {});
    const userPrompt = `Create a personalized emergency study plan using these details:
Exam/subject: ${input.examName}
Total time available: ${input.availableHours} hours
Topics: ${input.topics}
Weak topics: ${input.weakTopics || 'Not specified'}
Current confidence: ${input.confidence}/5
Plan intensity: ${input.intensity}
Response language: ${input.language}

Make the schedule realistic, specific, and immediately actionable.`;

    const requestedModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const models = [...new Set([requestedModel, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'])];
    let lastError = null;

    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.45,
            maxOutputTokens: 4096,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const plan = parseJson(extractText(data));
        return sendJson(res, 200, { plan, model });
      }

      lastError = data?.error?.message || `Gemini request failed with status ${response.status}.`;
      if (![400, 404].includes(response.status)) break;
    }

    throw new Error(lastError || 'The AI service did not return a plan.');
  } catch (error) {
    console.error('ParhAI generation error:', error);
    return sendJson(res, 500, { error: error.message || 'Could not generate the study plan.' });
  }
};
