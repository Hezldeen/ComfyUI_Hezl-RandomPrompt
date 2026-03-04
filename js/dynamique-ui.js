import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ============================================================================
// 🛠️ FONCTIONS UTILITAIRES (Helpers)
// ============================================================================

function updateNodeSize(node) {
    const [minWidth, minHeight] = node.computeSize();
    const currentWidth = (node.size && node.size[0] > 10) ? node.size[0] : 220;
    node.setSize([currentWidth, minHeight]);
    node.graph?.setDirtyCanvas(true, true);
}

async function getCsvMapping() {
    try {
        const res = await fetch("/custom_nodes/creaprompt/csv_list");
        if (!res.ok) throw new Error("Erreur liste CSV");
        const files = await res.json();
        const fileMap = {};
        for (const f of files) {
            const base = f.replace(/^\d+_\d*/, "").replace(/\.csv$/, "");
            fileMap[base] = f;
        }
        return { fileMap, allFiles: files };
    } catch (e) {
        return { fileMap: {}, allFiles: [] };
    }
}

async function fetchCsvValues(filename) {
    try {
        const res = await fetch(`/custom_nodes/creaprompt/csv/${filename}`);
        if (!res.ok) return ["disabled", "🎲random"];
        const text = await res.text();
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        return ["disabled", "🎲random", ...lines];
    } catch (e) {
        return ["disabled", "🎲random"];
    }
}

async function syncComboWidget(node, label, selectedValue, csvFilename) {
    const values = await fetchCsvValues(csvFilename);
    
    if (!values.includes(selectedValue) && selectedValue !== "disabled" && selectedValue !== "🎲random") {
        values.push(selectedValue);
    }

    const existingWidget = node.widgets ? node.widgets.find(w => w.name === label) : null;

    if (existingWidget) {
        existingWidget.options.values = values;
        existingWidget.value = selectedValue;
        node._crea_dynamicValues[label] = selectedValue;
    } else {
        const widget = node.addWidget("combo", label, selectedValue, (val) => {
            node._crea_dynamicValues[label] = val;
            node._crea_updateCsvJson();
        }, { values: values, serialize: false });
    }
    
    node._crea_dynamicValues[label] = selectedValue;
}

function cleanupWidgets(node, targetConfigKeys) {
    if (!node.widgets) return;

    const protectedWidgets = [
        "__csv_json",               
        "control_after_generate",   
        "preview_method",           
        "seed",                     
        "Prompt_count",             
        "CreaPrompt_Collection",
        "separator_top",
        "separator_bottom"
    ];

    for (let i = node.widgets.length - 1; i >= 0; i--) {
        const w = node.widgets[i];
        if (w.type === "CUSTOM_SPACER") continue;
        if (protectedWidgets.includes(w.name)) continue;

        if (w.type === "combo") {
            if (!targetConfigKeys.includes(w.name)) {
                node.widgets.splice(i, 1);
            }
        }
    }
}

async function loadDefaultConfig(node) {
    if (node._crea_is_restored || Object.keys(node._crea_dynamicValues).length > 0) return;

    try {
        const res = await fetch("/custom_nodes/creaprompt/presets/default_combos.txt");
        if (!res.ok) return;
        
        const text = await res.text();
        const labels = text.split("\n").map(l => l.trim()).filter(Boolean);
        const { fileMap } = await getCsvMapping();
        
        cleanupWidgets(node, labels);

        for (const label of labels) {
            if (node._crea_is_restored) break;
            const csvFile = fileMap[label];
            if (csvFile) {
                await syncComboWidget(node, label, "disabled", csvFile);
            }
        }
        node._crea_updateCsvJson();
        updateNodeSize(node);
    } catch (e) { console.warn(e); }
}

