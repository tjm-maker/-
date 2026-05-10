# 六级单词 · Daily

一个**零依赖**、**纯前端**的六级词汇学习单页应用。每天抽取一批单词，学完后把它们串成一篇英文短文配中文翻译，帮助你在语境中牢记生词。

## ✨ 功能

- **每日学习** — 默认 50 词（5~200 可配置），卡片**先英后中**：先显示单词 + 音标，点击 / 按空格后才显示释义、例句和翻译
- **三档评分** — 不认识 / 模糊 / 认识，驱动艾宾浩斯复习曲线（1、2、4、7、15、30 天）
- **AI 短文** — 配置 OpenAI 兼容 API（OpenAI / DeepSeek / 通义千问 / 自定义），把今日单词自动串成 150~250 词的短文 + 中文翻译，生词在英文中高亮
- **离线兜底** — 未配置 AI 或请求失败时，点击「使用内置短文」用例句 + 连接词拼接出一篇
- **复习系统** — 自动聚合今日到期的单词卡，支持同样的三档评分
- **统计面板** — 已学数量、掌握数量、今日待复习、连续打卡 🔥、14 天热力图、最近掌握词
- **本地存储** — 所有数据（含 API Key）只存在浏览器 LocalStorage，不会上传到任何服务器

## 🚀 使用

### 方式 1：本地打开

```bash
# 启动一个简单 HTTP 服务（浏览器直接双击 index.html 无法加载 ES modules）
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

### 方式 2：部署到 GitHub Pages

把仓库 Settings → Pages → Source 选为 `main` 分支根目录即可。

## ⚙️ AI 配置

进入「设置」页，填写：

| 字段 | 说明 |
|------|------|
| 服务商 | OpenAI / DeepSeek / 通义千问（DashScope 兼容模式）/ 自定义 |
| Base URL | 选择服务商后会自动填入，例如 `https://api.openai.com/v1` |
| API Key | 你的密钥，仅保存在本地浏览器 |
| 模型 | 例如 `gpt-4o-mini`、`deepseek-chat`、`qwen-turbo` |

> 不填也能用：点击「使用内置短文」即可离线生成。

## ⌨️ 快捷键

- `空格` / `Enter` — 显示释义
- `1` / `2` / `3` — 评分：不认识 / 模糊 / 认识

## 📁 目录结构

```
.
├── index.html              # 单页入口
├── styles/main.css         # 深色紫罗兰主题
└── js/
    ├── app.js              # 主入口、tab 切换
    ├── data/words.js       # 六级核心词库（377 词）
    ├── core/
    │   ├── storage.js      # LocalStorage 持久化 + 艾宾浩斯 schedule
    │   ├── session.js      # 今日会话管理、抽词、评分
    │   └── story.js        # AI 生成 + 兜底拼接 + 高亮
    └── views/
        ├── learn.js        # 今日学习
        ├── story.js        # 今日短文
        ├── review.js       # 复习队列
        ├── stats.js        # 统计面板
        └── settings.js     # 设置页
```

## 🛡️ 隐私

- 所有学习进度、打卡记录、API Key 都只存在你自己浏览器的 LocalStorage
- AI 短文请求直接从你的浏览器发到你配置的服务商，没有任何中间服务器

## 📝 License

MIT
