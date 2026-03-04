---
name: "creaprompt"
description: "Helps develop and maintain the ComfyUI_CreaPrompt custom node. Invoke when user asks about prompt generation, CSV category management, node development, or modifying CreaPrompt functionality."
---

# CreaPrompt Skill

This skill provides specialized knowledge for developing and maintaining the ComfyUI_CreaPrompt custom node.

## Project Overview

ComfyUI_CreaPrompt is a ComfyUI custom node that generates random prompts from CSV category files. It supports:
- Multiple nodes (up to 4) with different category configurations
- Weight-based prompt generation
- Dynamic category addition via UI
- Preset saving/loading functionality

## Key Files

| File | Purpose |
|------|---------|
| [creaprompt.py](creaprompt.py) | Main node definitions and API endpoints |
| [__init__.py](__init__.py) | Module initialization and exports |
| [js/dynamique-ui.js](js/dynamique-ui.js) | Frontend UI for dynamic node |
| csv/, csv1/, csv2/, csv3/, csv+weight/ | Category folders containing CSV files |

## Node Classes

- **CreaPrompt** - Main node using `csv/` folder
- **CreaPrompt_0** - Dynamic node with JSON configuration
- **CreaPrompt_1/2/3** - Multi-nodes using `csv1/`, `csv2/`, `csv3/`
- **CreaPrompt_4** - Weight node using `csv+weight/`

## CSV File Format

- Files must follow pattern: `x_xname.csv` (x = order number)
- Each line = one prompt option
- Example: `01_subject.csv` with entries like "girl", "boy", "woman"

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/custom_nodes/creaprompt/csv_list` | GET | List CSV files |
| `/custom_nodes/creaprompt/csv/{filename}` | GET | Get CSV content |
| `/custom_nodes/creaprompt/presets/{filename}` | GET | Load preset |
| `/custom_nodes/creaprompt/save_preset` | POST | Save preset |
| `/custom_nodes/creaprompt/presets_list` | GET | List presets |
| `/custom_nodes/creaprompt/delete_preset/{filename}` | DELETE | Delete preset |

## Development Guidelines

### Adding New Categories
1. Create CSV file in appropriate folder (csv/, csv1/, etc.)
2. Follow naming convention: `XX_categoryname.csv`
3. Each entry on separate line

### Modifying Node Behavior
- Node classes inherit common pattern: `INPUT_TYPES()`, `create_prompt()`
- `IS_CHANGED()` returns `NaN` to always re-execute
- Random selection via `select_random_line_from_csv_file()`

### Frontend Integration
- Uses ComfyUI's `PromptServer` for API routes
- JavaScript UI in `js/dynamique-ui.js` for dynamic category management

## Common Tasks

### Add a new category option
Add entries to the corresponding CSV file in the category folder.

### Create a new node variant
1. Create new class following `CreaPrompt_X` pattern
2. Define `folder_path_X` for CSV location
3. Register in `NODE_CLASS_MAPPINGS`

### Modify prompt generation logic
Edit the `create_prompt()` method in the relevant node class.