function showFloatingMenu(items, onClickItem, clickX, clickY, title = "Menu", multiSelect = false) {
    const oldMenu = document.getElementById("crea_prompt_floating_menu");
    if (oldMenu) oldMenu.remove();

    const selectedItems = new Set();

    const menu = document.createElement("div");
    menu.id = "crea_prompt_floating_menu";
    Object.assign(menu.style, {
        position: "fixed", left: `${clickX}px`, top: `${clickY}px`,
        background: "#222", color: "#fff", border: "1px solid #666",
        padding: "0", zIndex: 9999, borderRadius: "4px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        maxHeight: "60vh", minWidth: "200px",
        fontFamily: "sans-serif", fontSize: "13px",
        display: "flex", flexDirection: "column"
    });

    const header = document.createElement("div");
    header.innerHTML = `<b>${title}</b> <span style="float:right; cursor:pointer">❌</span>`;
    Object.assign(header.style, {
        padding: "6px 10px", borderBottom: "1px solid #444", background: "#333",
        flexShrink: "0", cursor: "move"
    });
    header.querySelector("span").onclick = () => menu.remove();
    menu.appendChild(header);
    makeDraggable(menu, header);

    const searchContainer = document.createElement("div");
    Object.assign(searchContainer.style, {
        padding: "6px 8px", borderBottom: "1px solid #444", background: "#2a2a2a",
        flexShrink: "0"
    });
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Search...";
    Object.assign(searchInput.style, {
        width: "100%", boxSizing: "border-box", padding: "6px 8px",
        background: "#1a1a1a", border: "1px solid #555", borderRadius: "3px",
        color: "#fff", fontSize: "12px", outline: "none"
    });
    searchInput.onfocus = () => searchInput.style.borderColor = "#888";
    searchInput.onblur = () => searchInput.style.borderColor = "#555";
    searchContainer.appendChild(searchInput);
    menu.appendChild(searchContainer);

    const listContainer = document.createElement("div");
    Object.assign(listContainer.style, {
        overflowY: "auto", flex: "1", minHeight: "0"
    });
    menu.appendChild(listContainer);

    if (multiSelect) {
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            padding: "6px 8px", borderTop: "1px solid #444", background: "#333",
            flexShrink: "0", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap"
        });
        
        const countSpan = document.createElement("span");
        countSpan.textContent = "已选择: 0";
        Object.assign(countSpan.style, { fontSize: "11px", color: "#aaa", marginRight: "auto" });
        
        const selectAllBtn = document.createElement("button");
        selectAllBtn.textContent = "☐ 全选";
        Object.assign(selectAllBtn.style, {
            background: "#444", border: "1px solid #666", color: "#fff",
            padding: "3px 8px", borderRadius: "3px", cursor: "pointer",
            fontSize: "11px"
        });
        selectAllBtn.onmouseover = () => selectAllBtn.style.background = "#555";
        selectAllBtn.onmouseout = () => selectAllBtn.style.background = "#444";
        
        const deselectAllBtn = document.createElement("button");
        deselectAllBtn.textContent = "☑ 取消";
        Object.assign(deselectAllBtn.style, {
            background: "#444", border: "1px solid #666", color: "#fff",
            padding: "3px 8px", borderRadius: "3px", cursor: "pointer",
            fontSize: "11px"
        });
        deselectAllBtn.onmouseover = () => deselectAllBtn.style.background = "#555";
        deselectAllBtn.onmouseout = () => deselectAllBtn.style.background = "#444";
        
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "✓ 确认";
        Object.assign(confirmBtn.style, {
            background: "#4a4", border: "none", color: "#fff",
            padding: "3px 10px", borderRadius: "3px", cursor: "pointer",
            fontSize: "11px"
        });
        confirmBtn.onmouseover = () => confirmBtn.style.background = "#5b5";
        confirmBtn.onmouseout = () => confirmBtn.style.background = "#4a4";
        confirmBtn.onclick = () => {
            const selected = Array.from(selectedItems).map(label => items.find(i => i.label === label));
            selected.forEach(item => onClickItem(item));
            menu.remove();
        };
        
        footer.appendChild(countSpan);
        footer.appendChild(selectAllBtn);
        footer.appendChild(deselectAllBtn);
        footer.appendChild(confirmBtn);
        menu.appendChild(footer);

        function updateCount() {
            countSpan.textContent = `已选择: ${selectedItems.size}`;
        }

        function renderList(filteredItems) {
            listContainer.innerHTML = "";
            if (filteredItems.length === 0) {
                listContainer.appendChild(Object.assign(document.createElement("div"), {
                    textContent: items.length === 0 ? "Empty" : "No results",
                    style: "padding:10px; color:#888; text-align:center;"
                }));
            } else {
                filteredItems.forEach(item => {
                    const div = document.createElement("div");
                    const label = item.label || item;
                    const isSelected = selectedItems.has(label);
                    
                    Object.assign(div.style, { 
                        padding: "5px 10px", 
                        cursor: "pointer",
                        display: "flex", 
                        alignItems: "center", 
                        gap: "8px",
                        background: isSelected ? "#3a5a3a" : "transparent"
                    });
                    
                    const checkbox = document.createElement("span");
                    checkbox.textContent = isSelected ? "☑" : "☐";
                    Object.assign(checkbox.style, { fontSize: "14px", width: "16px" });
                    
                    const textSpan = document.createElement("span");
                    textSpan.textContent = label;
                    
                    div.appendChild(checkbox);
                    div.appendChild(textSpan);
                    
                    div.onmouseover = () => { if (!selectedItems.has(label)) div.style.background = "#444"; };
                    div.onmouseout = () => { div.style.background = selectedItems.has(label) ? "#3a5a3a" : "transparent"; };
                    div.onclick = () => {
                        if (selectedItems.has(label)) {
                            selectedItems.delete(label);
                            checkbox.textContent = "☐";
                            div.style.background = "transparent";
                        } else {
                            selectedItems.add(label);
                            checkbox.textContent = "☑";
                            div.style.background = "#3a5a3a";
                        }
                        updateCount();
                    };
                    listContainer.appendChild(div);
                });
            }
        }

        renderList(items);

        selectAllBtn.onclick = () => {
            const query = searchInput.value.toLowerCase().trim();
            const targetItems = query ? items.filter(item => {
                const label = (item.label || item).toLowerCase();
                return label.includes(query);
            }) : items;
            targetItems.forEach(item => selectedItems.add(item.label || item));
            renderList(targetItems);
            updateCount();
        };

        deselectAllBtn.onclick = () => {
            const query = searchInput.value.toLowerCase().trim();
            if (query) {
                const filtered = items.filter(item => {
                    const label = (item.label || item).toLowerCase();
                    return label.includes(query);
                });
                filtered.forEach(item => selectedItems.delete(item.label || item));
                renderList(filtered);
            } else {
                selectedItems.clear();
                renderList(items);
            }
            updateCount();
        };

        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase().trim();
            const filtered = items.filter(item => {
                const label = (item.label || item).toLowerCase();
                return label.includes(query);
            });
            renderList(filtered);
        };
    } else {
        function renderList(filteredItems) {
            listContainer.innerHTML = "";
            if (filteredItems.length === 0) {
                listContainer.appendChild(Object.assign(document.createElement("div"), {
                    textContent: items.length === 0 ? "Empty" : "No results",
                    style: "padding:10px; color:#888; text-align:center;"
                }));
            } else {
                filteredItems.forEach(item => {
                    const div = document.createElement("div");
                    div.textContent = item.label || item;
                    Object.assign(div.style, { padding: "5px 10px", cursor: "pointer" });
                    div.onmouseover = () => div.style.background = "#444";
                    div.onmouseout = () => div.style.background = "transparent";
                    div.onclick = () => { onClickItem(item); menu.remove(); };
                    listContainer.appendChild(div);
                });
            }
        }

        renderList(items);

        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase().trim();
            const filtered = items.filter(item => {
                const label = (item.label || item).toLowerCase();
                return label.includes(query);
            });
            renderList(filtered);
        };
    }

    document.body.appendChild(menu);
    searchInput.focus();
}

