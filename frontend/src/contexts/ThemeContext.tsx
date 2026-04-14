import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme') as Theme
        if (saved) return saved
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    })

    useEffect(() => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(theme)
        localStorage.setItem('theme', theme)

        if (theme === 'dark') {
            root.style.setProperty('--color-background', '#050505')
            root.style.setProperty('--color-text', '#ededed')
            root.style.setProperty('--color-muted', '#808080')
            root.style.setProperty('--color-border', '#d1d5db')
            root.style.setProperty('--color-primary', '#58a6ff')
        } else {
            root.style.removeProperty('--color-background')
            root.style.removeProperty('--color-text')
            root.style.removeProperty('--color-muted')
            root.style.removeProperty('--color-border')
            root.style.removeProperty('--color-primary')
        }
    }, [theme])

    const toggleTheme = useCallback(() => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
    }, [])

    const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
