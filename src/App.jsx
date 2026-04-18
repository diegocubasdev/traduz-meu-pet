import imageCompression from 'browser-image-compression'
import { toPng } from 'html-to-image'
import {
  AlertCircle,
  Copy,
  Download,
  LoaderCircle,
  MessageCircle,
  RefreshCcw,
  Share2,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import MemeCard from './components/MemeCard'
import './App.css'

const LOADING_MESSAGES = [
  'Lendo a mente do bicho...',
  'Traduzindo miados...',
  'Analisando nivel de julgamento...',
  'Convertendo olhares em cobranca...',
]

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

const compressionOptions = {
  maxSizeMB: 1.2,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.82,
}

const LIMITE_DIARIO = 2
const STORAGE_KEY = 'uso_tradutor'

function formatarDataAtual() {
  return new Intl.DateTimeFormat('pt-BR').format(new Date())
}

function lerUsoDiario() {
  const hoje = formatarDataAtual()

  if (typeof window === 'undefined') {
    return { data: hoje, uso_hoje: 0 }
  }

  const salvo = window.localStorage.getItem(STORAGE_KEY)

  if (!salvo) {
    return { data: hoje, uso_hoje: 0 }
  }

  try {
    const parsed = JSON.parse(salvo)
    const usoHoje = Number(parsed?.uso_hoje)

    if (parsed?.data !== hoje) {
      const resetado = { data: hoje, uso_hoje: 0 }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resetado))
      return resetado
    }

    if (Number.isNaN(usoHoje) || usoHoje < 0) {
      const normalizado = { data: hoje, uso_hoje: 0 }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizado))
      return normalizado
    }

    return { data: hoje, uso_hoje: usoHoje }
  } catch {
    const resetado = { data: hoje, uso_hoje: 0 }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resetado))
    return resetado
  }
}

