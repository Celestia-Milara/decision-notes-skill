# Decision Notes Validator Maintenance Guide

此文档保留规则契约、实现边界和验证方式，有两个用途：维护现有校验器；以及在目标项目不使用 Node.js 时，作为 Agent 用项目语言重实现校验器的行为契约。笔记写作规则以 [.agents/skills/decision-notes/SKILL.md](.agents/skills/decision-notes/SKILL.md) 为准；可运行实现位于 [scripts/verify-decisions.ts](scripts/verify-decisions.ts)，回归用例位于 [scripts/verify-decisions.test.ts](scripts/verify-decisions.test.ts)。接入方式见 [README.md](README.md)。

## How to Obtain or Reimplement

接入分两条路径。目标项目使用 Node.js 时，直接复制 `scripts/` 下的脚本与回归测试，不需要重新实现。目标项目不使用 Node.js 时，由 Agent 阅读本文，用项目语言一次性实现等效校验器，之后作为项目代码随仓库维护，不需要反复重新生成：实现依据是 Rule Contract 与 Workflow and Boundaries 两节，完成后按 Testing and Maintenance 一节的黑盒方法和覆盖清单自测。本文不保存一次性的生成提示词，不承诺特定行数或未经测量的性能指标，也不保留与源文件重复的伪代码。

移植必须保持行为等价：规则码 `D000`–`D120` 的取值、级别与触发条件不变（SKILL.md 直接引用了 `D022`、`D090`、`D101`、`D103`、`D110`）；退出码语义、`--strict` 行为、诊断格式与排序一致；只读、离线的边界不变。Workflow and Boundaries 一节描述的是对外行为而不是参考实现的内部细节，移植必须逐项复现；命令名与调用方式可以随项目工具链变化，项目协作说明中引用的应是项目自己的命令。

参考实现是单文件 TypeScript，业务代码只使用 Node 内置模块，执行依赖 `tsx`。因此“无额外解析库”不等于“运行时零依赖”。参考实现运行于 Node.js 22+，解析采用有限的逐行与正则处理；移植不必沿用同样的解析技术，只要外部行为一致即可。

## Commands and Output

在本仓库根目录执行：

```sh
npm run verify-decisions
npm run verify-decisions -- --root /path/to/project --strict
npm test
```

`--root <dir>` 默认是当前工作目录；相对路径也相对当前工作目录解析。`--strict` 把 warning 视为失败。目录固定为 `<root>/.agents/decisions/`，脚本只读。`--help` / `-h` 显示帮助并返回 0，不扫描文件；未知参数或 `--root` 后缺少路径返回 2。路径以 `-` 开头时使用 `./` 前缀或绝对路径，避免被识别为选项。

| 退出码 | 含义 |
|---|---|
| 0 | 没有 error；普通模式可以有 warning |
| 1 | 存在 error，或 strict 模式存在 warning |
| 2 | 参数错误或脚本执行异常 |

诊断格式为 `相对路径:行号: error或warning 规则码 消息`，路径使用 `/`，按路径、行号和规则码排序，最后输出笔记数及错误、警告总数。

## Rule Contract

规则码用于定位问题和回归测试；Skill 无需重复规则码。
| 码 | 级别 | 规则 |
|---|---|---|
| D000 | error | `.agents/decisions/` 不存在，且 `.agents/skills/decision-notes/SKILL.md` 也不存在（通常表示 root 选错或 Skill 未完整接入） |
| D010 | error | 决策目录下有子目录,或有 `.md` 以外的文件(`.gitkeep` 除外) |
| D020 | error | 文件名不匹配 `^\d{4}-\d{2}-\d{2}-(proposed|accepted|rejected|superseded)-[a-z0-9]+(-[a-z0-9]+)*\.md$` |
| D021 | error | 文件名里的日期不是合法日历日期(如 2026-02-30) |
| D022 | error | 文件名里的状态词与头部 `Status` 不一致(如 `accepted-` 开头的文件写着 `Status: proposed`) |
| D030 | error | 第一行不是 `# Decision: <非空标题>` |
| D031 | error | 头部字段格式错误:未知 key、重复 key、key 大小写不对 |
| D040 | error | `Status` 缺失或不在枚举内 |
| D050 | error | 状态不是 `superseded` 时缺少 `Applies-To`,或值为空 |
| D051 | warning | `accepted` 的 `Applies-To` 没有匹配到任何仓库文件(可能已改名) |
| D052 | error | `accepted` 的 `Applies-To` 使用了不支持的 glob 语法(brace、字符集或取反)。该类模式被忽略,不参与 D051 匹配 |
| D060 | error | 二级标题不是恰好 `Context`、`Decision`、`Alternatives`、`Consequences` 按序各一次;或某章节正文为空 |
| D070 | error | `Alternatives` 既没有列表项,也不是合法的 `None` 写法 |
| D071 | error | `None` 备选没有链接到另一篇决策笔记 |
| D080 | error | `Consequences` 缺少 `- Positive: <非空>` 或 `- Negative: <非空>` |
| D090 | error | 相对链接指向的文件不存在 |
| D100 | error | `Status: superseded` 缺少 `Superseded-By`,或非 superseded 却带了 `Superseded-By` |
| D101 | error | `Superseded-By` 不是同目录合法文件名、文件不存在,或指向自己 |
| D102 | error | 取代链成环 |
| D103 | error | 取代链的终点不是 `accepted` |
| D110 | error | 代码里 `Decision: <file>.md` 注释指向的笔记不存在 |
| D111 | warning | 代码注释指向的笔记状态是 `superseded` 或 `rejected` |
| D112 | error | 代码里出现 `Decision:` 标记，但目标缺失或不是合法的决策笔记文件名 |
| D120 | warning | `proposed` 笔记创建已超过 14 天 |

