import { useName } from '../lib/identity.ts';

/** Inline, underline-only name input. The only "form" in the whole app. */
export function NameField() {
  const [name, set] = useName();
  return (
    <label className="namefield">
      <span className="namefield__label">I am</span>
      <input
        className="namefield__input"
        value={name}
        onChange={(e) => set(e.target.value)}
        placeholder="your name"
        maxLength={24}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}
