export const THEME_STORAGE_KEY='stayman.theme';
export const isTheme=value=>value==='light'||value==='dark';
export function resolveTheme(saved,prefersDark=false){return isTheme(saved)?saved:prefersDark?'dark':'light';}
export function readThemePreference(storage){try{const value=storage.getItem(THEME_STORAGE_KEY);return isTheme(value)?value:null;}catch{return null;}}
export function applyTheme(theme,document){
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0d1422':'#ffffff');
}