function salvarUsoDiario(usoHoje) {
  if (typeof window === 'undefined') {
    return
  }

  const payload = {
    data: formatarDataAtual(),
    uso_hoje: Math.min(Math.max(usoHoje, 0), LIMITE_DIARIO),
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

async function readApiPayload(response) {
  const contentType = response.headers.get('content-type') || ''
  const rawBody = await response.text()

  if (!rawBody) {
    const error = new Error('A API respondeu sem conteudo.')
    error.code = 'EMPTY_API_RESPONSE'
    throw error
  }

  if (!contentType.includes('application/json')) {
    const error = new Error('A rota nao retornou JSON.')
    error.code = 'INVALID_API_RESPONSE_FORMAT'
    throw error
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    const error = new Error('A resposta da API veio invalida.')
    error.code = 'INVALID_API_RESPONSE_BODY'
    throw error
  }
}

function getMensagemAmigavelDaApi(status, code) {
  if (status === 429 || code === 'LIMIT_EXCEEDED') {
    return 'Seu pet ja fofocou demais por hoje! Volte amanha para mais 2 traducoes gratuitas.'
  }

  if (status === 422) {
    return 'Nao consegui reconhecer um pet com clareza. Tente outra foto.'
  }

  if (
    code === 'RATE_LIMIT_STORE_MISCONFIGURED' ||
    code === 'GEMINI_API_KEY_MISSING' ||
    code === 'GEMINI_AUTH_INVALID' ||
    code === 'GEMINI_MODEL_INVALID' ||
    code === 'GEMINI_RATE_LIMIT' ||
    code === 'UNKNOWN_BACKEND_ERROR' ||
    code === 'EMPTY_API_RESPONSE' ||
    code === 'INVALID_API_RESPONSE_FORMAT' ||
    code === 'INVALID_API_RESPONSE_BODY'
  ) {
    return 'Estamos com instabilidade agora. Tente novamente em instantes.'
  }

  if (status >= 500) {
    return 'Estamos com instabilidade agora. Tente novamente em instantes.'
  }

  return null
}

function App() {
  const [status, setStatus] = useState('idle')
  const [previewUrl, setPreviewUrl] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [usoDiario, setUsoDiario] = useState(() => lerUsoDiario().uso_hoje)
  const [limiteAtingido, setLimiteAtingido] = useState(() => lerUsoDiario().uso_hoje >= LIMITE_DIARIO)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loadingIndex, setLoadingIndex] = useState(0)
  const fileInputRef = useRef(null)
  const cardRef = useRef(null)

  useEffect(() => {
    if (status !== 'loading') {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setLoadingIndex((current) => (current + 1) % LOADING_MESSAGES.length)
    }, 1800)

    return () => window.clearInterval(intervalId)
  }, [status])

  const resetFlow = () => {
    setStatus('idle')
    setPreviewUrl('')
    setPhrase('')
    setError('')
    setLoadingIndex(0)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'))
      reader.readAsDataURL(file)
    })

  const verificarLimiteDiario = () => {
    const usoSalvo = lerUsoDiario()

    setUsoDiario(usoSalvo.uso_hoje)

    setLimiteAtingido(usoSalvo.uso_hoje >= LIMITE_DIARIO)
    return usoSalvo
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Envie apenas imagens do seu pet para continuar.')
      setStatus('error')
      return
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato nao suportado. Use JPG, PNG, WEBP, HEIC ou HEIF.')
      setStatus('error')
      return
    }

    verificarLimiteDiario()

    setError('')
    setPhrase('')

    const localPreview = await fileToDataUrl(file)

    setPreviewUrl(localPreview)

    try {
      setStatus('loading')

      const compressedFile = await imageCompression(file, compressionOptions)
      const imageBase64 = await fileToDataUrl(compressedFile)
      const response = await fetch('/api/gerar-traducao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: compressedFile.type || file.type,
        }),
      })

      const payload = await readApiPayload(response)

      if (!response.ok) {
        if (response.status === 429 && payload.code === 'LIMIT_EXCEEDED') {
          salvarUsoDiario(LIMITE_DIARIO)
          setUsoDiario(LIMITE_DIARIO)
          setLimiteAtingido(true)
          setError(getMensagemAmigavelDaApi(response.status, payload.code))
          setStatus('idle')
          return
        }

        const apiError = new Error(getMensagemAmigavelDaApi(response.status, payload.code))
        apiError.code = payload.code
        throw apiError
      }

      const usedToday = Number(payload?.usage?.used)

      if (!Number.isNaN(usedToday)) {
        salvarUsoDiario(usedToday)
        setUsoDiario(usedToday)
        setLimiteAtingido(usedToday >= LIMITE_DIARIO)
      }

      setPhrase(payload.phrase)
      setStatus('success')
    } catch (requestError) {
      const mensagemAmigavel = getMensagemAmigavelDaApi(
        requestError?.status || 0,
        requestError?.code,
      )

      setError(
        mensagemAmigavel || requestError.message || 'Aconteceu um erro ao gerar a frase.',
      )
      setStatus('error')
    }
  }

  const handleDownload = async () => {
    if (!cardRef.current) {
      return
    }

    try {
      setIsDownloading(true)
      const dataUrl = await generateCardImage()

      const link = document.createElement('a')
      link.download = 'traduz-meu-bicho.png'
      link.href = dataUrl
      link.click()
    } catch {
      setError('Nao foi possivel baixar a imagem. Tente novamente.')
      setStatus('error')
    } finally {
      setIsDownloading(false)
    }
  }

  const generateCardImage = async () => {
    if (!cardRef.current) {
      throw new Error('Card indisponivel para compartilhar agora.')
    }

    return toPng(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      skipFonts: true,
    })
  }

  const dataUrlToFile = async (dataUrl) => {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return new File([blob], 'traduz-meu-bicho.png', { type: 'image/png' })
  }

  const getShareText = () => {
    const baseText = phrase || 'Olha o que meu pet falou de mim no TraduzMeuBicho.'
    return `${baseText} ${window.location.origin}`
  }

  const handleNativeShare = async () => {
    if (!hasResult) {
      return
    }

    try {
      setIsSharing(true)
      const dataUrl = await generateCardImage()
      const file = await dataUrlToFile(dataUrl)
      const shareData = {
        title: 'TraduzMeuBicho',
        text: getShareText(),
      }

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          ...shareData,
          files: [file],
        })
        return
      }

      await navigator.share({
        ...shareData,
        url: window.location.origin,
      })
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        setError('Nao foi possivel abrir o compartilhamento agora.')
        setStatus('error')
      }
    } finally {
      setIsSharing(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Nao foi possivel copiar o link do site.')
      setStatus('error')
    }
  }

  const hasResult = status === 'success'
  const hasImage = Boolean(previewUrl)
  const isBusy = status === 'loading'
  const traducoesRestantes = Math.max(LIMITE_DIARIO - usoDiario, 0)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const openFilePicker = () => {
    const usoLocal = verificarLimiteDiario()

    if (!isBusy && usoLocal.uso_hoje < LIMITE_DIARIO) {
      fileInputRef.current?.click()
    }
  }
  const statusLabel = hasResult
    ? 'Card pronto para postar'
    : isBusy
      ? 'Traduzindo seu pet'
      : limiteAtingido
        ? 'Limite diario atingido'
      : hasImage
        ? 'Foto recebida'
        : 'Envie uma foto para comecar'
  const encodedShareText = encodeURIComponent(getShareText())
  const encodedUrl = encodeURIComponent(
    typeof window !== 'undefined' ? window.location.origin : 'https://traduz-meu-bicho.vercel.app',
  )
  const whatsappShareUrl = `https://wa.me/?text=${encodedShareText}`
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodedShareText}&url=${encodedUrl}`

  return (
    <main className="app-shell">
      <div className="app-layout">
        <section className="app-copy">
          <div className="app-badge">
            <Sparkles size={14} />
            TraduzMeuBicho
          </div>

          <p className="app-kicker">feito para stories, reels e posts rapidos</p>

          <h1 className="app-title">
            Seu pet entrega o julgamento. A IA monta o post.
          </h1>

          <p className="app-description">
            Escolha a foto, receba a frase ironica e baixe um card vertical
            pronto para publicar.
          </p>

          <div className="app-trust">
            <span className="app-trust-pill">1 foto</span>
            <span className="app-trust-pill">1 frase curta</span>
            <span className="app-trust-pill">1 download imediato</span>
          </div>

          <div className="app-panel app-panel--cta">
            <div className="app-panel-top">
              <div>
                <p className="app-panel-label">Comece aqui</p>
                <h2 className="app-panel-title">Suba a foto que tem mais cara de deboche.</h2>
              </div>
              <span className="app-status-chip">{statusLabel}</span>
            </div>

            <div className="app-quota" aria-live="polite">
              <span className="app-quota-label">Traducoes restantes hoje</span>
              <strong className="app-quota-value">{traducoesRestantes}/{LIMITE_DIARIO}</strong>
            </div>

            <div className="app-actions">
              {limiteAtingido ? (
                <div className="app-limit-card rounded-[1.5rem] border border-amber-200/70 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm">
                  <p className="app-limit-badge">Limite diario encerrado</p>
                  <p className="app-limit-text">
                    Seu pet ja fofocou demais por hoje! {'\uD83E\uDD2B'} Volte amanha para mais 2
                    traducoes gratuitas.
                  </p>
                </div>
              ) : (
                <label className="button-primary button-file">
                  <Upload size={18} />
                  Escolher foto
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isBusy}
                  />
                </label>
              )}

              <button
                type="button"
                onClick={resetFlow}
                disabled={isBusy && !hasImage}
                className="button-secondary"
              >
                <RefreshCcw size={16} />
                Trocar foto
              </button>
            </div>

            <p className="app-tip">
              Melhora muito com rosto visivel, expressao clara e enquadramento
              mais fechado.
            </p>

            {isBusy && (
              <div className="app-loading">
                <LoaderCircle className="icon-spin" size={18} />
                <span>{LOADING_MESSAGES[loadingIndex]}</span>
              </div>
            )}

            {error && (
              <div className="app-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}
          </div>

        </section>

        <section className="app-preview">
          <div className="app-preview-inner">
            <MemeCard
              ref={cardRef}
              imageSrc={previewUrl}
              phrase={phrase}
              isLoading={isBusy}
              onSelectImage={openFilePicker}
              isInteractive={!isBusy}
            />

            <div className="app-preview-actions">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!hasResult || isDownloading}
                className="button-dark"
              >
                <Download size={18} />
                {isDownloading ? 'Preparando arquivo...' : 'Baixar Foto'}
              </button>

              <button
                type="button"
                onClick={openFilePicker}
                disabled={isBusy || limiteAtingido}
                className="button-secondary"
              >
                <Upload size={17} />
                {limiteAtingido ? 'Volte amanha' : 'Nova tentativa'}
              </button>
            </div>

            <div className="app-share-panel">
              <p className="app-share-label">Compartilhar</p>
              <div className="app-share-actions">
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    disabled={!hasResult || isSharing}
                    className="button-share"
                  >
                    <Share2 size={16} />
                    {isSharing ? 'Abrindo...' : 'Compartilhar'}
                  </button>
                )}

                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`button-share ${!hasResult ? 'button-share--disabled' : ''}`}
                  onClick={(event) => {
                    if (!hasResult) {
                      event.preventDefault()
                    }
                  }}
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </a>

                <a
                  href={xShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`button-share ${!hasResult ? 'button-share--disabled' : ''}`}
                  onClick={(event) => {
                    if (!hasResult) {
                      event.preventDefault()
                    }
                  }}
                >
                  <Share2 size={16} />
                  X
                </a>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="button-share"
                >
                  <Copy size={16} />
                  {copied ? 'Link copiado' : 'Copiar link'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
