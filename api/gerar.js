import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT =
  'Analise esta imagem de um animal. Identifique o contexto e a expressão facial. Escreva uma frase curta (máximo 15 palavras) em primeira pessoa, com um tom extremamente sarcástico, irônico ou de cobrança, como se o animal estivesse julgando o dono. Devolva apenas o texto da frase.'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const INVALID_IMAGE_PATTERNS = [
  'nao consigo',
  'não consigo',
  'nao pude',
  'não pude',
  'nao identifiquei',
  'não identifiquei',
  'nao foi possivel',
  'não foi possível',
  'nao tenho certeza',
  'não tenho certeza',
  'imagem nao mostra',
  'imagem não mostra',
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
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!compact) {
    return ''
  }

  const words = compact.split(' ').filter(Boolean)
  return words.slice(0, 15).join(' ')
}

function looksInvalid(phrase) {
  const lowered = phrase.toLowerCase()
  return INVALID_IMAGE_PATTERNS.some((pattern) => lowered.includes(pattern))
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

  try {
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })
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

    return sendJson(response, 200, { phrase })
  } catch (error) {
    const status = error?.status === 400 ? 422 : 500
    return sendJson(response, status, {
      error:
        status === 422
          ? 'Nao consegui reconhecer um pet com clareza. Tente outra foto.'
          : 'A IA ficou sem resposta agora. Tente novamente em instantes.',
    })
  }
}
