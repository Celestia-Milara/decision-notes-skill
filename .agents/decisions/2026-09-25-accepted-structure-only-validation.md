# Decision: 校验器只校验结构与引用，不判断内容

Status: accepted
Applies-To: scripts/verify-decisions.ts, verify-decisions-spec.md, package.json

## Context

笔记的价值在于理由是否成立，而"理由是否成立"无法机械判定。一旦让校验器去评判内容质量——篇幅是否够、有没有写成工作日志、备选是不是编的——作者就会为了通过校验而填模板，这恰好是 skill 第 5 节警告的失败模式：靠机械指标逼出来的正文没有决策信息，却让笔记看起来合规。

## Decision

校验器的职责边界固定为：文件名与日期、头部字段、四个章节的结构与正文非空、相对链接可达、取代关系与环路、代码反向指针、`Applies-To` 是否仍匹配、`proposed` 是否超期。它不判断理由是否充分、结论是否最优、是否应该写笔记、时态或篇幅，也不自动修复、不生成笔记、不生成索引。校验通过不代表设计理由正确，这一点在 spec 中明确声明。

## Alternatives

None — 这是 [自研单文件校验器](./2026-09-25-accepted-self-hosted-validator.md) 的范围边界，没有单独评估过备选方案。

## Consequences

- Positive: 校验通过不为内容质量背书，作者不需要为凑指标编造备选或代价；spec 把这条边界写成了对使用者的承诺。
- Positive: 校验过程离线、确定、可复现，CI 的成败只取决于仓库内容，不取决于模型或网络。
- Negative: 结构合法但内容空洞的笔记会通过，没有任何自动手段能阻止"写一篇没有信息的笔记"，只能依赖 skill 的写作规则和人工评审。
- Negative: 不生成索引意味着检索成本随笔记数量线性增长，规模上限由 [决策笔记的存放位置](./2026-09-25-accepted-decision-notes-layout.md) 承担。
