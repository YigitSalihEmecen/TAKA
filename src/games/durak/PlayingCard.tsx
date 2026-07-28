import { motion, type HTMLMotionProps } from 'framer-motion';
import { SUIT_SYMBOL, labelOf, suitOf, type Card, type Suit } from '@shared/games/cards.ts';

interface Props extends Omit<HTMLMotionProps<'div'>, 'children'> {
  card: Card;
  trumpSuit?: Suit;
  /** Show the back instead of the face. */
  faceDown?: boolean;
  /** Playable right now — gets a quiet clay underline on hover. */
  live?: boolean;
  /** Not playable — drops back and desaturates. */
  muted?: boolean;
  selected?: boolean;
  /** A legal destination for the card currently held. */
  target?: boolean;
  size?: 'normal' | 'small';
}

/**
 * One card. Corner index, one large pip, and nothing else.
 *
 * Colour is a four-colour deck: the suit tints the entire card — face, pip,
 * rank and edge — via a `--suit` custom property set from `data-suit`. Trumps
 * additionally get a clay hairline and a dot.
 */
export function PlayingCard({
  card,
  trumpSuit,
  faceDown,
  live,
  muted,
  selected,
  target,
  size = 'normal',
  className = '',
  ...rest
}: Props) {
  const suit = suitOf(card);
  const trump = trumpSuit === suit;
  const classes = [
    'pcard',
    faceDown ? 'pcard--back' : 'pcard--face',
    trump && !faceDown ? 'is-trump' : '',
    live ? 'is-live' : '',
    muted ? 'is-muted' : '',
    selected ? 'is-selected' : '',
    target ? 'is-target' : '',
    size === 'small' ? 'pcard--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return (
      <motion.div className={classes} {...rest}>
        <span className="pcard__weave" aria-hidden />
        <span className="pcard__crest" aria-hidden />
      </motion.div>
    );
  }

  const sym = SUIT_SYMBOL[suit];
  const rank = labelOf(card);

  return (
    <motion.div className={classes} data-suit={suit} aria-label={`${rank} of ${suit}`} {...rest}>
      <span className="pcard__corner">
        <span className="pcard__rank">{rank}</span>
        <span className="pcard__suit">{sym}</span>
      </span>
      <span className="pcard__pip" aria-hidden>
        {sym}
      </span>
      {trump && <span className="pcard__trumpdot" aria-hidden />}
    </motion.div>
  );
}
