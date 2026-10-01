---
name: manual-block-table
description: Nolënor manual section - the Table block - creating a table, column types, adding and editing rows and columns, sorting, filtering, searching, row height, summary footer, opening a row as a record, CSV import and export, saving. Load through nolenor-user-manual only.
hidden: true
---

# Table block

## Overview
A table has **typed columns** and rows, like a small database. On the canvas it is a **preview**; you work in its **window** (double-click, **Open** in the toolbar, or Enter). **Appearance**: **Preview** (the grid) or **Title** (just its name as a band).

## Create one
- Add a block → **Table**, press **A**, or drop a **.csv** file on the canvas (columns and rows are created from the file).
- An empty table says "Double click to edit". Ask Nolë to build one: it can set the columns and fill rows.

## Column types
**Text**, **Rich text**, **Number**, **Checkbox**, **Select** (coloured options), **Date**, **Link** (URL with optional title), **Node** (a reference to another block of this canvas).

## In the window
Header: a title field ("Untitled"), **Import** (CSV), **Export** (CSV), plus the usual window buttons (**Save**, Panel, Minimize…, see `manual-windows`). Above the grid: search box, **Filter**, **Row height**, and a count ("12 rows" or "3 of 12").

- **Add a column**: the **+ Add a column** button at the end of the header row, then pick a type.
- **Column menu** (click the column header): rename (field "Column name"), **Column type** (changing it converts the values when possible), **Sort A → Z**, **Sort Z → A**, **Clear sort**, **Edit options…** (Select columns: add, rename, colour, reorder options; **Allow multiple values**), **Delete column**. Drag the border of a header to change a column's width; columns also have a "Drag to reorder" grip.
- **Add a row**: click in the empty ghost row at the bottom of the grid, in the column you want to start in, and type. Creating a row resets any active sort, search or filter so the new row is visible.
- **Edit a cell**: click it. Text cells: Enter saves, Shift+Enter adds a new line. Select cells: search and pick options ("No options yet. Configure them from the column menu."). Link cells: URL and optional title. Node cells: **Add a node…** then search ("Search nodes…"); **Remove reference** clears it. Checkbox: click. Date: pick a day.
- **Rows**: the grip at the left of a row ("Drag to reorder") reorders; the trash button ("Delete row") removes; the **Open row** button opens the row as a **record** ("Every field of this row, at full width."), with previous / next row arrows and **Delete row**.
- **Search** ("Search…") narrows the visible rows while you type; the ✕ clears it.
- **Filter**: **Add filter**, choose a column, an operator (the list depends on the column type: contains, is, is empty, is checked, is any of…) and a value. Several filters combine with **And** / **Or**. **Clear all** removes them.
- **Row height**: **Short** (one line), **Medium**, **Tall**, **Full** (everything shown).
- **Summary footer** ("Calculate"): under each column choose **None**, Count all, Empty, Filled, Unique, percentages, and for Number columns Sum, Average, Median, Min, Max; for Checkbox columns Checked / Unchecked / Percent checked.

Sort, filters, row height and column widths are stored in the table once you save, so the canvas preview shows the same view ("3 of 12" appears in the block when filters hide rows) — and collaborators see it too.

## Save
Edits in the window are a **draft until you save**: **Ctrl/⌘+S** or the Save button. Closing with unsaved changes asks "Close without saving?". Nolë only sees saved content.

## Import / export CSV
- **Import** (window header): drop a CSV or click to browse. A preview lets you map each **CSV column** to a **Target** column (or **Skip**) with a **Type**; then choose **Append to existing rows** or **Replace the table**.
- **Export** downloads the table as a CSV file.
- For a whole canvas backup use Settings → Export my data (`manual-account-settings-and-data`).

## With Nolë
Nolë can create the table, define its columns, add, update and delete rows. App blocks connected to a table can chart or calculate on its data (`manual-blocks-link-and-app`). If you just changed something in an open window, save first so Nolë sees it.
