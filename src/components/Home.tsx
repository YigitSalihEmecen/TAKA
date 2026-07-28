import { motion } from 'framer-motion';
import { GAME_LIST, UPCOMING } from '@shared/games/registry.ts';
import type { GameMeta } from '@shared/games/types.ts';
import { navigate } from '../lib/router.ts';
import { MAKER, FOR } from '../lib/people.ts';
import { NameField } from './NameField.tsx';

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.65, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

function ShelfCard({ meta, index }: { meta: GameMeta; index: number }) {
  const disabled = !meta.available;
  return (
    <motion.button
      className={`shelf-card${disabled ? ' is-soon' : ''}`}
      custom={index}
      variants={rise}
      initial="hidden"
      animate="show"
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { y: -1, scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      disabled={disabled}
      onClick={() => navigate({ name: 'setup', gameId: meta.id })}
    >
      <span className="shelf-card__wick" aria-hidden />
      <span className="shelf-card__glyph" aria-hidden>
        {meta.glyph}
      </span>
      <span className="shelf-card__body">
        <span className="eyebrow">{meta.subtitle}</span>
        <span className="shelf-card__title display">{meta.title}</span>
        <span className="shelf-card__blurb">{meta.blurb}</span>
      </span>
      <span className="shelf-card__foot">
        <span className="faint">{meta.duration}</span>
        <span className="faint">·</span>
        <span className="faint">{meta.hasBot ? 'has a bot' : 'the two of us'}</span>
        <span className="shelf-card__cta">{disabled ? 'Not built yet' : 'Open table →'}</span>
      </span>
    </motion.button>
  );
}

export function Home() {
  return (
    <div className="page home">
      <section className="hero">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          made by {MAKER.toLocaleLowerCase('tr')} · for {FOR.toLowerCase()}
        </motion.p>

        <motion.h1
          className="hero__title display"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          TAKA
        </motion.h1>

        <motion.p
          className="hero__lede"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
        >
          A <em className="serif-italic">taka</em> is one of those small wooden boats the
          fishermen keep on the eastern Black Sea. This one carries card games instead —
          for the evenings we spend in two different cities. Open a table, send the four
          letters, and we are sitting across from each other again.
        </motion.p>

        <motion.div
          className="hero__suits"
          aria-hidden
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }}
        >
          {([['S', '♠'], ['H', '♥'], ['D', '♦'], ['C', '♣']] as const).map(([suit, s]) => (
            <motion.span
              key={s}
              className="hero__suit"
              data-suit={suit}
              variants={{
                hidden: { opacity: 0, y: 10, rotate: -8 },
                show: { opacity: 1, y: 0, rotate: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
              }}
            >
              {s}
            </motion.span>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45 }}
        >
          <NameField />
        </motion.div>
      </section>

      <section className="shelf" aria-label="Games">
        <div className="shelf__head">
          <h2 className="eyebrow">On board</h2>
          <hr className="rule" />
        </div>
        <div className="shelf__grid">
          {GAME_LIST.map((g, i) => (
            <ShelfCard key={g.meta.id} meta={g.meta} index={i} />
          ))}
          {UPCOMING.map((m, i) => (
            <ShelfCard key={m.id} meta={m} index={GAME_LIST.length + i} />
          ))}
        </div>
      </section>

      <footer className="page__foot">
        <span className="faint">
          Made by {MAKER}, for {FOR}, with love <span className="heart">♥</span>
        </span>
      </footer>
    </div>
  );
}
