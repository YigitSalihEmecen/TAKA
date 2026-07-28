import { motion } from 'framer-motion';
import { ArrowLeft, Moon, Sun } from './icons.tsx';
import { hrefFor, navigate, type Route } from '../lib/router.ts';
import type { Theme } from '../lib/theme.ts';

interface Props {
  back?: Route;
  crumb?: string;
  theme: Theme;
  onToggleTheme: () => void;
  right?: React.ReactNode;
}

export function TopBar({ back, crumb, theme, onToggleTheme, right }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        {back ? (
          <a
            className="iconbtn"
            href={hrefFor(back)}
            aria-label="Back"
            onClick={(e) => {
              e.preventDefault();
              navigate(back);
            }}
          >
            <ArrowLeft />
          </a>
        ) : (
          <span className="brandmark mark" aria-hidden />
        )}
        <a className="brand" href="#/" onClick={() => navigate({ name: 'home' })}>
          TAKA
        </a>
        {crumb && (
          <>
            <span className="crumb-sep" aria-hidden>
              /
            </span>
            <span className="crumb">{crumb}</span>
          </>
        )}
      </div>

      <div className="topbar__right">
        {right}
        <button className="iconbtn" onClick={onToggleTheme} aria-label="Toggle theme">
          <motion.span
            key={theme}
            initial={{ rotate: -50, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'grid', placeItems: 'center' }}
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </motion.span>
        </button>
      </div>
    </header>
  );
}