function showPresetManager(clickX, clickY) {
    const oldMenu = document.getElementById("crea_prompt_floating_menu");
    if (oldMenu) oldMenu.remove();

    const selectedItems = new Set();
    let currentItems = [];

    const menu = document.createElement("div");
    menu.id = "crea_prompt_floating_menu";
    Object.assign(menu.style, {
        position: "fixed", left: `${clickX}px`, top: `${clickY}px`,
        background: "#222", color: "#fff", border: "1px solid #666",
        padding: "0", zIndex: 9999, borderRadius: "4px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        maxHeight: "60vh", minWidth: "250px",
        fontFamily: "sans-serif", fontSize: "13px",
        display: "flex", flexDirection: "column"
    });

    const header = document.createElement("div");
    header.innerHTML = `<b>📦 管理预设</b> <span style="float:right; cursor:pointer">❌</span>`;
    Object.assign(header.style, {
        padding: "6px 10px", borderBottom: "1px solid #444", background: "#333",
        flexShrink: "0", cursor: "move"
    });
    header.querySelector("span").onclick = () => menu.remove();
    menu.appendChild(header);
    makeDraggable(menu, header);

    const searchContainer = document.createElement("div");
    Object.assign(searchContainer.style, {
        padding: "6px 8px", borderBottom: "1px solid #444", background: "#2a2a2a",
        flexShrink: "0"
    });
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Search...";
    Object.assign(searchInput.style, {
        width: "100%", boxSizing: "border-box", padding: "6px 8px",
        background: "#1a1a1a", border: "1px solid #555", borderRadius: "3px",
        color: "#fff", fontSize: "12px", outline: "none"
    });
    searchInput.onfocus = () => searchInput.style.borderColor = "#888";
    searchInput.onblur = () => searchInput.style.borderColor = "#555";
    searchContainer.appendChild(searchInput);
    menu.appendChild(searchContainer);

    const renameContainer = document.createElement("div");
    Object.assign(renameContainer.style, {
        padding: "6px 8px", borderBottom: "1px solid #444", background: "#2a2a2a",
        flexShrink: "0", display: "flex", alignItems: "center", gap: "6px"
    });
    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️ 重命名";
    Object.assign(renameBtn.style, {
        background: "#444", border: "1px solid #666", color: "#fff",
        padding: "4px 12px", borderRadius: "3px", cursor: "pointer",
        fontSize: "11px", flex: "1"
    });
    renameBtn.onmouseover = () => renameBtn.style.background = "#555";
    renameBtn.onmouseout = () => renameBtn.style.background = "#444";
    
    renameContainer.appendChild(renameBtn);
    menu.appendChild(renameContainer);

    const listContainer = document.createElement("div");
    Object.assign(listContainer.style, {
        overflowY: "auto", flex: "1", minHeight: "0"
    });
    menu.appendChild(listContainer);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
        padding: "6px 8px", borderTop: "1px solid #444", background: "#333",
        flexShrink: "0", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap"
    });
    
    const countSpan = document.createElement("span");
    countSpan.textContent = "已选择: 0";
    Object.assign(countSpan.style, { fontSize: "11px", color: "#aaa", marginRight: "auto" });
    
    const selectAllBtn = document.createElement("button");
    selectAllBtn.textContent = "☐ 全选";
    Object.assign(selectAllBtn.style, {
        background: "#444", border: "1px solid #666", color: "#fff",
        padding: "3px 8px", borderRadius: "3px", cursor: "pointer",
        fontSize: "11px"
    });
    selectAllBtn.onmouseover = () => selectAllBtn.style.background = "#555";
    selectAllBtn.onmouseout = () => selectAllBtn.style.background = "#444";
    
    const deselectAllBtn = document.createElement("button");
    deselectAllBtn.textContent = "☑ 取消";
    Object.assign(deselectAllBtn.style, {
        background: "#444", border: "1px solid #666", color: "#fff",
        padding: "3px 8px", borderRadius: "3px", cursor: "pointer",
        fontSize: "11px"
    });
    deselectAllBtn.onmouseover = () => deselectAllBtn.style.background = "#555";
    deselectAllBtn.onmouseout = () => deselectAllBtn.style.background = "#444";
    
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️ 删除";
    Object.assign(deleteBtn.style, {
        background: "#a44", border: "none", color: "#fff",
        padding: "3px 10px", borderRadius: "3px", cursor: "pointer",
        fontSize: "11px"
    });
    deleteBtn.onmouseover = () => deleteBtn.style.background = "#c55";
    deleteBtn.onmouseout = () => deleteBtn.style.background = "#a44";
    
    footer.appendChild(countSpan);
    footer.appendChild(selectAllBtn);
    footer.appendChild(deselectAllBtn);
    footer.appendChild(deleteBtn);
    menu.appendChild(footer);

    function updateCount() {
        countSpan.textContent = `已选择: ${selectedItems.size}`;
    }

    function renderList(filteredItems) {
        listContainer.innerHTML = "";
        if (filteredItems.length === 0) {
            listContainer.appendChild(Object.assign(document.createElement("div"), {
                textContent: currentItems.length === 0 ? "暂无预设" : "无匹配结果",
                style: "padding:10px; color:#888; text-align:center;"
            }));
        } else {
            filteredItems.forEach(item => {
                const div = document.createElement("div");
                const label = item.label || item;
                const isSelected = selectedItems.has(label);
                
                Object.assign(div.style, { 
                    padding: "5px 10px", 
                    cursor: "pointer",
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px",
                    background: isSelected ? "#3a5a3a" : "transparent"
                });
                
                const checkbox = document.createElement("span");
                checkbox.textContent = isSelected ? "☑" : "☐";
                Object.assign(checkbox.style, { fontSize: "14px", width: "16px" });
                
                const textSpan = document.createElement("span");
                textSpan.textContent = label;
                
                div.appendChild(checkbox);
                div.appendChild(textSpan);
                
                div.onmouseover = () => { if (!selectedItems.has(label)) div.style.background = "#444"; };
                div.onmouseout = () => { div.style.background = selectedItems.has(label) ? "#3a5a3a" : "transparent"; };
                div.onclick = () => {
                    if (selectedItems.has(label)) {
                        selectedItems.delete(label);
                        checkbox.textContent = "☐";
                        div.style.background = "transparent";
                    } else {
                        selectedItems.add(label);
                        checkbox.textContent = "☑";
                        div.style.background = "#3a5a3a";
                    }
                    updateCount();
                };
                listContainer.appendChild(div);
            });
        }
    }

    async function loadPresets() {
        try {
            const r = await fetch("/custom_nodes/creaprompt/presets_list");
            const files = await r.json();
            currentItems = files
                .filter(x => x.endsWith(".txt") && x !== "default_combos.txt")
                .map(filename => ({
                    label: filename.replace(/\.txt$/, ""), 
                    filename: filename                     
                }));
            renderList(currentItems);
        } catch (err) {
            listContainer.innerHTML = '<div style="padding:10px; color:#888; text-align:center;">加载失败</div>';
        }
    }

    loadPresets();

    selectAllBtn.onclick = () => {
        const query = searchInput.value.toLowerCase().trim();
        const targetItems = query ? currentItems.filter(item => {
            const label = (item.label || item).toLowerCase();
            return label.includes(query);
        }) : currentItems;
        targetItems.forEach(item => selectedItems.add(item.label || item));
        renderList(targetItems);
        updateCount();
    };

    deselectAllBtn.onclick = () => {
        const query = searchInput.value.toLowerCase().trim();
        if (query) {
            const filtered = currentItems.filter(item => {
                const label = (item.label || item).toLowerCase();
                return label.includes(query);
            });
            filtered.forEach(item => selectedItems.delete(item.label || item));
            renderList(filtered);
        } else {
            selectedItems.clear();
            renderList(currentItems);
        }
        updateCount();
    };

    deleteBtn.onclick = async () => {
        if (selectedItems.size === 0) return;
        const names = Array.from(selectedItems);
        if (!confirm(`确定删除 ${names.length} 个预设？\n${names.join(", ")}`)) return;
        
        for (const name of names) {
            const item = currentItems.find(i => i.label === name);
            if (item) {
                await fetch(`/custom_nodes/creaprompt/delete_preset/${item.filename}`, {method: "DELETE"});
            }
        }
        selectedItems.clear();
        await loadPresets();
        updateCount();
    };

    function showRenameDialog(title, defaultName, onConfirm) {
        const oldDialog = document.getElementById("crea_prompt_rename_dialog");
        if (oldDialog) oldDialog.remove();

        const dialog = document.createElement("div");
        dialog.id = "crea_prompt_rename_dialog";
        Object.assign(dialog.style, {
            position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            background: "#222", color: "#fff", border: "1px solid #666",
            padding: "0", zIndex: 10000, borderRadius: "4px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            minWidth: "280px",
            fontFamily: "sans-serif", fontSize: "13px"
        });

        const header = document.createElement("div");
        header.innerHTML = `<b>${title}</b>`;
        Object.assign(header.style, {
            padding: "8px 12px", borderBottom: "1px solid #444", background: "#333",
            cursor: "move"
        });
        dialog.appendChild(header);
        makeDraggable(dialog, header);

        const content = document.createElement("div");
        Object.assign(content.style, { padding: "12px" });

        const input = document.createElement("input");
        input.type = "text";
        input.value = defaultName;
        Object.assign(input.style, {
            width: "100%", boxSizing: "border-box", padding: "8px 10px",
            background: "#1a1a1a", border: "1px solid #555", borderRadius: "3px",
            color: "#fff", fontSize: "13px", outline: "none",
            marginBottom: "12px"
        });
        input.onfocus = () => input.style.borderColor = "#888";
        input.onblur = () => input.style.borderColor = "#555";
        content.appendChild(input);

        const btnContainer = document.createElement("div");
        Object.assign(btnContainer.style, {
            display: "flex", justifyContent: "flex-end", gap: "8px"
        });

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        Object.assign(cancelBtn.style, {
            background: "#444", border: "1px solid #666", color: "#fff",
            padding: "6px 16px", borderRadius: "3px", cursor: "pointer",
            fontSize: "12px"
        });
        cancelBtn.onmouseover = () => cancelBtn.style.background = "#555";
        cancelBtn.onmouseout = () => cancelBtn.style.background = "#444";
        cancelBtn.onclick = () => dialog.remove();

        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "确认";
        Object.assign(confirmBtn.style, {
            background: "#4a4", border: "none", color: "#fff",
            padding: "6px 16px", borderRadius: "3px", cursor: "pointer",
            fontSize: "12px"
        });
        confirmBtn.onmouseover = () => confirmBtn.style.background = "#5b5";
        confirmBtn.onmouseout = () => confirmBtn.style.background = "#4a4";
        confirmBtn.onclick = () => {
            const newName = input.value.trim();
            if (newName) {
                onConfirm(newName);
                dialog.remove();
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") confirmBtn.click();
            if (e.key === "Escape") dialog.remove();
        });

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        content.appendChild(btnContainer);
        dialog.appendChild(content);

        document.body.appendChild(dialog);
        input.focus();
        input.select();
    }

    renameBtn.onclick = async () => {
        if (selectedItems.size !== 1) {
            alert("请选择一个预设进行重命名");
            return;
        }
        const oldName = Array.from(selectedItems)[0];
        const item = currentItems.find(i => i.label === oldName);
        if (!item) return;
        
        showRenameDialog("✏️ 重命名预设", oldName, async (newName) => {
            try {
                const res = await fetch("/custom_nodes/creaprompt/rename_preset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ old_name: item.filename, new_name: newName })
                });
                if (res.ok) {
                    selectedItems.clear();
                    await loadPresets();
                    updateCount();
                } else {
                    const text = await res.text();
                    alert("重命名失败: " + text);
                }
            } catch (e) {
                alert("重命名失败: " + e.message);
            }
        });
    };

    searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim();
        const filtered = currentItems.filter(item => {
            const label = (item.label || item).toLowerCase();
            return label.includes(query);
        });
        renderList(filtered);
    };

    document.body.appendChild(menu);
    searchInput.focus();
}

