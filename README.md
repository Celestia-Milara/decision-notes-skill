# Decision Notes

用于记录代码和测试无法表达的设计意图、架构边界、跨模块契约、重要技术选型，以及被明确否决的方案。

它不是 ADR 生成器，也不要求每次改动都写文档。Agent 会先检索已有约束，只在未来维护者可能误删、误改或重复讨论某项设计时维护决策笔记。

这个 Skill 参考了 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Agent Notes 开发约定，是它的轻量化版本：只保留「让下一个会话不再重复踩坑」所需的最小机制，用扁平目录与文件名状态词取代上游的目录层级和强制门禁。

设计目的是，方便小团队/多个不同agent 开发项目。

## Quick Start

1. 将 `template/` 目录的内容复制到目标项目根目录。不要复制整个仓库：根目录还包含本仓库自用的 README、LICENSE 和自举决策笔记（见 Repository Layout）。
2. 将 `AGENTS.example.md` 重命名为 `AGENTS.md`；如果项目已有 `AGENTS.md`，只合并其中的“决策笔记”段落。
3. 根据目标项目填写 `AGENTS.md` 中的项目概况、目录和命令，只保留实际存在的条目，删除所有占位项。
4. 运行 `npm ci` 安装校验器所需的开发依赖（`package-lock.json` 已随 `template/` 复制）。
5. 开始开发。`.agents/decisions/` 可以保持为空，首次确有决策需要记录时再新增笔记。

> 目标项目不是 Node.js 项目时，不必为了使用 Skill 引入 Node.js；可以删除 `scripts/`、`package.json` 和 `package-lock.json`，以及 `AGENTS.md` 中校验相关的条目，让 agent 阅读 [verify-decisions-spec.md](verify-decisions-spec.md) 使用项目语言生成等效的校验脚本。

## Repository Layout

```text
template/                          新项目所需的全部文件，接入时复制这个目录
.agents/
  decisions/                       本仓库自身的决策笔记（现有 5 篇自举笔记）
  skills/decision-notes/SKILL.md   Skill 的完整工作规则
scripts/
  verify-decisions.ts              可选的只读校验器
  verify-decisions.test.ts         校验器回归测试
.github/workflows/verify.yml       CI：npm test、严格校验与 template/ 同步检查
.gitignore / .gitattributes        忽略依赖与缓存、统一 LF
AGENTS.example.md                  目标项目的协作说明模板
verify-decisions-spec.md           校验规则与维护说明
package.json / package-lock.json   校验器命令与开发依赖
```

`.agents/decisions/` 下的笔记是本仓库用自己的格式记录自己的设计决策（自举笔记），属于仓库内容而不属于模板：它们不在 `template/` 里，复制 `template/` 不会把它们带进目标项目。SKILL.md、校验器、spec、AGENTS 模板等文件在根目录与 `template/` 各有一份同步副本，修改时必须两侧同改，CI 会逐文件 diff 兜底；两个 `verify.yml` 有意相差一个同步检查步骤。

## How It Works

接入后无需人工参与。开发或评审时，Agent 按 [.agents/skills/decision-notes/SKILL.md](.agents/skills/decision-notes/SKILL.md) 的规则工作：

- 修改已有代码前，先检索相关约束：全局决策、`Applies-To` 路径匹配、代码里的 `Decision:` 反向指针。
- 用 `proposed` / `accepted` / `rejected` / `superseded` 四种状态区分提案、现行决策、被否决与被取代的方案，保留仍有参考价值的历史选择。
- 只记录“为什么”和不能破坏的边界，不把笔记写成工作日志、任务清单或 PR 描述。
- 决策笔记与对应代码在同一次变更中交付。

这些规则只写在 SKILL.md 一个文件里（根目录与 `template/` 各一份同步副本），项目差异放进目标项目的 `AGENTS.md` 即可；除非要改变决策笔记的格式或工作流，否则不需要修改 Skill。

当前设计面向笔记数量在 50 篇以内的仓库：检索是全目录扫描，不生成索引；超过这个规模需要先解决检索方式，而不是继续往扁平目录里堆笔记。

## Using the Validator

要求 Node.js 22 或更高版本：

```sh
npm ci
npm run verify-decisions
npm test
```

严格模式会将 warning 也视为失败：

```sh
npm run verify-decisions -- --strict
```

校验器只读取文件，检查笔记结构、路径、链接、取代关系和代码反向指针，不判断技术决策本身是否正确。完整契约见 [verify-decisions-spec.md](verify-decisions-spec.md)。

## License

[MIT](LICENSE)
