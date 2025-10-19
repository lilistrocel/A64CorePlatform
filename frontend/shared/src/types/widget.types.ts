export interface CCMWidget {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  dataSource: WidgetDataSource;
  refreshInterval?: number;
  type: WidgetType;
  size: WidgetSize;
  permissions?: string[];
  roles?: string[];
}

export type WidgetType = 'stat' | 'chart' | 'table' | 'gauge' | 'list' | 'custom';

export type WidgetSize = 'small' | 'medium' | 'large' | 'wide' | 'full-width';

export type WidgetDataSource =
  | ModuleDataSource
  | SystemDataSource
  | ExternalAPIDataSource;

export interface ModuleDataSource {
  type: 'module';
  moduleName: string;
  endpoint: string;
  params?: Record<string, any>;
}

export interface SystemDataSource {
  type: 'system';
  metric: string;
  params?: Record<string, any>;
}

export interface ExternalAPIDataSource {
  type: 'external_api';
  apiName: string;
  endpoint: string;
  credentials?: string;
  params?: Record<string, any>;
}

export interface WidgetProps {
  widget: CCMWidget;
  data: any;
  loading: boolean;
  error: Error | null;
  onRefresh?: () => void;
}

export interface StatWidgetData {
  value: string | number;
  label: string;
  trend?: number;
  trendLabel?: string;
  secondaryMetrics?: Array<{
    value: string | number;
    label: string;
  }>;
}

export interface ChartWidgetData {
  data: Array<Record<string, any>>;
  xKey: string;
  yKey: string;
  series?: Array<{
    name: string;
    dataKey: string;
    color: string;
  }>;
}