function addCustomSpacer(node, name, title) {
    node.widgets.push({
        name: name,
        type: "CUSTOM_SPACER",
        serialize: false, 
        draw: (ctx, node, width, y) => {
            const rectHeight = 20, marginY = 5, x_padding = 10;
            ctx.fillStyle = "#272"; 
            ctx.fillRect(x_padding, y + marginY, width - (x_padding * 2), rectHeight);
            ctx.fillStyle = "#CCC"; 
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "center";
            const textY = y + marginY + rectHeight / 2 + 4;
            ctx.fillText(title, width / 2, textY);
        },
        computeSize: () => [0, 30] 
    });
}

function addButtonRow(node, name, buttons) {
    node.widgets.push({
        name: name,
        type: "BUTTON_ROW",
        serialize: false,
        buttons: buttons,
        draw: function(ctx, node, width, y) {
            const padding = 5;
            const gap = 4;
            const btnHeight = 22;
            const btnY = y + 2;
            const totalGap = gap * (buttons.length - 1);
            const btnWidth = (width - padding * 2 - totalGap) / buttons.length;
            
            buttons.forEach((btn, i) => {
                const btnX = padding + i * (btnWidth + gap);
                
                ctx.fillStyle = btn.mouseOver ? "#555" : "#444";
                ctx.beginPath();
                ctx.roundRect(btnX, btnY, btnWidth, btnHeight, 3);
                ctx.fill();
                
                ctx.fillStyle = "#fff";
                ctx.font = "11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(btn.label, btnX + btnWidth / 2, btnY + btnHeight / 2);
                
                btn.bounds = { x: btnX, y: btnY, w: btnWidth, h: btnHeight };
            });
        },
        computeSize: () => [0, 28],
        mouse: function(e, pos, node) {
            const x = pos[0];
            const y = pos[1];
            let handled = false;
            
            buttons.forEach(btn => {
                if (btn.bounds) {
                    const inBounds = x >= btn.bounds.x && x <= btn.bounds.x + btn.bounds.w &&
                                    y >= btn.bounds.y && y <= btn.bounds.y + btn.bounds.h;
                    
                    if (e.type === "pointermove") {
                        if (inBounds && !btn.mouseOver) {
                            btn.mouseOver = true;
                            node.graph?.setDirtyCanvas(true, true);
                        } else if (!inBounds && btn.mouseOver) {
                            btn.mouseOver = false;
                            node.graph?.setDirtyCanvas(true, true);
                        }
                    }
                    
                    if (e.type === "pointerdown" && inBounds && btn.callback) {
                        btn.callback(e);
                        handled = true;
                    }
                }
            });
            
            return handled;
        }
    });
}

