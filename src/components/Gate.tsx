import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Shown only when the server was started with TAKA_PASSPHRASE and this
 * device does not have it yet. Asked once, remembered in localStorage — she
 * types it the first evening and never sees this screen again.
 */
export function Gate({ onUnlock }: { onUnlock: (pass: string) => void }) {
  const [pass, setPass] = useState('');

  return (
    <motion.div
      className="gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.form
        className="gate__panel"
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (pass.trim()) onUnlock(pass);
        }}
      >
        <span className="gate__mark mark" aria-hidden />
        <p className="eyebrow">just the two of us</p>
        <h1 className="gate__title display">Who is it?</h1>
        <p className="gate__lede muted">
          The word we agreed on, once. This phone will remember it.
        </p>
        <input
          className="gate__input"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="passphrase"
          autoComplete="current-password"
          autoFocus
        />
        <button className="btn btn--solid" type="submit" disabled={!pass.trim()}>
          Come in
        </button>
      </motion.form>
    </motion.div>
  );
}
