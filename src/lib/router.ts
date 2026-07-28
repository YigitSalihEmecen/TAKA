/**
 * A hash router in thirty lines. No dependency, and `#/t/ABCD` is a link you
 * can text to someone — which is the whole point of this app.
 */

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'setup'; gameId: string }
  | { name: 'solo'; gameId: string }
  | { name: 'table'; code: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'g' && parts[1]) {
    return parts[2] === 'solo' ? { name: 'solo', gameId: parts[1] } : { name: 'setup', gameId: parts[1] };
  }
  if (parts[0] === 't' && parts[1]) return { name: 'table', code: parts[1].toUpperCase() };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'setup':
      return `#/g/${route.gameId}`;
    case 'solo':
      return `#/g/${route.gameId}/solo`;
    case 'table':
      return `#/t/${route.code}`;
  }
}

export function navigate(route: Route) {
  const href = hrefFor(route);
  if (location.hash !== href) location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
