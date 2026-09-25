# Decision: 自研单文件校验器，而不是复用现成 ADR 工具

Status: proposed
Applies-To: scripts/verify-decisions.ts, package.json, .github/workflows/verify.yml

## Context

笔记的结构性错误（文件名不合规、缺 `Applies-To`、章节缺失、断链、取代链成环）是机械可检的，靠人工 review 一定会漏。同时这个仓库的定位是"可整目录复制进任意项目"的模板，因此校验器不能把目标项目绑死在某个生态上：Skill 本身不要求 Node.js，校验器只是可选项。

## Decision

自研单文件 TypeScript 校验器 `scripts/verify-decisions.ts`。业务代码只使用 Node 内置模块，不引入解析库；执行依赖 `tsx`（因此是"无额外解析库"，不是"运行时零依赖"）。脚本只读，不修改任何文件；退出码 0/1/2 分别表示通过、存在 error、参数或运行时错误，`--strict` 把 warning 也视为失败。

## Alternatives

- **adr-tools 或同类现成工具** — 功能最接近，省去自己维护。未采用：它们的目录布局、命名序号和"已取代"表达方式都有自己的约定，与本 skill 的格式契约不一致，等于让工具反过来决定规则；而且会把目标项目绑到 Node/Ruby 生态。
- **markdownlint 加自定义规则** — 看起来最省事，复用成熟的 Markdown 解析。未采用：它能表达"标题顺序"这类局部规则，但表达不了取代链、`Superseded-By` 指向和跨文件链接闭环；且需要理解其规则引擎与插件接口，学习成本不低于直接写 200 行。
- **把校验写成测试用例** — 复用现有测试框架，看起来最轻。未采用：与"校验器是可选工具"的定位冲突——不接入 Node 的项目也应该能只复制 Skill 使用。
- **只靠人工 review** — 成本最低的起点。未采用：链接与取代链的错误在 review 里几乎不可见，而它们正是笔记腐烂的主要形式。

## Consequences

- Positive: 规则与实现同处一个仓库，改规则时可以同时改实现、spec 和测试，不会出现"工具行为与文档打架"。
- Positive: 诊断带稳定规则码（D000–D120），可以被测试断言，也可以被人直接引用到 issue 里。
- Negative: 需要自己维护 glob 近似匹配和 Markdown 解析，已识别的脆弱边界包括 HTML 注释、行内代码、多反引号与行尾空白；每加一条规则都要同步实现、spec 与回归测试三处。
- Negative: 解析是逐行加正则的有限实现，不是完整 Markdown 解析器，因此对引用式链接等写法只能选择明确不支持（spec 已声明）。
