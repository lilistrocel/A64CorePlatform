// Common components
export { Button, Card, Spinner, Input, Breadcrumb, PageHeader } from './common';
export type { ButtonProps, CardProps, SpinnerProps, InputProps, BreadcrumbItem, PageHeaderProps, PageHeaderStat } from './common';

// Widget components
export { StatWidget } from './widgets';
export { ChartWidget } from './ChartWidget';
export type { ChartWidgetProps } from './ChartWidget';

// Night Observatory background sky layer (spec §7) — mount once at the app shell
export { Sky } from './Sky';
