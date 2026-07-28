/**
 * Module augmentation so styled-components' `theme` prop is fully typed
 * with the A20Core Slate theme. Drop this file into your project (it's
 * picked up automatically as a TS declaration file).
 *
 * After this, every styled-component gets:
 *   ${({ theme }) => theme.colors.text.primary}  // autocompletes
 */

import 'styled-components'
import type { AppTheme } from './theme'

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends AppTheme {}
}