function makeDraggable(menu, header) {
    let isDragging = false;
    let startX, startY, menuStartX, menuStartY;

    header.style.cursor = "move";
    
    header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "SPAN") return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        menuStartX = parseInt(menu.style.left);
        menuStartY = parseInt(menu.style.top);
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        menu.style.left = `${menuStartX + dx}px`;
        menu.style.top = `${menuStartY + dy}px`;
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });
}


// ============================================================================
// 🧩 EXTENSION PRINCIPALE
// ============================================================================

app.registerExtension({
    name: "CreaPrompt_UI",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CreaPrompt_0") return;

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            const node = this;

            node._crea_dynamicValues = {};
            node._crea_is_restored = false; 
            node._crea_load_timer = null;

            // --- WIDGET JSON ---
            const jsonWidget = node.widgets.find(w => w.name === "__csv_json");
            
            node._crea_updateCsvJson = function() {
                if (jsonWidget) jsonWidget.value = JSON.stringify(node._crea_dynamicValues);
            };

            // ⚡⚡ CORRECTION DU BUG D'AFFICHAGE AU SCROLL ⚡⚡
            // Au lieu de le cacher une seule fois, on force le masquage à chaque redessin du node.
            // Cela résout le problème où ComfyUI recrée le DOM quand le node revient à l'écran.
            if (jsonWidget) {
                jsonWidget.computeSize = () => [0, -4]; // Réduit la taille logique
                
                const origDrawForeground = node.onDrawForeground;
                node.onDrawForeground = function (ctx) {
                    if (origDrawForeground) origDrawForeground.apply(this, arguments);
                    
                    // On vérifie et on cache l'élément DOM s'il est visible
                    if (jsonWidget.inputEl) {
                        if (jsonWidget.inputEl.style.display !== "none") {
                            jsonWidget.inputEl.style.display = "none";
                        }
                        // Parfois ComfyUI met le widget dans un parent qui a des marges/bordures
                        if (jsonWidget.inputEl.parentElement && jsonWidget.inputEl.parentElement.style.display !== "none") {
                            jsonWidget.inputEl.parentElement.style.display = "none";
                        }
                    }
                };
            }

            // 🕒 TIMEOUT
            node._crea_load_timer = setTimeout(() => {
                if (node._crea_is_restored) return;
                const rawJson = jsonWidget ? jsonWidget.value : null;
                if (rawJson && typeof rawJson === "string" && rawJson.trim().startsWith("{") && rawJson.trim() !== "{}") {
                    return; 
                }
                loadDefaultConfig(node);
            }, 100);

            // ================= 1. SPACER HAUT =================
            addCustomSpacer(node, "separator_top", "预设");

            // ================= BUTTONS ROW 1 =================
            addButtonRow(node, "preset_buttons", [
                {
                    label: "💾 保存预设",
                    callback: async () => {
                        const name = prompt("预设名称:");
                        if (!name || name.length < 2) return;
                        try {
                            await fetch("/custom_nodes/creaprompt/save_preset", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: name.trim(), content: JSON.stringify(node._crea_dynamicValues, null, 2) })
                            });
                        } catch (e) { alert("保存失败: " + e.message); }
                    }
                },
                {
                    label: "📂 读取预设",
                    callback: async (e) => {
                        const cx = e?.clientX ?? 100; const cy = e?.clientY ?? 100;
                        try {
                            const r = await fetch("/custom_nodes/creaprompt/presets_list");
                            const f = await r.json();
                            
                            const menuItems = f
                                .filter(x => x.endsWith(".txt") && x !== "default_combos.txt")
                                .map(filename => ({
                                    label: filename.replace(/\.txt$/, ""), 
                                    filename: filename                     
                                }));

                            showFloatingMenu(menuItems, async (item) => {
                                const r2 = await fetch(`/custom_nodes/creaprompt/presets/${item.filename}`);
                                const parsed = JSON.parse(await r2.text());
                                
                                const targetKeys = Object.keys(parsed);
                                node._crea_dynamicValues = {}; 

                                cleanupWidgets(node, targetKeys);

                                const { fileMap } = await getCsvMapping();
                                for (const [k, val] of Object.entries(parsed)) {
                                    if(fileMap[k]) await syncComboWidget(node, k, val, fileMap[k]);
                                }
                                node._crea_updateCsvJson();
                                updateNodeSize(node);
                            }, cx, cy, "📂 读取预设");
                        } catch (err) { alert("读取失败"); }
                    }
                },
                {
                    label: "📦 管理预设",
                    callback: (e) => {
                        const cx = e?.clientX ?? 100; const cy = e?.clientY ?? 100;
                        showPresetManager(cx, cy);
                    }
                }
            ]);

            // ================= BUTTONS ROW 2 =================
            addButtonRow(node, "csv_buttons", [
                {
                    label: "➕ 添加csv",
                    callback: async (e) => {
                        const cx = e?.clientX ?? 100; const cy = e?.clientY ?? 100;
                        const { fileMap } = await getCsvMapping();
                        const used = Object.keys(node._crea_dynamicValues);
                        const items = Object.keys(fileMap).filter(k => !used.includes(k)).map(k => ({label: k, file: fileMap[k]}));
                        showFloatingMenu(items, async (i) => {
                            await syncComboWidget(node, i.label, "disabled", i.file);
                            node._crea_updateCsvJson();
                            updateNodeSize(node);
                        }, cx, cy, "➕ 添加csv (可多选)", true);
                    }
                },
                {
                    label: "➖ 移除csv",
                    callback: (e) => {
                        const keys = Object.keys(node._crea_dynamicValues);
                        if(!keys.length) return;
                        showFloatingMenu(keys, (k) => {
                            const idx = node.widgets.findIndex(w => w.name === k);
                            if(idx>-1) node.widgets.splice(idx, 1);
                            delete node._crea_dynamicValues[k];
                            node._crea_updateCsvJson();
                            updateNodeSize(node);
                        }, e?.clientX??100, e?.clientY??100, "➖ 移除csv");
                    }
                },
                {
                    label: "🧹 移除全部",
                    callback: () => {
                        if(!confirm("确定移除所有分类?")) return;
                        cleanupWidgets(node, []); 
                        node._crea_dynamicValues = {};
                        node._crea_updateCsvJson();
                        updateNodeSize(node);
                    }
                }
            ]);

            // ================= 2. SPACER BAS =================
            addCustomSpacer(node, "separator_bottom", "已有csv");
        };
    },

    async loadedGraphNode(node, def) {
        if (node.type !== "CreaPrompt_0") return;

        if (node._crea_load_timer) {
            clearTimeout(node._crea_load_timer);
            node._crea_load_timer = null;
        }
        node._crea_is_restored = true;

        const jsonWidget = node.widgets.find(w => w.name === "__csv_json");
        if (jsonWidget && jsonWidget.value && jsonWidget.value !== "{}") {
            try {
                const savedConfig = JSON.parse(jsonWidget.value);
                const targetKeys = Object.keys(savedConfig);

                cleanupWidgets(node, targetKeys);

                node._crea_dynamicValues = savedConfig;
                const { fileMap } = await getCsvMapping();

                for (const [label, val] of Object.entries(savedConfig)) {
                    if (fileMap[label]) await syncComboWidget(node, label, val, fileMap[label]);
                }
                updateNodeSize(node);
            } catch (e) { console.error("JSON error", e); }
        } else {
            await loadDefaultConfig(node);
        }
    }
});