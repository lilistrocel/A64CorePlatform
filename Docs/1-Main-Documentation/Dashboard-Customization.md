# Dashboard Customization Guide

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## Overview

The CCM Dashboard is fully customizable, allowing users to create personalized monitoring views by adding, removing, arranging, and configuring widgets. This guide explains how to customize your dashboard to suit your workflow.

---

## Dashboard Features

### 1. Drag-and-Drop Layout
- Move widgets anywhere on the grid
- Resize widgets
- Auto-snap to grid
- Responsive breakpoints

### 2. Widget Marketplace
- Browse available widgets
- Search and filter by category/tags
- Add widgets with one click
- Preview widget before adding

### 3. Multiple Layouts
- Create multiple dashboard layouts
- Switch between layouts
- Set default layout
- Share layouts with team

### 4. Widget Configuration
- Customize refresh intervals
- Configure widget-specific settings
- Set alert thresholds
- Choose visualization options

---

## Adding Widgets to Dashboard

### Method 1: Widget Marketplace

1. Click **"Add Widget"** button (+ icon)
2. Browse or search for widgets
3. Click widget to preview
4. Click **"Add to Dashboard"**
5. Widget appears on dashboard

### Method 2: Module Widgets

When you install a new module, its widgets automatically appear in the marketplace.

**Example:** Installing the Sales module adds:
- Sales Summary widget
- Revenue Chart widget
- Top Products widget
- Sales Pipeline widget

---

## Customizing Widget Layout

### Moving Widgets

**Desktop:**
1. Hover over widget header
2. Click and hold
3. Drag to new position
4. Release to drop

**Mobile:**
- Long-press widget header
- Drag to new position

### Resizing Widgets

**Desktop:**
1. Hover over widget corner
2. Resize handle appears
3. Drag to resize

**Available Sizes:**
- Small: 1x1 grid units
- Medium: 2x1 grid units
- Large: 2x2 grid units
- Wide: 4x1 grid units
- Full-width: Entire row

### Removing Widgets

1. Click widget menu (⋮)
2. Select **"Remove from Dashboard"**
3. Confirm removal

---

## Widget Configuration

### Configuring Refresh Interval

1. Click widget menu (⋮)
2. Select **"Settings"**
3. Adjust **"Refresh Interval"**
   - Options: 10s, 30s, 1m, 5m, 15m, 30m, 1h
4. Click **"Save"**

### Configuring Widget-Specific Settings

Different widget types have different configuration options:

**Stat Widget:**
- Format (number, currency, percentage)
- Trend comparison period
- Secondary metrics

**Chart Widget:**
- Chart type (line, bar, pie, area)
- Time range (24h, 7d, 30d, 90d, 1y)
- Data series selection

**Table Widget:**
- Columns to display
- Sort order
- Page size
- Filters

**Gauge Widget:**
- Thresholds
- Color scheme
- Display labels

---

## Managing Dashboard Layouts

### Creating a New Layout

1. Click **"Layout"** dropdown
2. Select **"Create New Layout"**
3. Enter layout name
4. Add widgets to new layout

### Switching Layouts

1. Click **"Layout"** dropdown
2. Select desired layout
3. Dashboard updates instantly

### Setting Default Layout

1. Open layout you want as default
2. Click layout menu (⋮)
3. Select **"Set as Default"**

### Duplicating a Layout

1. Click layout menu (⋮)
2. Select **"Duplicate Layout"**
3. Enter new name
4. Modify as needed

### Deleting a Layout

1. Click layout menu (⋮)
2. Select **"Delete Layout"**
3. Confirm deletion
   - ⚠️ Cannot delete default layout

---

## Role-Based Dashboard Presets

The platform provides pre-configured dashboards for different roles:

### Admin Dashboard
- System Health
- User Activity
- Module Status
- API Performance
- Database Stats
- Error Logs

### Sales Manager Dashboard
- Sales Summary
- Revenue Chart
- Sales Pipeline
- Top Products
- Customer Acquisition

### Inventory Manager Dashboard
- Stock Levels
- Low Stock Alerts
- Warehouse Status
- Inventory Turnover
- Reorder Recommendations

### Finance Manager Dashboard
- Account Balance
- Receivables/Payables
- Cash Flow
- P&L Summary
- Payment Activity

**To use a preset:**
1. Click **"Layouts"** dropdown
2. Select **"Load Preset"**
3. Choose role-based preset
4. Customize as needed

---

## Sharing Dashboards

### Exporting a Layout

1. Click layout menu (⋮)
2. Select **"Export Layout"**
3. Download JSON file

### Importing a Layout

1. Click **"Layout"** dropdown
2. Select **"Import Layout"**
3. Upload JSON file
4. Layout is added to your layouts

### Sharing with Team (Future)

*Coming in v2.0:*
- Share layouts with specific users
- Organization-wide default layouts
- Template marketplace

