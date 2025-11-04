import 'styled-components';
import { Theme } from '@a64core/shared';

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