## Workflow and Boundaries

1. 枚举决策目录的直接子项，按文件名排序。若 `.agents/decisions/` 不存在但 `.agents/skills/decision-notes/SKILL.md` 已安装，则视为当前有 0 篇笔记并通过；两者都不存在时报 D000，用于提示 root 可能选错或 Skill 未完整接入。空目录或只有 `.gitkeep` 时同样通过。
2. 解析每篇笔记的标题、连续头部字段和四个二级章节。允许 UTF-8 BOM。头部键区分大小写，字段值去除首尾空白；遇到空行或不匹配字段的行即结束头部。章节正文去掉 HTML 注释后不能空。
3. 检查文件名（日期、状态词、主题）、真实日历日期、文件名状态词与头部 `Status` 是否一致、状态、适用范围、章节及正负后果。备选包含列表，或用 `None` 并在 Alternatives 章节中链接另一篇实际存在的决策笔记。
4. 检查 Markdown 行内相对链接的目标存在性。忽略围栏、行内代码（反引号数量需配对）及 HTML 注释（含跨行），跳过 URL scheme 和纯锚点；本地链接移除 query/hash 后按笔记目录解析。不请求网络、不验证锚点、不支持引用式链接及完整 CommonMark 语法。围栏识别仅覆盖常见写法。链接目标含空格时整条被跳过（不报错），含未转义括号时会被截断并按截断结果报 D090；笔记里不要使用这两类路径。
5. 检查取代关系。`Superseded-By` 可带 `./`，只能指向同目录合法文件名，不能指向自己。允许 A → B → C，沿链检查环和 accepted 终点。目标非法或指向自己时只报 D101（该笔记不参与环检查），因此不会同时出现 D101 与 D102。
6. 获取仓库文件列表：优先使用 `git ls-files -z --cached --others --exclude-standard`；失败时递归遍历，跳过 `.git`、`node_modules`、`dist`、`build`、`coverage`、`.next`。非 Git 回退不解析 `.gitignore`，两种扫描范围可能不同。
7. 对 accepted 的 `Applies-To` 做近似匹配，排除决策目录本身。逗号分隔，只支持简单的 `*`、`**`、`?` 和普通路径；`*` / `?` 不跨 `/`，单独成段的 `**` 按完整路径段跨目录匹配（可匹配零个目录段）。含 brace、取反或字符集的模式报 D052 并被排除在匹配之外，因此一个模式不会同时触发 D052 和 D051。只有所有可解析的非全局项都未命中时才报 D051；这仍不是完整 glob 引擎，也不能保证每个路径仍有效。单独的 `project-wide` 不报此警告。
8. 扫描代码中独立注释行里的 `Decision:` 标记（允许裸行或常见的 `//`、`#`、`/*`、`*` 前缀），跳过 `.md`、`.mdx` 和整个 `.agents/`，跳过超过 1 MiB 或前 8 KiB 含 NUL 的文件。先识别标记，再校验目标语法：目标缺失或文件名格式非法报 D112；格式合法但目标不存在报 D110；指向 `superseded` / `rejected` 报 D111。该检查是文本匹配，不识别语言语法：字符串中的完整标记也会被检查。测试在运行时拼接虚构引用，避免测试源码本身被当成真实引用；不会全局豁免测试目录。扫描时不可读文件会被跳过，因此通过不代表每个文件都已读取。
9. proposed 的提醒基于文件名日期与当前时间，超过 14 天报 D120。普通模式下只是提醒，strict 模式也会因此失败。

校验不判断理由是否充分、结论是否最优、是否应该写笔记、时态或篇幅，也不自动修复、生成笔记或索引。

## Testing and Maintenance

用 `node:test` 启动真实 CLI，在临时目录构造输入并断言退出码、诊断码和必要的输出。提交变更前运行 `npm test` 与 `npm run verify-decisions -- --strict`；维护规则或 SKILL.md 行为约定时，同步更新规范、实现与测试，避免仅检查文案或代码形状。

现有回归覆盖有效笔记与空目录、命名与日期、文件名状态与头部不一致、字段（含行尾空白）、BOM/CRLF、章节、备选与后果、断链、围栏、行内代码与 HTML 注释、取代链与环（含自引用）、代码引用（含格式错误的 `Decision:` 标记）、失效路径、globstar 路径段语义与不支持的 glob 语法及 strict 模式、过期 proposed。CLI 缺目录、已安装 Skill 但尚无 decisions 目录、参数错误、替代根目录、无笔记目录时的帮助输出，以及 git 仓库下的文件枚举均有回归覆盖。这份覆盖清单同时是移植的验收基线：重实现应使用项目自己的测试框架覆盖同一批用例，并核对规则码、级别与退出码。

仓库自身使用 `.agents/decisions/` 下的自举决策笔记作为集成场景：测试全部通过后，再运行 `npm run verify-decisions -- --strict`，保证当前真实笔记、脚本与规则契约能够一起通过严格校验；空目录与“Skill 已安装但 decisions 目录尚不存在”的场景由回归测试单独覆盖。
