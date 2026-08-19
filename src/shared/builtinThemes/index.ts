import type { BitigTheme } from '../themeTypes';
import { bitigDark } from './bitigDark';
import { bitigLight } from './bitigLight';
import { dracula } from './dracula';
import { nord } from './nord';

/** Uygulamayla birlikte gelen, dosya sistemine bagli olmayan temalar.
 *  main ve renderer'dan Node bagimliligi olmadan dogrudan import edilebilir
 *  - renderer, IPC yaniti gelmeden once bunu senkron bir varsayilan olarak
 *  kullanabilir (bkz. appearance.ts). */
export const BUILTIN_THEMES: BitigTheme[] = [bitigDark, bitigLight, dracula, nord];

export { bitigDark, bitigLight, dracula, nord };
