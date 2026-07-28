/**
 * This app has exactly two people in it. Naming them lets the copy speak to
 * whoever is holding the phone — "send this to Sofia" if Yiğit is looking,
 * "send this to Yiğit" if Sofia is.
 */

export const MAKER = 'Yiğit';
export const FOR = 'Sofia';

const norm = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/i̇/g, 'i');

/**
 * Who is on the other side of the table, guessed from the name you set.
 * Falls back to something affectionate when it is neither of us.
 */
export function partnerOf(name: string): string {
  const n = norm(name);
  if (!n) return 'the other one';
  if (norm(FOR).startsWith(n) || n.startsWith(norm(FOR))) return MAKER;
  if (norm(MAKER).startsWith(n) || n.startsWith(norm(MAKER))) return FOR;
  return 'the other one';
}