---

## Dashboard Settings

### Global Dashboard Settings

Access: **Profile → Dashboard Settings**

**Options:**
- Default refresh interval for new widgets
- Grid size (compact, normal, spacious)
- Theme (light, dark, auto)
- Animation speed
- Auto-save interval

---

## Keyboard Shortcuts

### Navigation
- `Ctrl/Cmd + K` - Open widget marketplace
- `Ctrl/Cmd + L` - Switch layout
- `Ctrl/Cmd + S` - Save current layout
- `Escape` - Close modal/panel

### Widget Actions
- `R` - Refresh selected widget
- `Delete` - Remove selected widget
- `E` - Edit widget settings

---

## Mobile Dashboard

The CCM Dashboard is fully responsive for mobile devices:

**Mobile Features:**
- Single-column layout
- Collapsible widgets
- Swipe to navigate
- Pull-to-refresh
- Touch-friendly controls

**Mobile-Specific Tips:**
- Use smaller widgets on mobile
- Prioritize most important widgets at top
- Use list/stat widgets (charts may be small)

---

## Best Practices

### Dashboard Organization

**✅ DO:**
- Group related widgets together
- Put most important widgets at top
- Use consistent sizing
- Label widgets clearly
- Create focused layouts (don't overcrowd)

**❌ DON'T:**
- Add too many widgets (max 20 recommended)
- Use tiny widgets for charts
- Mix unrelated metrics
- Ignore mobile view

### Widget Selection

**✅ DO:**
- Choose widgets relevant to your role
- Use real-time widgets for critical metrics
- Configure appropriate refresh intervals
- Set up alerts for important thresholds

**❌ DON'T:**
- Add widgets you don't need
- Use very short refresh intervals unnecessarily
- Ignore widget configuration options

### Performance Tips

- Limit dashboard to 20 widgets maximum
- Use longer refresh intervals when possible (reduces server load)
- Remove widgets you don't use
- Use caching when available

---

## Troubleshooting

### Widget Not Loading

**Possible Causes:**
- Data source unavailable
- Permission denied
- Network issue

**Solution:**
1. Check widget error message
2. Click refresh icon
3. Verify you have required permissions
4. Check module is running (for module widgets)

### Layout Not Saving

**Possible Causes:**
- Browser cache issue
- Network connectivity
- Session expired

**Solution:**
1. Refresh page
2. Re-login if necessary
3. Check browser console for errors

### Widgets Overlapping

**Possible Causes:**
- Grid conflict
- Browser zoom level

**Solution:**
1. Reset zoom to 100%
2. Click "Reset Layout" button
3. Manually adjust widget positions

---

## Examples

### Example 1: Executive Dashboard

**Purpose:** High-level business overview

**Widgets:**
- Sales Summary (stat, medium)
- Revenue Trend (chart, large)
- Active Users (stat, small)
- Top Products (list, medium)
- Customer Acquisition (chart, medium)
- System Health (gauge, small)

**Layout:**
```
┌─────────┬─────────────┬─────────┐
│ Sales   │  Revenue    │ Active  │
│ Summary │  Chart      │ Users   │
├─────────┼─────────────┼─────────┤
│ Top     │ Customer    │ System  │
│ Products│ Acquisition │ Health  │
└─────────┴─────────────┴─────────┘
```

---

### Example 2: Operations Dashboard

**Purpose:** Real-time operational monitoring

**Widgets:**
- Order Queue (list, wide)
- Inventory Alerts (list, medium)
- Shipping Status (table, wide)
- Warehouse Capacity (gauge, small)

**Refresh Intervals:**
- Order Queue: 30 seconds
- Inventory Alerts: 2 minutes
- Shipping Status: 1 minute
- Warehouse Capacity: 5 minutes

---

### Example 3: Analytics Dashboard

**Purpose:** Data analysis and trends

**Widgets:**
- Revenue vs Costs (chart, large)
- Sales by Category (pie chart, medium)
- Customer Growth (line chart, large)
- Conversion Funnel (custom, medium)

---

## FAQs

**Q: How many widgets can I add?**
A: No hard limit, but we recommend max 20 for performance.

**Q: Can I have different dashboards for different devices?**
A: Layouts are synced across devices, but mobile automatically uses single-column layout.

**Q: Can I revert to previous layout?**
A: Not yet. Save important layouts by exporting them first.

**Q: How do I get more widgets?**
A: Install new modules or configure external API integrations.

**Q: Can I create custom widgets?**
A: Yes, if you develop modules. See [Widget Development Guide](./Widget-Development-Guide.md).

---

## References

- [CCM Architecture](./CCM-Architecture.md)
- [Widget Development Guide](./Widget-Development-Guide.md)
- [External API Integration](./External-API-Integration.md)

---

**End of Dashboard Customization Guide**
