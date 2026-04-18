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

async function readApiPayload(response) {
  const contentType = response.headers.get('content-type') || ''
  const rawBody = await response.text()

  if (!rawBody) {
    throw new Error(
      'A API respondeu sem conteudo. Em ambiente local, rode com `vercel dev` para servir /api.',
    )
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      'A rota /api/gerar nao retornou JSON. Em ambiente local, use `vercel dev` em vez de apenas `vite`.',
    )
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error('A resposta da API veio invalida. Verifique o terminal do backend.')
  }
}

function App() {
  const [status, setStatus] = useState('idle')
  const [previewUrl, setPreviewUrl] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
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

    setError('')
    setPhrase('')

    const localPreview = await fileToDataUrl(file)

    setPreviewUrl(localPreview)

    try {
      setStatus('loading')

      const compressedFile = await imageCompression(file, compressionOptions)
      const imageBase64 = await fileToDataUrl(compressedFile)
      const response = await fetch('/api/gerar', {
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
        throw new Error(payload.error || 'Nao foi possivel traduzir seu bicho agora.')
      }

      setPhrase(payload.phrase)
      setStatus('success')
    } catch (requestError) {
      setError(requestError.message || 'Aconteceu um erro ao gerar a frase.')
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
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const openFilePicker = () => {
    if (!isBusy) {
      fileInputRef.current?.click()
    }
  }
  const statusLabel = hasResult
    ? 'Card pronto para postar'
    : isBusy
      ? 'Traduzindo seu pet'
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

            <div className="app-actions">
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
                disabled={isBusy}
                className="button-secondary"
              >
                <Upload size={17} />
                Nova tentativa
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
