/**
 * The contract every game in this app implements.
 *
 * A game is a pure state machine. The server owns the authoritative state and
 * never ships it to clients directly — it ships a per-seat *view*, which is the
 * only thing the UI is allowed to know. That is what keeps hidden information
 * (your opponent's hand, the order of the deck) actually hidden.
 *
 * To add a new game you write one file implementing `GameDefinition`, one React
 * component that renders its view, and register both. Nothing else in the app
 * needs to change.
 */

/** Which of the two chairs a player is sitting in. */
export type Seat = 0 | 1;

export const otherSeat = (s: Seat): Seat => (s === 0 ? 1 : 0);

/** Catalogue entry — everything the lobby needs to show a game without loading it. */
export interface GameMeta {
  id: string;
  title: string;
  /** Origin / flavour line, e.g. "Russia · 2 players". */
  subtitle: string;
  /** A paragraph for the game's card in the lobby. */
  blurb: string;
  /** Single glyph used as the game's mark. */
  glyph: string;
  /** Rough length of one game, human readable. */
  duration: string;
  /** false = greyed out in the lobby as "coming soon". */
  available: boolean;
  /** Whether this game ships a bot you can play against alone. */
  hasBot: boolean;
}

/** Result of a finished game. */
export interface GameOutcome {
  /** Seat that won, or null for a draw. */
  winner: Seat | null;
  /** Short line shown on the end screen, e.g. "Sofia is the fool". */
  headline: string;
  /** Optional supporting line. */
  detail?: string;
}

/** What `reduce` gives back: either the next state, or why the move was refused. */
export type ReduceResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameDefinition<S, A, V> {
  meta: GameMeta;

  /** Build a fresh game. `seed` makes shuffles reproducible for replay/debug. */
  create(seed: number): S;

  /** Apply a seat's action. Must be pure, and must reject anything illegal. */
  reduce(state: S, seat: Seat, action: A): ReduceResult<S>;

  /** Redact the state down to what `seat` is allowed to see. */
  view(state: S, seat: Seat): V;

  /** Has the game ended? */
  outcome(state: S): GameOutcome | null;

  /**
   * Some games need to advance without anyone acting (timers, forced draws).
   * Return an action the given seat should be made to take, or null.
   */
  autoplay?(state: S, seat: Seat): A | null;

  /** Optional bot, driven purely off the seat's own view — it cannot cheat. */
  bot?(view: V): A | null;

  /** How long the bot should appear to "think", in ms. */
  botDelay?: number;
}

/** Convenience alias for a definition whose generics we don't care about. */
export type AnyGameDefinition = GameDefinition<any, any, any>;
