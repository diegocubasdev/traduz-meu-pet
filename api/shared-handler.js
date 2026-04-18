import { GoogleGenerativeAI } from '@google/generative-ai'
import { kv } from '@vercel/kv'

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const LIMITE_DIARIO = 2
const TTL_EM_SEGUNDOS = 60 * 60 * 24
const PROMPT =
  'Analise esta imagem de um animal de estimacao. Identifique a expressao facial, a pose e o contexto visual. Escreva uma unica frase curta, com no maximo 15 palavras, em primeira pessoa, como se o proprio animal estivesse falando. A frase deve ser MUITO engracada, afiada, debochada, sarcastica, ironica e com energia de meme viral. Priorize humor de julgamento, drama exagerado, cobranca passivo-agressiva, superioridade e frustracao com o dono. Evite frases genericas, fofinhas, poeticas ou sem graca. A frase precisa soar natural, inesperada e compartilhavel, como legenda de post que faz a pessoa rir na hora. Devolva apenas o texto final, sem aspas, sem explicacao e sem emoji.'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const INVALID_IMAGE_PATTERNS = [
  'nao consigo',
  'nao pude',
  'nao identifiquei',
  'nao foi possivel',
  'nao tenho certeza',
  'imagem nao mostra',
  'nao e possivel determinar',
]

function sendJson(response, status, payload) {
  response.status(status).json(payload)
}

function getBody(request) {
  if (!request.body) {
    return {}
  }

  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body)
    } catch {
      return {}
    }
  }

  return request.body
}

function extractBase64(imageBase64) {
  const match = imageBase64.match(/^data:(.+);base64,(.+)$/)

  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    }
  }

  return {
    mimeType: null,
    data: imageBase64,
  }
}

function normalizePhrase(text) {
  const compact = text
    .replace(/["â€œâ€]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!compact) {
    return ''
  }

  return compact.split(' ').filter(Boolean).slice(0, 15).join(' ')
}

function looksInvalid(phrase) {
  const lowered = phrase.toLowerCase()
  return INVALID_IMAGE_PATTERNS.some((pattern) => lowered.includes(pattern))
}

function getReadableError(error) {
  const message = error?.message || ''
  const normalized = message.toLowerCase()

  if (error?.status === 429 || normalized.includes('quota') || normalized.includes('rate limit')) {
    return {
      status: 503,
      error: 'A conta do Gemini atingiu o limite agora. Revise quota e billing no Google AI Studio.',
    }
  }

  if (
    error?.status === 401 ||
    error?.status === 403 ||
    normalized.includes('api key') ||
    normalized.includes('permission')
  ) {
    return {
      status: 500,
      error: 'A chave do Gemini na Vercel parece invalida ou sem permissao para este modelo.',
    }
  }

  if (error?.status === 404 || normalized.includes('not found') || normalized.includes('model')) {
    return {
      status: 500,
      error: `O modelo ${MODEL_NAME} nao respondeu como esperado. Verifique GEMINI_MODEL e compatibilidade da API.`,
    }
  }

  return {
    status: 500,
    error: 'A IA ficou sem resposta agora. Tente novamente em instantes.',
  }
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return request.socket?.remoteAddress || 'ip-desconhecido'
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function getLimitKey(ip) {
  return `limite_uso_${ip}_${getDateKey()}`
}

async function incrementUsage(limitKey) {
  const updatedCount = await kv.incr(limitKey)

  await kv.expire(limitKey, TTL_EM_SEGUNDOS)

  return updatedCount
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Use POST para enviar a foto do pet.' })
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendJson(response, 500, {
      error: 'A chave da IA nao esta configurada no servidor.',
    })
  }

  const { imageBase64, mimeType } = getBody(request)

  if (!imageBase64 || !mimeType) {
    return sendJson(response, 400, {
      error: 'Envie uma imagem valida para gerar a frase.',
    })
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return sendJson(response, 400, {
      error: 'Formato de imagem nao suportado.',
    })
  }

  const extracted = extractBase64(imageBase64)
  const finalMimeType = extracted.mimeType || mimeType

  if (!ALLOWED_MIME_TYPES.has(finalMimeType) || !extracted.data) {
    return sendJson(response, 400, {
      error: 'Nao foi possivel interpretar a imagem enviada.',
    })
  }

  const clientIp = getClientIp(request)
  const limitKey = getLimitKey(clientIp)

  try {
    const currentUsage = Number((await kv.get(limitKey)) || 0)

    if (currentUsage >= LIMITE_DIARIO) {
      return sendJson(response, 429, {
        error: 'Limite diário atingido',
        code: 'LIMIT_EXCEEDED',
      })
    }

    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = client.getGenerativeModel({ model: MODEL_NAME })
    const result = await model.generateContent([
      PROMPT,
      {
        inlineData: {
          mimeType: finalMimeType,
          data: extracted.data,
        },
      },
    ])

    const rawText = result.response.text()
    const phrase = normalizePhrase(rawText)

    if (!phrase || looksInvalid(phrase)) {
      return sendJson(response, 422, {
        error: 'Nao consegui reconhecer um pet com clareza. Tente outra foto.',
      })
    }

    const updatedUsage = await incrementUsage(limitKey)

    return sendJson(response, 200, {
      phrase,
      usage: {
        limit: LIMITE_DIARIO,
        used: updatedUsage,
        remaining: Math.max(LIMITE_DIARIO - updatedUsage, 0),
      },
    })
  } catch (error) {
    console.error('Gemini request failed', {
      model: MODEL_NAME,
      ip: clientIp,
      status: error?.status,
      message: error?.message,
      stack: error?.stack,
    })

    const friendlyError = getReadableError(error)
    return sendJson(response, friendlyError.status, {
      error: friendlyError.error,
    })
  }
}
