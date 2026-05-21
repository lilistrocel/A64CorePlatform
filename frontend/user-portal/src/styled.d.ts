/**
 * A20Core — styled-components theme augmentation (user-portal root).
 *
 * Delegates to the Slate theme definition. The old @a64core/shared Theme
 * is no longer the source of truth — AppTheme (Slate) is.
 */

import 'styled-components';
import type { AppTheme } from './theme/theme';

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}
