# ComfyUI version of CreaPrompt by Jicé Deb
# CreaPrompt 的 ComfyUI 版本，由 Jicé Deb 开发
# 功能：从 CSV 分类文件中随机生成提示词

import random
import json
import os
import base64
from aiohttp import web
from server import PromptServer

# ============================================================================
# 路径配置
# 定义各个 CSV 文件夹的路径，用于不同节点的分类配置
# ============================================================================
script_directory = os.path.dirname(__file__)
folder_path = os.path.join(script_directory, "csv")          # 主节点使用的 CSV 文件夹
CSV_FOLDER = os.path.join(os.path.dirname(__file__), "csv")  # API 使用的 CSV 文件夹
PRESET_FOLDER = os.path.join(os.path.dirname(__file__), "presets")  # 预设文件保存文件夹
app = PromptServer.instance.app  # 获取 ComfyUI 服务器实例

# ============================================================================
# API 端点处理函数
# 这些函数处理前端与后端的数据交互
# ============================================================================

async def preset_file(request):
    """
    加载预设文件
    从 presets 文件夹中读取指定的预设文件内容
    """
    filename = request.match_info["filename"]
    path = os.path.join(PRESET_FOLDER, filename)
    if not os.path.isfile(path):
        return web.Response(status=404, text="Preset file not found.")
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return web.Response(text=content)
    except Exception as e:
        return web.Response(status=500, text=f"Error reading preset: {e}")
        
async def save_preset(request):
    """
    保存预设文件
    将用户配置的预设保存到 presets 文件夹中
    """
    try:
        data = await request.json()
        name = data.get("name", "").strip()
        content = data.get("content", "").strip()

        if not name or len(name) < 2:
            return web.Response(status=400, text="Nom de preset invalide.")

        filename = os.path.join(PRESET_FOLDER, f"{name}.txt")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(content)
        return web.Response(status=200, text="Preset saved.")
    except Exception as e:
        return web.Response(status=500, text=f"Erreur lors de la sauvegarde : {e}")

async def csv_list(request):
    """
    获取 CSV 文件列表
    返回 csv 文件夹中所有 CSV 文件的列表，用于前端动态加载分类
    """
    try:
        files = [f for f in os.listdir(CSV_FOLDER) if f.endswith(".csv")]
        return web.json_response(sorted(files))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def csv_file(request):
    """
    获取单个 CSV 文件内容
    返回指定 CSV 文件的完整内容，用于前端显示分类选项
    """
    filename = request.match_info["filename"]
    path = os.path.join(CSV_FOLDER, filename)
    if not os.path.isfile(path):
        return web.Response(status=404, text="File not found.")
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return web.Response(text=content)
    except Exception as e:
        return web.Response(status=500, text=f"Error reading file: {e}")
        
async def list_presets(request):
    """
    获取预设文件列表
    返回 presets 文件夹中所有预设文件的列表
    """
    try:
        files = [f for f in os.listdir(PRESET_FOLDER) if f.endswith(".txt")]
        return web.json_response(files)
    except Exception as e:
        return web.Response(status=500, text=f"Erreur lecture presets : {e}")
        
async def delete_preset(request):
    """
    删除预设文件
    从 presets 文件夹中删除指定的预设文件
    """
    filename = request.match_info["filename"]
    path = os.path.join(PRESET_FOLDER, filename)
    if not os.path.isfile(path):
        return web.Response(status=404, text="Preset file not found.")
    try:
        os.remove(path)
        return web.Response(text="Preset deleted.")
    except Exception as e:
        return web.Response(status=500, text=f"Error deleting preset: {e}")

async def rename_preset(request):
    """
    重命名预设文件
    """
    try:
        data = await request.json()
        old_filename = data.get("old_name")
        new_name = data.get("new_name")
        
        if not old_filename or not new_name:
            return web.Response(status=400, text="Missing old_name or new_name")
        
        if not old_filename.endswith(".txt"):
            old_filename += ".txt"
        new_filename = new_name.strip() + ".txt"
        
        old_path = os.path.join(PRESET_FOLDER, old_filename)
        new_path = os.path.join(PRESET_FOLDER, new_filename)
        
        if not os.path.isfile(old_path):
            return web.Response(status=404, text="Preset file not found.")
        
        if os.path.isfile(new_path):
            return web.Response(status=409, text="A preset with this name already exists.")
        
        os.rename(old_path, new_path)
        return web.Response(text="Preset renamed successfully.")
    except Exception as e:
        return web.Response(status=500, text=f"Error renaming preset: {e}")

# ============================================================================
# 注册 API 路由
# 将上述处理函数绑定到对应的 URL 路径
# ============================================================================
app.router.add_get("/custom_nodes/creaprompt/csv_list", csv_list)
app.router.add_get("/custom_nodes/creaprompt/csv/{filename}", csv_file)
app.router.add_get("/custom_nodes/creaprompt/presets/{filename}", preset_file)
app.router.add_post("/custom_nodes/creaprompt/save_preset", save_preset)
app.router.add_get("/custom_nodes/creaprompt/presets_list", list_presets)
app.router.add_delete("/custom_nodes/creaprompt/delete_preset/{filename}", delete_preset)
app.router.add_post("/custom_nodes/creaprompt/rename_preset", rename_preset)
print("✅ creaprompt_api registering endpoints")

# ============================================================================
# 辅助函数
# 用于处理 CSV 文件和随机选择提示词
# ============================================================================

def getfilename(folder):
    """
    获取文件夹中所有 CSV 文件的名称（不含前缀编号和扩展名）
    例如：'01_subject.csv' -> 'subject'
    
    参数:
        folder: CSV 文件夹路径
    返回:
        名称列表
    """
    name = []
    for filename in os.listdir(folder):
        if filename.endswith(".csv"):
            name.append(filename[0:-4])  # 去掉前3个字符（编号和下划线）和后4个字符（.csv）
    return name
    
