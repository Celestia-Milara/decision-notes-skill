# Decision: 状态词进入决策笔记文件名

Status: accepted
Applies-To: .agents/skills/decision-notes/**, verify-decisions-spec.md, scripts/verify-decisions.ts

## Context

决策笔记的生命周期（`proposed` / `accepted` / `rejected` / `superseded`）是检索时最先要判断的信息：Agent 找到一篇相关笔记后，紧接着要问的就是"它现在还有效吗"。状态只写在头部字段里时，只有打开文件才能知道；而 `ls` 一个目录、或在编辑器的文件树里扫一眼，看不到任何生命周期信息。上游的 DeepSeek Harness 把生命周期做成目录层级（`.agents/notes/{lifecycle}/{class}/...`）并用 gate 强制它与头部一致；本 skill 明确禁止子目录，因此只能把同一个信息压进文件名。

## Decision

文件名固定为 `YYYY-MM-DD-<status>-short-topic.md`：日期（首次创建日）、状态词、主题三段。状态词取值与头部 `Status` 相同，且必须完全一致（校验器 D022 强制）。目录列表因此可以直接读出哪些是现行决策、哪些只是提案、哪些已被否决。

代价是状态变化即重命名：`proposed` → `accepted`、`accepted` → `superseded` 都要改文件名，并同步修掉 `Superseded-By`、正文相对链接与代码里的 `Decision:` 反向指针。漏改由 D090 / D101 / D110 报出。

## Alternatives

- **状态只写在头部字段** — 最初采用的方案，实现成本为零、不需要重命名。未采用：检索时最关键的一个维度在文件系统层面不可见，Agent 必须打开每一篇候选笔记才能排除掉已否决或已被取代的那些。
- **状态做成目录层级** — 上游 DeepSeek Harness 的做法，`ls` 同样直观，而且状态迁移只移动文件、文件名不变，入站链接不会因为状态变化而失效。未采用：会引入子目录，与本 skill 的扁平目录决定直接冲突——扁平化的理由（轻量、Agent 一次扫完、分类交给 `Applies-To`）比"重命名省事"更重要。
- **文件名不写状态，另建索引文件** — 看似能兼顾"目录列表可见"和"不必重命名"。未采用：索引会变成需要与笔记同步维护的第二份真相，而笔记本身才是唯一事实来源。

## Consequences

- Positive: 生命周期在文件系统层面可见，`ls .agents/decisions/` 就能区分提案、现行与已失效的决策。
- Positive: 文件名与头部状态互为校验，D022 同时挡住"改了头部忘了改名"和"改了名忘了改头部"两类漂移。
- Negative: 每次状态转换都是一次重命名，扁平目录里所有入站引用（`Superseded-By`、正文链接、代码反向指针）都必须同时修正；链接检查是唯一防线，所以改状态后必须运行校验器。
- Negative: 文件名变长，日期与状态固定占掉前两个字段，主题需要更短，可读性让位于可检索性。
