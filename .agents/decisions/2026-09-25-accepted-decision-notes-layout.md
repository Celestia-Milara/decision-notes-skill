# Decision: 决策笔记使用 .agents/decisions/ 扁平目录与日期命名

Status: accepted
Applies-To: .agents/skills/decision-notes/**, verify-decisions-spec.md, scripts/verify-decisions.ts

## Context

这套规则脱胎于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开发规则（其 Agent Notes 约定见该仓库的 `.agents/notes/README.md`），本仓库是它的轻量化版本，只保留"让下一个会话不再重复踩坑"所需的最小机制。决策笔记的主要读者是下一个会话里的 Agent，而不是人：Agent 改代码前只有两个可靠的检索入口，代码里的反向指针和笔记头部的 `Applies-To` 路径。因此存放位置和命名方式直接决定了笔记能否被找到——如果 Agent 必须先猜一个目录或读懂序号才能判断相关性，检索就会退化成"随机翻阅"，等于没有检索。

## Decision

笔记集中放在仓库根的扁平目录 `.agents/decisions/`，不建子目录，并且与面向人类读者的文档隔离。文件名固定为 `YYYY-MM-DD-<status>-short-topic.md`：日期是首次创建日，主题用描述决策本身的小写英文 kebab-case；状态词的位置与取值由 [状态词进入决策笔记文件名](./2026-09-25-accepted-status-in-filename.md) 决定，本篇只管目录形态与命名的时间维度。分类职责完全交给 `Applies-To`，不由目录结构承担。

校验器把这些固化为硬约束：文件名必须匹配 `^\d{4}-\d{2}-\d{2}-...\.md$`（D020），日期必须是真实日历日期（D021），目录下出现子目录或非 `.md` 文件即报错（D010，`.gitkeep` 除外）。

## Alternatives

- **`docs/adr/`** — 社区最常见的 ADR 位置，也便于人类按惯例找到。未采用：相对于"给下一个会话留护栏"这个目标太重，而且需要把 Agent 读的内容和人类读的文档隔开，混在 `docs/` 里会让两边的边界都变模糊。
- **按模块建子目录** — 看似能在笔记变多后降低翻阅成本。未采用：为了保持轻量。`Applies-To` 已经在表达"这篇管哪些路径"，再加一层目录就是第二个真相来源，Agent 还得先猜目录才能开始检索。
- **序号命名（`0001-topic.md`）** — ADR 的常见做法，天然有序、改名少。未采用：文件名需要同时体现时间与主题，让决策随项目推进的过程在目录列表里一眼可读；纯序号在没有索引文件时不携带任何信息，Agent 无法据此判断相关性和新鲜度。

## Consequences

- Positive: 检索入口唯一且明确——`Applies-To` 加代码里的 `Decision:` 反向指针，不需要额外索引或目录约定。
- Positive: 笔记与 skill 同在 `.agents/`，复制整个目录即可接入，不依赖目标项目的文档结构，也不会和人类文档混在一起。
- Negative: 扁平目录意味着每次检索都是对全部笔记的线性扫描，规模上限较低；预计超过约 50 篇后需要重新评估（届时可考虑生成索引，但那会引入需要同步维护的第二份真相）。
- Negative: 日期命名无法表达同日多篇的先后，同一天创建两篇相关笔记时需要靠主题区分，避免让读者误判取代顺序。
