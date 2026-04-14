import { createContext, useContext, useEffect, useState, useMemo } from 'react'

type Theme = 'light'

interface ThemeContextType {
    theme: Theme
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme] = useState<Theme>('light')

    useEffect(() => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add('light')
        localStorage.setItem('theme', 'light')
    }, [theme])

    const value = useMemo(() => ({ theme }), [theme])

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
