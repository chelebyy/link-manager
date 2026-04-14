import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex items-center justify-center w-11 h-11 rounded-sm border border-[#d1d5db] bg-transparent text-gray-700 hover:bg-gray-100 transition-colors duration-200 dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-600"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  );
}
