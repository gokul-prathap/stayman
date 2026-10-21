import {createContext,useContext,useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {THEME_STORAGE_KEY,resolveTheme,readThemePreference,applyTheme} from './theme';
const ThemeContext=createContext(null);
function preferenceFromBrowser(){try{return readThemePreference(window.localStorage);}catch{return null;}}
export function ThemeProvider({children}){
 const [preference,setPreference]=useState(preferenceFromBrowser);
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
 const theme=resolveTheme(preference,systemDark);
 useEffect(()=>{applyTheme(theme,document);},[theme]);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)'),changed=event=>setSystemDark(event.matches),sync=event=>{if(event.key===THEME_STORAGE_KEY||event.key===null)setPreference(preferenceFromBrowser());};media.addEventListener('change',changed);window.addEventListener('storage',sync);return()=>{media.removeEventListener('change',changed);window.removeEventListener('storage',sync);};},[]);
 function toggleTheme(){const next=theme==='dark'?'light':'dark';setPreference(next);applyTheme(next,document);try{window.localStorage.setItem(THEME_STORAGE_KEY,next);}catch{/* Theme still works when browser storage is unavailable. */}}
 return <ThemeContext.Provider value={{theme,toggleTheme}}>{children}<div className="standalone-theme-toggle"><ThemeToggle/></div></ThemeContext.Provider>;
}
export function ThemeToggle(){
 const {theme,toggleTheme}=useContext(ThemeContext),dark=theme==='dark',label=dark?'Switch to light theme':'Switch to dark theme';
 return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={label} title={label} aria-pressed={dark}>{dark?<Sun size={18} aria-hidden="true"/>:<Moon size={18} aria-hidden="true"/>}<span>{dark?'Light':'Dark'}</span></button>;
}
export function useTheme(){return useContext(ThemeContext);}
