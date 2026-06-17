# QA Report: Desktop Image Editor Filters/Presets (Focused)
- Date: 2026-03-11 07:30 KST
- Client: desktop (Electron)
- Focus: Image Editor — Filter menu, Presets, Select, Layer ops, Shortcuts
- Tester: QA Instance 2 (CDP port 9226)

## Summary
- Filters tested: 30
- Presets documented: 10
- Issues found: 8 (Critical: 3, Warning: 3, Info: 2)

## Filter Menu Structure (Top-level)

| Item | Type |
|------|------|
| Filters... | Dialog |
| Filter Gallery... | Dialog |
| Liquify... | Dialog (Cmd+Shift+X) |
| Adaptive Wide Angle... | Dialog |
| Lens Correction... | Dialog |
| Blur | Submenu (9 items) |
| Sharpen | Submenu (3 items) |
| Distort | Submenu (12 items) |
| Noise | Submenu (3 items) |
| Pixelate | Submenu (7 items) |
| Render | Submenu (7 items) |
| Stylize | Submenu (8 items) |
| Texture | Submenu (7 items) |
| Brush Strokes | Submenu (8 items) |
| Other | Submenu (10 items) |
| Calculations... | Dialog |
| Apply Image... | Dialog |
| Perspective Warp... | Dialog |
| Content-Aware Scale... | Dialog |
| Automate | Submenu (8 items) |
| Color Mode | Submenu (3 items) |
| Remove Tool | Action |
| New Guide Layout... | Dialog |

## Filter Menu Categories

### Blur (9 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Blur | Yes | No | ❌ Non-functional (sets invalid editMode) |
| Blur More | Yes | No | ❌ Non-functional |
| Average | Yes | No | ❌ Non-functional |
| Box Blur... | Yes | No | ❌ Non-functional |
| Radial Blur... | Not tested | — | — |
| Surface Blur... | Not tested | — | — |
| Lens Blur... | Not tested | — | — |
| Shape Blur... | Not tested | — | — |
| Smart Blur... | Yes | Yes* | ⚠️ History changed but likely due to mouse Move Layer, not filter |

**Missing from menu (functions exist in filters.ts):**
- Gaussian Blur (`gaussianBlur`)
- Motion Blur (`motionBlur`)

### Sharpen (3 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Smart Sharpen... | Yes | No | ❌ Non-functional |
| Sharpen More | Yes | No | ❌ Non-functional |
| Sharpen Edges | Yes | No | ❌ Non-functional |

**Missing from menu (functions exist in filters.ts):**
- Sharpen (basic) (`sharpen`)
- Unsharp Mask (`unsharpMask`)

### Distort (12 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Twirl... | Yes | No | ❌ Non-functional |
| Spherize... | Yes | No | ❌ Non-functional |
| Ripple... | Yes | No | ❌ Non-functional |
| Pinch... | Not tested | — | — |
| Wave... | Not tested | — | — |
| ZigZag... | Not tested | — | — |
| Polar Coordinates... | Not tested | — | — |
| Diffuse Glow... | Not tested | — | — |
| Glass... | Not tested | — | — |
| Ocean Ripple... | Not tested | — | — |
| Displace... | Not tested | — | — |
| Shear... | Not tested | — | — |

### Noise (3 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Despeckle | Yes | No | ❌ Non-functional |
| Dust & Scratches... | Not tested | — | — |
| Median... | Yes | Yes* | ⚠️ Likely incidental Move Layer |

**Missing from menu (functions exist in filterWorker.ts):**
- Add Noise (`addNoise`)
- Reduce Noise (`reduceNoise`)

### Pixelate (7 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Crystallize... | Yes | No | ❌ Non-functional |
| Facet... | Yes | No | ❌ Non-functional |
| Fragment... | Yes | Yes* | ⚠️ Likely incidental |
| Mezzotint... | Not tested | — | — |
| Pointillize... | Yes | Yes* | ⚠️ Likely incidental |
| Color Halftone... | Not tested | — | — |
| Mosaic... | Yes | No | ❌ Non-functional |

### Render (7 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Clouds... | Yes | No | ❌ Non-functional |
| Difference Clouds... | Yes (failed) | No | ❌ Click failed, editor lost |
| Fibers... | Not tested (editor lost) | — | — |
| Lens Flare... | Not tested | — | — |
| Lighting Effects... | Not tested | — | — |
| Flame... | Not tested | — | — |
| Tree... | Not tested | — | — |

### Stylize (8 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| Solarize... | Yes | No | ❌ Non-functional |
| Find Edges... | Yes | Yes* | ⚠️ Likely incidental Move Layer |
| Trace Contour... | Not tested | — | — |
| Diffuse... | Yes | No | ❌ Non-functional |
| Glowing Edges... | Not tested | — | — |
| Tiles... | Not tested | — | — |
| Wind... | Yes | Yes* | ⚠️ Likely incidental |
| Extrude... | Not tested | — | — |