def select_random_line_from_collection():
    """
    从 collection.txt 文件中随机选择一行
    collection.txt 包含预组合的完整提示词集合
    """
    file_path = os.path.join(folder_path, "collection.txt")
    with open(file_path, "r", encoding="utf-8") as file:
        lines = file.readlines()
        readline = random.choice(lines).strip()
        return readline
    
def select_random_line_from_csv_file(file, folder):
    """
    从指定的 CSV 文件中随机选择一行
    
    参数:
        file: CSV 文件名称（不含前缀编号和扩展名）
        folder: CSV 文件夹路径
    返回:
        随机选择的行内容
    """
    chosen_lines = []
    for filename in os.listdir(folder):
        if filename.endswith(".csv") and filename[0:-4] == file:
            file_path = os.path.join(folder, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                if lines:
                    chosen_lines.append(random.choice(lines).strip())
    lines_chosed = "".join(chosen_lines)
    return lines_chosed

# ============================================================================
# 节点类定义
# 每个类代表一个 ComfyUI 节点
# ============================================================================

class CreaPrompt_0:
    """
    动态节点 - 通过 JSON 配置动态添加分类
    这个节点允许用户通过前端 UI 动态选择和添加分类，
    而不是像其他节点那样固定使用某个文件夹中的所有 CSV 文件。
    """
    
    RETURN_TYPES = (
        "STRING",  # 输出类型：提示词字符串
        "INT",     # 输出类型：种子值
    )
    RETURN_NAMES = (
        "prompt",  # 输出名称：提示词
        "seed",    # 输出名称：种子
    )
    FUNCTION = "create_prompt"  # 执行的主函数名
    CATEGORY = "Hezl-Node"     # 节点在菜单中的分类

    def __init__(self, seed=None):
        """初始化随机数生成器"""
        self.rng = random.Random(seed)

    @classmethod
    def IS_CHANGED(self, **kwargs):
        """
        返回 NaN 使节点每次都重新执行
        这样可以确保每次队列运行时都能生成新的随机提示词
        """
        return float("NaN")

    @classmethod
    def INPUT_TYPES(cls):
        """
        定义节点的输入类型
        __csv_json: 用于接收前端传递的动态分类配置（JSON 格式）
        """
        return {
            "required": {
                "__csv_json": ("STRING", {"multiline": True, "default": "{}", "input": False})
            },
            "optional": {
                "Prompt_count": ("INT", {"default": 1, "min": 1, "max": 1000}),  # 生成提示词数量
                "CreaPrompt_Collection": (["disabled"] + ["enabled"], {"default": "disabled"}),  # 是否使用集合模式
                "seed": ("INT", {"default": 0, "min": 0, "max": 1125899906842624}),  # 随机种子
                "separator": ("STRING", {"default": ",", "multiline": False}),  # 提示词之间的分隔符
            }
        }

    def create_prompt(self, **kwargs):
        """
        生成提示词的主函数
        
        工作流程:
        1. 获取所有分类文件名
        2. 解析动态配置 JSON
        3. 根据配置选择或随机生成每个分类的内容
        4. 将所有分类内容连接成完整提示词
        """
        name_of_files = getfilename(folder_path)
        seed = kwargs.get("seed", 0)
        prompts_count = kwargs.get("Prompt_count", 0)
        separator = kwargs.get("separator", ",")  # 获取分隔符，默认为逗号
        concatenated_values = ""
        prompt_value = ""
        final_values = ""
        values = []
        values = [""] * len(name_of_files)

        # 解析前端传递的 JSON 配置
        dynamic_values = json.loads(kwargs.get("__csv_json", "{}"))

        # 如果启用了集合模式，从 collection.txt 随机选择
        if kwargs.get("CreaPrompt_Collection", 0) == "enabled":
            for c in range(prompts_count):  
                prompt_value = select_random_line_from_collection()  
                print(f"➡️CreaPrompt prompt: {prompt_value}")  
                final_values += prompt_value + "\n" 
                prompt_value = ""            
            final_values = final_values.strip()  
            print(f"➡️CreaPrompt Seed: {seed}")
            return (
                final_values,
                seed,
            )            
        else:
            # 常规模式：根据每个分类的配置生成提示词
            for c in range(prompts_count):
                for i, filename in enumerate(name_of_files):
                    val = dynamic_values.get(filename, "disabled")
                    if val == "🎲random":
                        # 随机模式：从 CSV 文件中随机选择
                        values[i] = select_random_line_from_csv_file(filename, folder_path)
                    else:      
                        # 固定模式：使用用户选择的值
                        values[i] = val.strip()
                # 将所有非 disabled 的值用分隔符连接
                for value in values:
                    if value != "disabled":
                        concatenated_values += value + separator
                # 移除末尾的分隔符（仅当分隔符不为空时）
                if concatenated_values and separator:
                    concatenated_values = concatenated_values[:-len(separator)]
                print(f"➡️CreaPrompt prompt: {concatenated_values}")
                final_values += concatenated_values + "\n" 
                concatenated_values = ""
            final_values = final_values.strip()  
            print(f"➡️CreaPrompt Seed: {seed}")
            return (
                final_values,
                seed,
            )

# ============================================================================
# 节点注册
# 将所有节点类注册到 ComfyUI 系统中
# ============================================================================
NODE_CLASS_MAPPINGS = {
    "CreaPrompt_0": CreaPrompt_0,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CreaPrompt_0": "Hezl-RandomPrompt",
}
