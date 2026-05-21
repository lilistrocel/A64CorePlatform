/**
 * A20Core — styled-components theme augmentation.
 *
 * Makes `theme` inside styled-components fully typed as the Slate AppTheme.
 * This file is auto-included because tsconfig.app.json has `"include": ["src"]`.
 */

import 'styled-components';
import type { AppTheme } from './theme';

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}