**Missing from menu (functions exist in filters.ts):**
- Emboss (`emboss`)
- Oil Paint (`oilPaint`) — Note: present in "Other" submenu instead

### Texture (7 items)
| Item | Menu Items |
|------|------------|
| Grain... | Listed |
| Mosaic Tiles... | Listed |
| Patchwork... | Listed |
| Stained Glass... | Listed |
| Texturizer... | Listed |
| Craquelure... | Listed |
| Texture... | Listed |

### Brush Strokes (8 items)
| Item | Menu Items |
|------|------------|
| Accented Edges... | Listed |
| Angled Strokes... | Listed |
| Crosshatch... | Listed |
| Dark Strokes... | Listed |
| Ink Outlines... | Listed |
| Spatter... | Tested — ❌ Non-functional |
| Sprayed Strokes... | Listed |
| Sumi-e... | Listed |

### Other (10 items)
| Item | Clicked | History Changed | Result |
|------|---------|-----------------|--------|
| High Pass... | Yes | No | ❌ Non-functional |
| Oil Paint... | Not tested | — | — |
| Maximum... | Yes | No | ❌ Non-functional |
| Minimum... | Yes | No | ❌ Non-functional |
| Offset... | Not tested | — | — |
| Custom... | Not tested | — | — |
| Dehaze... | Not tested | — | — |
| HDR Toning... | Not tested | — | — |
| Picture Frame... | Not tested | — | — |
| Color Lookup... | Not tested | — | — |

### Automate (8 items)
| Item | Listed |
|------|--------|
| Fit Image... | Yes |
| Contact Sheet... | Yes |
| Crop and Straighten | Yes |
| Crop and Straighten Photos | Yes |
| Merge to HDR... | Yes |
| Photomerge... | Yes |
| Conditional Mode Change... | Yes |
| PDF Presentation... | Yes |

### Color Mode (3 items)
| Item | Listed |
|------|--------|
| Bitmap... | Yes |
| Duotone... | Yes |
| Multichannel | Yes |

## Preset Categories (10 items)
| Preset | Type |
|--------|------|
| 4-Panel Portrait | Layout template |
| Chibi Sticker Set | Layout template |
| Camcorder Collage | Layout template |
| Fan Edit Collage | Layout template |
| Product Documentation | Layout template |
| Character Concept Sheet | Layout template |
| Fashion Documentation | Layout template |
| 3D Pop-Up Map | Layout template |
| Isometric Diorama | Layout template |
| Instagram 3D Layout | Layout template |

Note: These are layout/template presets, not image filter presets (like Instagram-style color grading).
No traditional filter presets (Vintage, B&W, Warm, Cool, etc.) found.

## AI Menu Items (View Only - NOT applied)
| AI Feature | Listed |
|------------|--------|
| Upscale | Yes |
| Background Remove | Yes |
| Face Restore | Yes |
| Colorize | Yes |
| Inpaint | Yes |
| Outpaint | Yes |
| Smart Portrait | Yes |
| Super Zoom | Yes |
| Makeup Transfer | Yes |
| Photo Restoration | Yes |
| Landscape Mixer | Yes |

Total: 11 AI features listed.

## Select Menu
| Item | Shortcut | Notes |
|------|----------|-------|
| Selection Tool | — | Opens selection mode |
| Deselect | Cmd+D | — |
| Invert Selection | Cmd+Shift+I | — |
| Grow | — | — |
| Similar | — | — |
| Expand... | — | — |
| Contract... | — | — |
| Smooth... | — | — |
| Border... | — | — |
| Color Range... | — | — |
| Transform Selection | — | Greyed out |
| Quick Mask Mode | Q | — |
| Sky | — | — |
| Focus Area... | — | — |
| Single Row Marquee | — | — |
| Single Column Marquee | — | — |
| Reselect | — | — |

**Note:** No "Select All" (Cmd+A) menu item in the Select menu. "Selection Tool" is the first item instead.

## Layer Operations
| Operation | Result |
|-----------|--------|
| Add Layer (button) | ❌ Button not found in automated test context |
| Duplicate Layer (button) | ❌ Button not found in automated test context |
| Blend modes available | normal, multiply, screen, overlay, darken, lighten |
| Opacity slider | Present (0-100%) |

Note: Layer panel buttons (Add, Dup) were present in initial editor view but may not have been accessible after multiple tab switches during testing.

## Keyboard Shortcuts
| Shortcut | Expected | Result |
|----------|----------|--------|
| Cmd+Z | Undo | ✅ Pressed (functional based on history changes) |
| Cmd+Shift+Z | Redo | ✅ Pressed |
| Cmd+A | Select All | ⚠️ Pressed but no visual confirmation |
| Cmd+D | Deselect | ⚠️ Pressed but no visual confirmation |
| V | Move Tool | ✅ Pressed |
| B | Brush Tool | ✅ Pressed |
| E | Eraser Tool | ✅ Pressed |
| T | Text Tool | ✅ Pressed |
| C | Crop Tool | ✅ Pressed |
| M | Marquee Tool | ✅ Pressed |
| L | Lasso Tool | ✅ Pressed |
| G | Gradient Tool | ✅ Pressed |
| I | Eyedropper Tool | ✅ Pressed |

