// Orchestration cho AI chat assistant: goi Google Gemini API (mien phi, khong can the
// thanh toan) voi function calling, tool se tra cuu du lieu da dong bo local
// (assistantTools.cjs) thay vi de model tu bia so lieu.
const axios = require('axios');

// Require outputPaths.cjs de dam bao dotenv da nap .env/.env.local vao process.env (side
// effect - xem outputPaths.cjs), truoc khi doc GEMINI_API_KEY ben duoi.
require('../utils/outputPaths.cjs');

const { countCtv, getLoanStats, getDataFreshness } = require('./assistantTools.cjs');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_TURNS = 6;

const DATE_RANGE_PROPERTIES = {
  fromDate: { type: 'string', description: 'Ngay bat dau, dinh dang YYYY-MM-DD' },
  toDate: { type: 'string', description: 'Ngay ket thuc (bao gom ca ngay nay), dinh dang YYYY-MM-DD' },
};

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'count_ctv',
        description:
          'Dem so luong CTV/nhan su co ngay dang ky (tao tai khoan) roi vao 1 khoang thoi gian, dua tren du lieu user da dong bo local. Dung khi nguoi dung hoi "co bao nhieu CTV", "so luong nhan su thang nay/thang truoc", v.v. Neu nguoi dung khong noi ro khoang thoi gian, mac dinh dung thang hien tai (tu ngay 1 den ngay cuoi thang cua "hom nay" da cho o system prompt).',
        parameters: {
          type: 'object',
          properties: {
            ...DATE_RANGE_PROPERTIES,
            roleFilter: {
              type: 'string',
              enum: ['ALL', 'CTV', 'RM'],
              description: 'Loc theo vai tro cu the neu nguoi dung yeu cau, mac dinh ALL (khong loc, dung cho ca CTV va RM).',
            },
          },
          required: ['fromDate', 'toDate'],
        },
      },
      {
        name: 'get_loan_stats',
        description:
          'Lay thong ke don vay (tong so don, so don da dong CLOSED, tong so tien duyet) trong 1 khoang thoi gian, tinh theo ngay cap nhat gan nhat (updatedAt) cua don vay, dua tren du lieu da dong bo local. Dung khi nguoi dung hoi ve so luong don vay, doanh so/tong tien giai ngan theo thang.',
        parameters: {
          type: 'object',
          properties: DATE_RANGE_PROPERTIES,
          required: ['fromDate', 'toDate'],
        },
      },
      {
        name: 'get_data_sync_freshness',
        description:
          'Kiem tra lan dong bo du lieu local gan nhat (user, don vay) luc nao, de biet du lieu dang tra loi co the cu bao nhieu. Dung khi nguoi dung hoi "du lieu cap nhat luc nao" hoac khi ban muon canh bao du lieu co the da cu truoc khi tra loi so lieu.',
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
];

const TOOL_IMPLEMENTATIONS = {
  count_ctv: (args) => countCtv(args || {}),
  get_loan_stats: (args) => getLoanStats(args || {}),
  get_data_sync_freshness: () => getDataFreshness(),
};

function buildSystemPrompt() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return [
    'Ban la tro ly AI noi bo cho he thong quan tri TNEX Partner (dashboard danh cho admin/van hanh).',
    `Hom nay la ${today}.`,
    'Khi nguoi dung hoi ve so lieu cu the (so luong CTV, don vay, doanh so...), BAT BUOC dung function tuong ung de tra cuu roi moi tra loi - KHONG tu bia hoac uoc luong so lieu.',
    'QUY UOC khoang thoi gian mac dinh: cac cum tu mo ho nhu "tinh den hom nay", "den gio", "tu dau thang", "thang nay" LUON LUON hieu la THANG HIEN TAI (tu ngay 1 den ngay hom nay cua thang dang chay, KHONG PHAI tu dau nam hay tu luc bat dau co du lieu). Chi dung khoang thoi gian rong hon (nhieu thang/nam) khi nguoi dung noi RO RANG (vi du "tu dau nam", "ca nam nay", "tu thang 1").',
    'BAT BUOC dung CHINH XAC cac con so function tra ve (vi du totalApprovedAmount, count, closedLoans...) - KHONG duoc tu cong/tru/nhan/uoc luong lai theo tri nho hay suy doan. Neu can hien thi don vi trieu/ty, chi duoc CHIA cho 1.000.000 hoac 1.000.000.000 tren dung con so goc, khong lam tron sai lech.',
    'Du lieu cac function tra ve la du lieu da DONG BO LOCAL (co the tre vai ngay so voi he thong that). Neu function bao loi (vi du chua bat SQLite, chua co du lieu dong bo), hay giai thich ro ly do cho nguoi dung thay vi im lang hoac doan so.',
    'Tra loi ngan gon, di thang vao trong tam, bang tieng Viet. Khi neu so lieu, LUON kem theo chinh xac khoang tu ngay - den ngay (fromDate/toDate) da truyen vao function de nguoi dung doi chieu duoc voi Dashboard.',
  ].join(' ');
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error('Chua cau hinh GEMINI_API_KEY trong .env.local.');

    error.code = 'MISSING_API_KEY';
    throw error;
  }

  try {
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json',
      },
      timeout: 45000,
    });

    return response.data;
  } catch (error) {
    const message = error?.response?.data?.error?.message || error.message || 'Loi khong xac dinh khi goi Gemini API.';
    const wrapped = new Error(message);

    wrapped.code = 'GEMINI_API_ERROR';
    wrapped.status = error?.response?.status || 502;
    throw wrapped;
  }
}

async function runToolUseLoop(contents, systemPrompt) {
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    const data = await callGemini({
      contents,
      tools: TOOLS,
      system_instruction: { parts: [{ text: systemPrompt }] },
    });

    const parts = data?.candidates?.[0]?.content?.parts || [];

    contents.push({ role: 'model', parts });

    const functionCallParts = parts.filter((part) => part.functionCall);

    if (functionCallParts.length === 0) {
      const text = parts
        .filter((part) => typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim();

      return text || '(Khong co noi dung tra loi.)';
    }

    const functionResponseParts = [];

    for (const part of functionCallParts) {
      const { name, id, args } = part.functionCall;
      const impl = TOOL_IMPLEMENTATIONS[name];
      let resultPayload;

      try {
        resultPayload = impl ? await impl(args) : { error: `Khong ho tro function "${name}".` };
      } catch (error) {
        resultPayload = { error: error?.message || 'Loi khong xac dinh khi chay function.' };
      }

      functionResponseParts.push({
        functionResponse: { name, id, response: resultPayload },
      });
    }

    contents.push({ role: 'user', parts: functionResponseParts });
  }

  return 'Xin loi, minh chua the hoan tat cau tra loi (qua nhieu buoc xu ly). Ban thu dat lai cau hoi ro/gon hon nhe.';
}

// messages: [{ role: 'user' | 'assistant', content: string }] - lich su hoi thoai tu client.
async function runAssistantChat({ messages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error('Thieu noi dung tin nhan.');

    error.code = 'INVALID_INPUT';
    throw error;
  }

  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));

  const reply = await runToolUseLoop(contents, buildSystemPrompt());

  return { reply };
}

module.exports = { runAssistantChat };
