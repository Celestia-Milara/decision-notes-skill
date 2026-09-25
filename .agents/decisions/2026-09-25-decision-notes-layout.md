# Decision: 决策笔记使用 .agents/decisions/ 扁平目录与日期命名

Status: proposed
Applies-To: .agents/skills/decision-notes/**, verify-decisions-spec.md, scripts/verify-decisions.ts

## Context

决策笔记的主要读者是下一个会话里的 Agent，而不是人。Agent 改代码前只有两个可靠的检索入口：代码里的反向指针，以及笔记头部的 `Applies-To` 路径。因此存放位置和命名方式直接决定了笔记能否被找到——如果 Agent 必须先猜一个目录或读懂序号才能判断相关性，检索就会退化成"随机翻阅"，等于没有检索。

## Decision

笔记集中放在仓库根的扁平目录 `.agents/decisions/`，不建子目录。文件名固定为 `YYYY-MM-DD-short-topic.md`，日期是首次创建日，主题用描述决策本身的小写英文 kebab-case。分类职责完全交给 `Applies-To`，不由目录结构承担。

校验器把这三点固化为硬约束：文件名必须匹配 `^\d{4}-\d{2}-\d{2}-...\.md$`（D020），日期必须是真实日历日期（D021），目录下出现子目录或非 `.md` 文件即报错（D010，`.gitkeep` 除外）。

## Alternatives

- **`docs/adr/`** — 社区最常见的 ADR 位置，看起来最"标准"，也便于人类按惯例找到。未采用：`docs/` 通常面向人类读者，而这里的笔记主要由 Agent 在动手前检索；放在 `.agents/` 下可以和 skill 目录同处一个命名空间，一次 `ls` 就能看到全部笔记。
- **按模块建子目录** — 看似能在笔记变多后降低翻阅成本。未采用：`Applies-To` 已经在表达"这篇管哪些路径"，再叠加一层目录会让分类出现两个真相来源；而且移动文件时子目录路径会变，增加 `Superseded-By` 和正文相对链接失效的机会。
- **序号命名（`0001-topic.md`）** — ADR 的常见做法，天然有序、改名少。未采用：没有索引文件时序号不携带任何语义，Agent 无法从文件名判断相关性；日期能同时表达先后与新鲜度，而这恰好是取代链和 `proposed` 超时提醒（D120）需要的信息。

## Consequences

- Positive: 检索入口唯一且明确——`Applies-To` 加代码里的 `Decision:` 反向指针，不需要额外索引或目录约定。
- Positive: 笔记与 skill 同在 `.agents/`，复制整个目录即可接入，不依赖目标项目的文档结构。
- Negative: 扁平目录意味着每次检索都是对全部笔记的线性扫描，规模上限较低；预计超过约 50 篇后需要重新评估（届时可考虑生成索引，但那会引入需要同步维护的第二份真相）。
- Negative: 日期命名无法表达同日多篇的先后，同一天创建两篇相关笔记时需要靠主题区分，避免让读者误判取代顺序。
