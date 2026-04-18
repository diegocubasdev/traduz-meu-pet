import { forwardRef } from 'react'
import { ImagePlus, Sparkles } from 'lucide-react'
import './MemeCard.css'

const WATERMARK = 'https://www.google.com/search?q=TraduzMeuBicho.com'

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
        <div className="meme-card__badge">
          <Sparkles size={12} />
          TraduzMeuBicho
        </div>

        {isInteractive && (
          <div className="meme-card__tap-hint">
            <span className="meme-card__tap-pill">
              <ImagePlus size={14} />
              Toque no card para trocar a foto
            </span>
          </div>
        )}

        <div className="meme-card__center">
          {imageSrc ? (
            <blockquote className="meme-card__quote">
              {isLoading ? '...' : phrase || 'Seu pet ja esta preparando a humilhacao.'}
            </blockquote>
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
