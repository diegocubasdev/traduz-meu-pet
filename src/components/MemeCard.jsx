import { forwardRef } from 'react'
import { ImagePlus, Quote, Sparkles } from 'lucide-react'
import './MemeCard.css'

const WATERMARK = 'traduz-meu-bicho.vercel.app'

const MemeCard = forwardRef(function MemeCard(
  { imageSrc, phrase, isLoading, onSelectImage, isInteractive = false },
  ref,
) {
  return (
    <article
      ref={ref}
      className="meme-card"
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onSelectImage : undefined}
      onKeyDown={
        isInteractive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectImage?.()
              }
            }
          : undefined
      }
      aria-label={isInteractive ? 'Selecionar nova foto do pet' : undefined}
    >
      {imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt="Preview do pet enviado"
            className="meme-card__image"
          />
          <div className="meme-card__overlay" />
        </>
      ) : (
        <div className="meme-card__placeholder" />
      )}

      <div className="meme-card__content">
        <div className="meme-card__top">
          <div className="meme-card__badge">
            <Sparkles size={12} />
            TraduzMeuBicho
          </div>

          {isInteractive && (
            <div className="meme-card__tap-hint">
              <span className="meme-card__tap-pill">
                <ImagePlus size={14} />
                Toque no card para trocar foto
              </span>
            </div>
          )}
        </div>

        <div className="meme-card__stage">
          {imageSrc ? (
            <div className="meme-card__caption-wrap">
              <div className="meme-card__caption-card">
                <div className="meme-card__caption-icon">
                  <Quote size={18} />
                </div>
                <div className="meme-card__caption-copy">
                  <p className="meme-card__caption-label">Pensamento do pet</p>
                  <blockquote className="meme-card__quote">
                    {isLoading ? '...' : phrase || 'Seu pet ja esta preparando a humilhacao.'}
                  </blockquote>
                </div>
              </div>
            </div>
          ) : (
            <div className="meme-card__empty">
              <div className="meme-card__icon-wrap">
                <ImagePlus size={28} />
              </div>
              <p className="meme-card__eyebrow">
                Card pronto para viralizar
              </p>
              <p className="meme-card__empty-copy">
                A foto do seu pet aparece aqui com a frase mais debochada do dia.
              </p>
            </div>
          )}
        </div>

        <footer className="meme-card__footer">
          <div className="meme-card__divider" />
          <p className="meme-card__watermark">
            {WATERMARK}
          </p>
        </footer>
      </div>
    </article>
  )
})

export default MemeCard