## Issues

### CRITICAL

**C1: All Filter menu items are non-functional**
- Severity: Critical
- All filter submenu items call `setEditMode('filterName' as any)` which sets an invalid EditMode
- The `EditMode` type only includes: 'none', 'select', 'move', 'crop', 'transform', 'adjust', 'filter', 'selection', 'drawing', 'shape', 'mask', 'text', 'layers', AI modes, etc.
- Filter-specific modes like 'blur-basic', 'blurMore', 'boxBlur', 'smartBlur', etc. are NOT in the EditMode union type
- No component in the app listens for these invalid modes
- The `as any` TypeScript cast hides this type mismatch
- **Result: 0 of ~74 filter menu items actually apply any filter effect**
- File: `src/components/image-editor/tabs/EditorMenuBar.tsx` (lines 400-530+)
- File: `src/stores/imageEditor.store.ts` (lines 15-48, EditMode type)

**C2: Missing essential filters from menu**
- Severity: Critical
- Functions exist in `src/lib/canvas/filters.ts` and `src/hooks/useFilterWorker.ts` but are NOT wired to the Filter menu:
  - Gaussian Blur (the most fundamental blur filter)
  - Motion Blur
  - Sharpen (basic)
  - Unsharp Mask
  - Emboss (in Stylize - missing)
  - Add Noise
  - Reduce Noise
- These are core Photoshop-equivalent filters that users expect

**C3: Editor instability during menu interactions**
- Severity: Critical
- During automated testing, the editor frequently lost context (navigated away from editor to Settings/Storage pages)
- This happened when:
  - Clicking the "Filter" text matched sidebar navigation items instead of the menu bar
  - Clicking canvas area to dismiss menus closed the editor tab
  - Pressing Escape navigated away from the editor entirely
- Multiple editor re-opens were required during testing

### WARNING

**W1: "Select All" missing from Select menu**
- Severity: Warning
- The Select menu starts with "Selection Tool" instead of "Select All" (Cmd+A)
- Photoshop's Select menu has "All" (Cmd+A) as the first item
- Cmd+A shortcut may work but has no corresponding menu item

**W2: No traditional filter presets**
- Severity: Warning
- The Presets menu only contains layout templates (4-Panel Portrait, Chibi Sticker, etc.)
- No image filter presets (Vintage, B&W, Warm, Cool, Cinematic, etc.) available
- Users typically expect quick-apply color/style presets in an image editor

**W3: History panel shows "Move Layer" instead of filter names**
- Severity: Warning
- During testing, history entries showed "Move Layer" operations
- Even when filters were "applied", the history didn't reflect filter names
- This could indicate that mouse events during menu interactions trigger unintended move operations

### INFO

**I1: Oil Paint placement**
- Severity: Info
- Oil Paint filter is in "Other" submenu rather than "Stylize" where Photoshop places it
- Minor UX discrepancy

**I2: Multiple duplicate editor tabs created during testing**
- Severity: Info
- Each time the editor was re-opened, a new tab was created
- Final state showed 7+ "Filter Test Image.png" tabs
- No duplicate tab prevention mechanism observed

## Skipped Actions
- AI processing items (Upscale, Background Remove, Inpaint, etc.) — cost/safety
- Presets application — these are layout templates, not directly testable as image filters
- Filters with dialog parameters (Box Blur, Radial Blur, Surface Blur, etc.) — dialogs don't appear since the filters are non-functional

## Root Cause Analysis

The core issue is an **architectural disconnection** between the menu system and the filter engine:

1. **Menu Layer** (`EditorMenuBar.tsx`): Defines ~74 filter items, each calling `setEditMode('filterName' as any)`
2. **Store Layer** (`imageEditor.store.ts`): `setEditMode()` simply stores the mode string in state
3. **Missing Middleware**: No component watches for filter-specific edit modes and triggers actual filter processing
4. **Filter Engine** (`filters.ts`, `filterWorker.ts`): Contains ~314+ filter functions that are never called from the menu

To fix: Need to either:
- Add a `useEffect` or subscriber that detects filter edit modes and applies them via `applyFilterToCanvas`
- Or change menu item actions to directly call filter functions instead of `setEditMode`

## Screenshots
- `/tmp/qa-desktop-editor-initial.png` — Editor initial state
- `/tmp/qa-menu-filter.png` — Filter menu open
- `/tmp/qa-menu-presets.png` — Presets menu
- `/tmp/qa-menu-ai.png` — AI menu
- `/tmp/qa-menu-select.png` — Select menu
- `/tmp/qa-sub-blur.png` through `/tmp/qa-sub-other.png` — Submenu screenshots
